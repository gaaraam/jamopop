import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
test('admin user directory groups Google profiles, filters guests and protects private fields', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'jamopop-users-'));
  try {
    for (const f of readdirSync('drizzle')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    globalThis.__usersDB = db;
    writeFileSync(
      join(dir, 'store.mjs'),
      `export const one=async(s,...v)=>globalThis.__usersDB.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__usersDB.prepare(s).all(...v);`,
    );
    writeFileSync(
      join(dir, 'account.mjs'),
      `import{createHash}from'node:crypto';export const isSiteAdmin=r=>r.headers.get('test-admin')==='yes';export const tokenHash=async v=>createHash('sha256').update(v).digest('hex');export const accountProgressions=async()=>new Map();`,
    );
    writeFileSync(
      join(dir, 'route.mjs'),
      ts
        .transpileModule(readFileSync('app/api/admin/users/route.ts', 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        .outputText.replace('@/lib/account', './account.mjs')
        .replace('@/lib/store', './store.mjs'),
    );
    const { GET } = await import(pathToFileURL(join(dir, 'route.mjs'))),
      req = (q = '', admin = true) =>
        GET(
          new Request('https://test/api/admin/users' + q, {
            headers: admin ? { 'test-admin': 'yes' } : {},
          }),
        ),
      now = Date.now();
    assert.equal((await req('', false)).status, 403);
    assert.equal((await req('?kind=invalid')).status, 400);
    db.prepare(
      'INSERT INTO google_accounts(subject,game_account_id,email,name,created_at,last_login_at) VALUES(?,?,?,?,?,?)',
    ).run('secret-subject', 'google-game', 'private@test.invalid', '구글', now, now);
    for (const [id, name] of [
      ['google-game', '구글'],
      ['legacy-game', '이전닉'],
    ]) {
      db.prepare('INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?)').run(
        id,
        name,
        '🐱',
        now,
      );
      db.prepare(
        'INSERT INTO linked_game_accounts(account_id,subject,label,linked_at) VALUES(?,?,?,?)',
      ).run(id, 'secret-subject', name, now);
    }
    db.prepare('INSERT INTO legacy_link_receipts VALUES(?,?,?,?)').run(
      'secret-ticket',
      'legacy-game',
      'secret-subject',
      now,
    );
    db.prepare('INSERT INTO rooms(id,name,host_id,created_at) VALUES(?,?,?,?)').run(
      'room',
      '테스트 방',
      'm',
      now,
    );
    db.prepare(
      'INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen) VALUES(?,?,?,?,?,?)',
    ).run('guest', 'room', 'secret-cookie', '게스트닉', '🦊', now);
    db.prepare('INSERT INTO solo_progress VALUES(?,?,?)').run(
      'account:legacy-game',
      JSON.stringify({
        xp: 90,
        best: { 1: 3 },
        active: {
          id: 'solo',
          stage: 2,
          status: 'playing',
          answer: '비밀정답',
          guesses: [],
          startedAt: now,
        },
      }),
      0,
    );
    const response = await req(),
      data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.total, 2);
    assert.equal(data.summary.google, 1);
    assert.equal(data.summary.linked, 1);
    assert.equal(data.summary.guest, 1);
    const google = data.rows.find((x) => x.kind === 'google');
    assert.equal(google.profiles, 2);
    assert.equal((await (await req('?kind=guest')).json()).total, 1);
    assert.equal((await (await req('?link=linked')).json()).total, 1);
    const detail = await (await req('?key=' + google.userKey)).json();
    assert.equal(detail.profiles.length, 2);
    assert.equal(detail.solo[0].cleared, 1);
    assert.equal(detail.links.length, 2);
    for (const secret of [
      'secret-subject',
      'secret-cookie',
      'private@test.invalid',
      'secret-ticket',
      '비밀정답',
    ])
      assert(!JSON.stringify([data, detail]).includes(secret));
    assert.equal((await req('?key=missing')).status, 404);
    assert.equal((await req('?key=' + google.userKey, false)).status, 403);
    assert.equal((await (await req('?q=' + google.userKey)).json()).total, 1);
  } finally {
    db.close();
    delete globalThis.__usersDB;
    rmSync(dir, { recursive: true, force: true });
  }
});
