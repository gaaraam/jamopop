import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
test('room invitations: consent, recipient authorization, expiry, moderation, cooldown and safe retry', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'invitations-'));
  try {
    for (const f of readdirSync('drizzle')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    globalThis.__inviteDB = db;
    const urls = {};
    const stub = (n, s) => {
      const p = join(dir, n + '.mjs');
      writeFileSync(p, s);
      return pathToFileURL(p).href;
    };
    const compile = (f, n) => {
      let s = ts.transpileModule(readFileSync(f, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      for (const [a, b] of Object.entries(urls)) s = s.replaceAll(`'${a}'`, JSON.stringify(b));
      return stub(n, s);
    };
    urls['@/lib/store'] = stub(
      'store',
      `export const one=async(s,...v)=>globalThis.__inviteDB.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__inviteDB.prepare(s).all(...v);export const run=async(s,...v)=>({meta:{changes:globalThis.__inviteDB.prepare(s).run(...v).changes}});`,
    );
    urls['@/lib/account'] = stub('account', `export const accountId=r=>r.headers.get('user');`);
    urls['@/lib/room-invitations'] = compile('lib/room-invitations.ts', 'inbox');
    urls['@/app/api/game/route'] = stub(
      'game',
      `export async function POST(r){globalThis.__inviteJoin={user:r.headers.get('user'),body:await r.json()};return Response.json({roomId:'room'},{headers:{'set-cookie':'bw_session=test; HttpOnly'}})}`,
    );
    const api = await import(compile('app/api/invitations/route.ts', 'api')),
      now = Date.now();
    db.prepare('INSERT INTO rooms(id,name,host_id,created_at,invite_code) VALUES(?,?,?,?,?)').run(
      'room',
      '테스트 방',
      'a',
      now,
      'invite-key',
    );
    for (const [id, owner] of [
      ['a', 'A'],
      ['b', 'B'],
    ]) {
      db.prepare(
        'INSERT INTO members(id,room_id,token_hash,account_id,name,avatar,last_seen) VALUES(?,?,?,?,?,?,?)',
      ).run(id, 'room', id, owner, owner, '🐱', now);
      db.prepare('INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?)').run(
        owner,
        owner,
        '🐱',
        now,
      );
    }
    db.prepare("INSERT INTO friendships VALUES('friend','A','B','pending',?,?)").run(now, now);
    const req = (u, b) =>
      new Request('https://test/api/invitations', {
        method: b ? 'POST' : 'GET',
        headers: { ...(u ? { user: u } : {}), origin: 'https://test' },
        ...(b ? { body: JSON.stringify(b) } : {}),
      });
    const post = (u, b) => api.POST(req(u, b)),
      inbox = async (u) => (await api.GET(req(u))).json();
    const send = { action: 'send', id: 'friend', room: 'room' };
    assert.equal((await post(null, send)).status, 401);
    assert.equal((await post('A', send)).status, 403);
    db.prepare("UPDATE friendships SET status='accepted'").run();
    assert.equal((await post('C', send)).status, 403);
    assert.equal((await post('A', { ...send, room: 'other' })).status, 403);
    assert.equal(
      (
        await api.POST(
          new Request('https://test/api/invitations', {
            method: 'POST',
            headers: { user: 'A', origin: 'https://evil' },
            body: JSON.stringify(send),
          }),
        )
      ).status,
      403,
    );
    assert.equal((await post('A', send)).status, 200);
    assert.equal((await post('A', send)).status, 429);
    let b = await inbox('B');
    assert.equal(b.items.length, 1);
    assert.equal(b.items[0].roomName, '테스트 방');
    assert.equal((await inbox('A')).items.length, 0);
    assert.equal((await inbox('C')).items.length, 0);
    assert(!JSON.stringify(b).includes('recipient'));
    const id = b.items[0].id;
    assert.equal((await post('C', { action: 'join', id })).status, 410);
    await post('C', { action: 'dismiss', id });
    assert.equal((await inbox('B')).items.length, 1);
    db.prepare('UPDATE rooms SET archived_at=?').run(now);
    assert.equal((await inbox('B')).items.length, 0);
    assert.equal((await post('B', { action: 'join', id })).status, 410);
    db.prepare('UPDATE rooms SET archived_at=NULL').run();
    db.prepare("UPDATE members SET blocked=1 WHERE id='b'").run();
    assert.equal((await inbox('B')).items.length, 0);
    assert.equal((await post('B', { action: 'join', id })).status, 410);
    assert.equal((await post('A', send)).status, 403);
    db.prepare("UPDATE members SET blocked=0 WHERE id='b'").run();
    db.prepare("UPDATE friendships SET status='declined'").run();
    assert.equal((await inbox('B')).items.length, 0);
    assert.equal((await post('B', { action: 'join', id })).status, 410);
    db.prepare("UPDATE friendships SET status='accepted'").run();
    db.prepare('UPDATE room_invitations SET expires_at=?').run(now - 1);
    assert.equal((await inbox('B')).items.length, 0);
    assert.equal((await post('B', { action: 'join', id })).status, 410);
    db.prepare('UPDATE room_invitations SET expires_at=?').run(now + 600000);
    const joined = await post('B', { action: 'join', id });
    assert.equal(joined.status, 200);
    assert.equal((await joined.json()).url, '/?r=room');
    assert.equal((await inbox('B')).items.length, 0);
    assert.equal(
      (await post('B', { action: 'join', id })).status,
      200,
      'retry after lost response is safe',
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM members').get().n, 2);
    db.prepare("DELETE FROM members WHERE id='b'").run();
    const firstJoin = await post('B', { action: 'join', id });
    assert.equal(firstJoin.status, 200);
    assert.equal(firstJoin.headers.get('set-cookie'), 'bw_session=test; HttpOnly');
    assert.equal(globalThis.__inviteJoin.user, 'B');
    assert.equal(globalThis.__inviteJoin.body.room, 'invite-key');
    assert.equal(globalThis.__inviteJoin.body.name, 'B');
    db.prepare('UPDATE room_invitations SET created_at=?').run(now - 31000);
    assert.equal((await post('A', send)).status, 200);
    assert.equal(
      db.prepare('SELECT COUNT(*) n FROM room_invitations').get().n,
      1,
      'resend reuses invitation slot',
    );
    await post('B', { action: 'dismiss', id });
    assert.equal((await inbox('B')).items.length, 0);
    assert.equal((await post('B', { action: 'join', id })).status, 410);
  } finally {
    delete globalThis.__inviteDB;
    delete globalThis.__inviteJoin;
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
