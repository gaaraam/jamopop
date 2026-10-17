import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
test('admin authorization, private fields, pagination, solo history and non-destructive migration', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'bw-admin-'));
  try {
    for (const f of readdirSync('drizzle')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    globalThis.__adminDB = db;
    writeFileSync(
      join(dir, 'store.mjs'),
      `export const one=async(s,...v)=>globalThis.__adminDB.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__adminDB.prepare(s).all(...v);`,
    );
    writeFileSync(
      join(dir, 'account.mjs'),
      `import{createHash}from'node:crypto';export const isSiteAdmin=r=>r.headers.get('test-admin')==='yes';export const tokenHash=async v=>createHash('sha256').update(v).digest('hex');`,
    );
    const source = ts
      .transpileModule(readFileSync('app/api/admin/route.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replace('@/lib/account', './account.mjs')
      .replace('@/lib/store', './store.mjs');
    writeFileSync(join(dir, 'route.mjs'), source);
    const { GET } = await import(pathToFileURL(join(dir, 'route.mjs')));
    const req = (query = '', admin = true) =>
      GET(
        new Request('https://site/api/admin' + query, {
          headers: admin ? { 'test-admin': 'yes' } : {},
        }),
      );
    assert.equal((await req('', false)).status, 403);
    assert.equal((await req('?view=bad')).status, 400);
    const now = Date.now();
    db.prepare('INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?)').run(
      'owner-secret',
      '테스트회원',
      '🐱',
      now,
    );
    db.prepare('INSERT INTO solo_progress VALUES(?,?,?)').run(
      'account:owner-secret',
      JSON.stringify({ active: null, xp: 90 }),
      0,
    );
    const first = {
      id: 'run1',
      stage: 1,
      status: 'won',
      guesses: [{}],
      stars: 3,
      startedAt: now,
      endsAt: null,
    };
    db.prepare('UPDATE solo_progress SET state=?').run(JSON.stringify({ active: first, xp: 90 }));
    db.prepare('UPDATE solo_progress SET state=?').run(
      JSON.stringify({
        active: { ...first, id: 'run2', status: 'playing', guesses: [], stars: 0, endsAt: now - 1 },
        xp: 90,
      }),
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM solo_runs').get().n, 2);
    assert.equal(db.prepare("SELECT status FROM solo_runs WHERE id='run1'").get().status, 'won');
    for (const view of ['users', 'rooms', 'records']) {
      const r = await req('?view=' + view);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('cache-control'), 'private, no-store');
      const d = await r.json();
      assert.equal(d.summary.solo, 2);
      assert.equal(d.summary.wins, 1);
      assert.equal(d.summary.users, 1);
      assert(!JSON.stringify(d).includes('owner-secret'));
      if (view === 'records') {
        assert(d.rows.some((x) => x.status === 'timeout'));
        assert(d.rows.some((x) => x.status === 'won'));
      }
    }
    assert.equal((await (await req('?q=없는이름')).json()).rows.length, 0);
    for (let i = 0; i < 51; i++)
      db.prepare('INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?)').run(
        'user' + i,
        '회원' + i,
        '🐱',
        now,
      );
    const firstPage = await (await req()).json();
    assert.equal(firstPage.rows.length, 50);
    assert.equal(firstPage.nextOffset, 50);
    const second = await (await req('?offset=50')).json();
    assert.equal(second.rows.length, 2);
    assert.equal(second.nextOffset, null);
    // A failed optimistic write must not create or alter an audit record.
    db.prepare('UPDATE solo_progress SET state=? WHERE revision=999').run(
      JSON.stringify({ active: { ...first, id: 'rejected' } }),
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM solo_runs WHERE id='rejected'").get().n, 0);
  } finally {
    db.close();
    delete globalThis.__adminDB;
    rmSync(dir, { recursive: true, force: true });
  }
});
