import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
test('solo: random pools, locked stages, persistence, ownership, rewards, duplicate/CAS and deadline', async () => {
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
      run: async (s, ...v) => ({ meta: { changes: db.prepare(s).run(...v).changes } }),
    };
    const cache = new Map();
    function stub(name, text) {
      const p = join(dir, name + '.mjs');
      writeFileSync(p, text);
      return pathToFileURL(p).href;
    }
    const stubs = {
      '@/lib/store': stub('store', 'export const {one,run}=globalThis.__soloStore;'),
      '@/lib/account': stub(
        'account',
        `export const accountId=r=>r.headers.get('test-user'),guestToken=()=>'',tokenHash=async t=>t;`,
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
    const route = await import(compile('app/api/solo/route.ts'));
    const logic = await import(compile('lib/solo.ts'));
    const words = await import(compile('lib/solo-words.ts'));
    for (const stage of logic.STAGES) {
      assert(words.soloPool(stage).length > 20);
      const pool = words.soloPool(stage);
      assert(!pool.slice(0, 20).includes(words.chooseSoloWord(stage, pool.slice(0, 20))));
    }
    const get = async (user = 'one') =>
      (
        await route.GET(new Request('https://test/api/solo', { headers: { 'test-user': user } }))
      ).json();
    const post = async (body, user = 'one', compact = false) => {
      const r = await route.POST(
        new Request('https://test/api/solo', {
          method: 'POST',
          headers: { 'test-user': user, ...(compact ? { 'X-Solo-Catalog': 'omit' } : {}) },
          body: JSON.stringify(body),
        }),
      );
      return { status: r.status, data: await r.json() };
    };
    assert.equal((await get()).unlocked, 1);
    assert.deepEqual((await get()).stages, logic.STAGES);
    assert.equal((await post({ action: 'start', stage: 2 })).status, 403);
    let result = await post({ action: 'start', stage: 1 });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.stages, logic.STAGES);
    assert.equal(result.data.active.answer, undefined);
    let id = result.data.active.id;
    assert.equal((await get()).active.id, id);
    assert.equal(
      (await post({ action: 'guess', runId: id, expected: 0, word: 'ㄱㄱㄱㄱㄱ' })).status,
      400,
    );
    assert.equal((await get()).active.guesses.length, 0);
    assert.equal(
      (await post({ action: 'guess', runId: id, expected: 0, word: '사과' }, 'two')).status,
      409,
    );
    let stored = JSON.parse(
        db.prepare('SELECT state FROM solo_progress WHERE owner=?').get('account:one').state,
      ),
      answer = stored.active.answer;
    const results = await Promise.all([
      post({ action: 'guess', runId: id, expected: 0, word: answer }),
      post({ action: 'guess', runId: id, expected: 0, word: answer }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    let view = await get();
    assert.equal(view.xp, 90);
    assert.equal(view.unlocked, 2);
    assert.equal(view.active.answer, answer);
    result = await post({ action: 'start', stage: 1, previousId: id });
    id = result.data.active.id;
    stored = JSON.parse(
      db.prepare('SELECT state FROM solo_progress WHERE owner=?').get('account:one').state,
    );
    assert.notEqual(stored.active.answer, answer);
    await post({ action: 'guess', runId: id, expected: 0, word: stored.active.answer });
    assert.equal((await get()).xp, 90);
    // Seed a legitimately unlocked timed stage, then exercise real server expiry.
    stored = JSON.parse(
      db.prepare('SELECT state FROM solo_progress WHERE owner=?').get('account:one').state,
    );
    stored.best = { 1: 3, 2: 3, 3: 3 };
    db.prepare('UPDATE solo_progress SET state=? WHERE owner=?').run(
      JSON.stringify(stored),
      'account:one',
    );
    result = await post({ action: 'start', stage: 4, previousId: id });
    id = result.data.active.id;
    assert.equal(result.data.active.endsAt - now, 180000);
    now += 180001;
    assert.equal((await get()).active.status, 'timeout');
    assert.equal(
      (await post({ action: 'guess', runId: id, expected: 0, word: '사과' })).status,
      409,
    );
    assert.equal((await post({ action: 'start', stage: 4, previousId: id })).status, 200);
    assert.equal((await get('two')).xp, 0);
    let compact = await post({ action: 'start', stage: 1 }, 'compact', true);
    assert.equal(compact.status, 200);
    assert.equal(Object.hasOwn(compact.data, 'stages'), false);
    const compactId = compact.data.active.id;
    const compactAnswer = JSON.parse(
      db.prepare('SELECT state FROM solo_progress WHERE owner=?').get('account:compact').state,
    ).active.answer;
    compact = await post(
      { action: 'guess', runId: compactId, expected: 0, word: compactAnswer },
      'compact',
      true,
    );
    assert.equal(compact.status, 200);
    assert.equal(Object.hasOwn(compact.data, 'stages'), false);
    const restored = await get('compact');
    assert.deepEqual(restored.stages, logic.STAGES);
    assert.deepEqual(restored.active, compact.data.active);
    assert.equal(restored.xp, compact.data.xp);
    assert.equal(restored.unlocked, compact.data.unlocked);
    const savedBytes =
      Buffer.byteLength(JSON.stringify(restored)) - Buffer.byteLength(JSON.stringify(compact.data));
    assert(savedBytes > 1000);
    console.log(`Solo catalog omitted: ${savedBytes} uncompressed bytes per successful POST`);
    compact = await post({ action: 'start', stage: 1, previousId: compactId }, 'compact', true);
    compact = await post({ action: 'abandon', runId: compact.data.active.id }, 'compact', true);
    assert.equal(compact.status, 200);
    assert.equal(compact.data.active.status, 'abandoned');
    assert.equal(Object.hasOwn(compact.data, 'stages'), false);

    const guest = await route.GET(new Request('https://test/api/solo'));
    assert(guest.headers.get('set-cookie').includes('HttpOnly'));
    assert.equal((await guest.json()).signedIn, false);
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((n) => logic.starsFor(n, 6)),
      [3, 3, 3, 2, 2, 1],
    );
    const sample = logic.emptySolo();
    sample.active = {
      id: 'x',
      stage: 8,
      answer: '사과',
      startedAt: now,
      endsAt: null,
      status: 'playing',
      guesses: [],
      stars: 0,
    };
    for (let i = 0; i < 3; i++) logic.finishSoloGuess(sample, ['ㄴ', 'ㄴ', 'ㄴ', 'ㄴ', 'ㄴ'], now);
    assert.equal(sample.active.status, 'lost');
    assert.equal(sample.xp, 0);
    const improve = logic.emptySolo();
    improve.best = { 1: 1 };
    improve.xp = 50;
    improve.active = {
      id: 'y',
      stage: 1,
      answer: '사과',
      startedAt: now,
      endsAt: null,
      status: 'playing',
      guesses: [],
      stars: 0,
    };
    logic.finishSoloGuess(improve, ['ㅅ', 'ㅏ', 'ㄱ', 'ㅗ', 'ㅏ'], now);
    assert.equal(improve.xp, 90);
  } finally {
    Date.now = realNow;
    db.close();
    rmSync(dir, { recursive: true, force: true });
    delete globalThis.__soloStore;
  }
});
