import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
test('daily: shared puzzle, private records, retry/CAS, expiry and spoiler-free share', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'bw-solo-'));
  const realNow = Date.now;
  let now = 2000000000000;
  Date.now = () => now;
  try {
    for (const f of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      db.exec(readFileSync(join('drizzle', f), 'utf8'));
    globalThis.__soloStore = {
      one: async (s, ...v) => db.prepare(s).get(...v) || null,
      all: async (s, ...v) => db.prepare(s).all(...v),
      run: async (s, ...v) => ({ meta: { changes: db.prepare(s).run(...v).changes } }),
    };
    const cache = new Map();
    function stub(name, text) {
      const p = join(dir, name + '.mjs');
      writeFileSync(p, text);
      return pathToFileURL(p).href;
    }
    const stubs = {
      '@/lib/solo-words': stub(
        'words',
        `let n=0;export const chooseSoloWord=()=>n++%2?'사과':'바람';`,
      ),
      '@/lib/store': stub('store', 'export const {one,all,run}=globalThis.__soloStore;'),
      '@/lib/account': stub(
        'account',
        `export const accountId=r=>r.headers.get('test-user'),guestToken=r=>r.headers.get('cookie')?.split('bw_session=')[1]?.split(';')[0]||'',tokenHash=async t=>t;`,
      ),
      '@/lib/guess-dictionary': stub(
        'dict',
        `export const acceptsGuess=x=>x.join('')!=='ㄱㄱㄱㄱㄱ';`,
      ),
    };
    function compile(path) {
      path = resolve(path);
      if (cache.has(path)) return cache.get(path);
      const url = pathToFileURL(join(dir, 'module' + cache.size + '.mjs')).href;
      cache.set(path, url);
      let code = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      code = code.replace(/from ['"]([^'"]+)['"]/g, (all, s) => {
        const to =
          stubs[s] ||
          compile(s.startsWith('@/') ? s.slice(2) + '.ts' : resolve(dirname(path), s + '.ts'));
        return `from '${to}'`;
      });
      writeFileSync(new URL(url), code);
      return url;
    }
    const route = await import(compile('app/api/daily/route.ts'));
    const logic = await import(compile('lib/daily.ts'));
    const get = async (user = 'one') =>
      (
        await route.GET(new Request('https://test/api/daily', { headers: { 'test-user': user } }))
      ).json();
    const post = async (body, user = 'one', extra = {}) => {
      const r = await route.POST(
        new Request('https://test/api/daily', {
          method: 'POST',
          headers: { 'test-user': user, ...extra },
          body: JSON.stringify(body),
        }),
      );
      return { status: r.status, data: await r.json() };
    };
    now = Date.parse('2026-10-17T14:59:00Z');
    const [a, b] = await Promise.all([get(), get('two')]);
    assert.equal(a.day, '2026-10-17');
    assert.equal(a.day, b.day);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_puzzles').get().n, 1);
    assert.equal(a.answer, undefined);
    assert.deepEqual(a.guesses, []);
    assert.equal(a.resetsAt, Date.parse('2026-10-17T15:00:00Z'));
    assert.equal(logic.dailyShare(a), '');
    const request = { day: a.day, expected: 0, word: 'ㄱㄱㄱㄱㄱ' };
    assert.equal((await post(request)).status, 400);
    assert.equal(
      (await post({ ...request, word: '바람' }, 'one', { origin: 'https://evil.test' })).status,
      403,
    );
    assert.equal((await post({ ...request, day: '2026-10-16', word: '바람' })).status, 409);
    const answer = db.prepare('SELECT answer FROM daily_puzzles WHERE day=?').get(a.day).answer;
    const results = await Promise.all([
      post({ ...request, word: answer }),
      post({ ...request, word: answer }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    const winner = results.find((r) => r.status === 200).data;
    assert.equal(winner.status, 'won');
    assert.equal(winner.answer, answer);
    assert.equal(winner.guesses.length, 1);
    assert.deepEqual((await get()).guesses, winner.guesses);
    assert.equal((await get('two')).status, 'playing');
    assert.equal((await get('two')).answer, undefined);
    const share = logic.dailyShare(winner);
    assert(share.includes('🟩🟩🟩🟩🟩'));
    assert(!share.includes(answer));
    assert(!share.includes('one'));
    assert(share.endsWith('/daily'));
    const wrong = answer === '바람' ? '사과' : '바람';
    for (let i = 0; i < 5; i++) {
      const r = await post({ day: a.day, expected: i, word: wrong }, 'two');
      assert.equal(r.status, 200);
      assert.equal(r.data.status, i === 4 ? 'lost' : 'playing');
      assert.equal(r.data.answer, i === 4 ? answer : undefined);
    }
    assert.equal((await post({ day: a.day, expected: 5, word: answer }, 'two')).status, 409);
    assert(logic.dailyShare(await get('two')).includes('X/5'));
    now = a.resetsAt;
    assert.equal((await post({ ...request, word: answer })).status, 409);
    const next = await get();
    assert.equal(next.day, '2026-10-18');
    assert.equal(next.guesses.length, 0);
    assert.equal(
      db.prepare('SELECT status FROM daily_plays WHERE owner=? AND day=?').get('account:one', a.day)
        .status,
      'won',
    );
    const guest = await route.GET(new Request('https://test/api/daily'));
    assert(guest.headers.get('set-cookie').includes('HttpOnly'));
    const cookie = guest.headers.get('set-cookie').split(';')[0];
    const guestView = await guest.json();
    const guestAnswer = db
      .prepare('SELECT answer FROM daily_puzzles WHERE day=?')
      .get(guestView.day).answer;
    const r = await route.POST(
      new Request('https://test/api/daily', {
        method: 'POST',
        headers: { cookie },
        body: JSON.stringify({ day: guestView.day, word: guestAnswer, expected: 0 }),
      }),
    );
    assert.equal(r.status, 200);
    assert.equal(
      (
        await (
          await route.GET(new Request('https://test/api/daily', { headers: { cookie } }))
        ).json()
      ).status,
      'won',
    );
    assert.equal((await get()).status, 'playing');
  } finally {
    Date.now = realNow;
    db.close();
    delete globalThis.__soloStore;
    rmSync(dir, { recursive: true, force: true });
  }
});
