import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
test('companions consent, shared-room authorization, presence, and private read-only rewards', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'social-test-'));
  try {
    for (const f of readdirSync('drizzle')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    globalThis.__socialDB = db;
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
    urls['./store'] = urls['@/lib/store'] = stub(
      'store',
      `export const one=async(s,...v)=>globalThis.__socialDB.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__socialDB.prepare(s).all(...v);export const run=async(s,...v)=>({meta:{changes:globalThis.__socialDB.prepare(s).run(...v).changes}});`,
    );
    urls['./account'] = urls['@/lib/account'] = stub(
      'account',
      `export const accountId=r=>r.headers.get('user');export const guestToken=()=>'';export const tokenHash=async t=>t;export const findMember=async(r,room)=>globalThis.__socialDB.prepare('SELECT * FROM members WHERE account_id=? AND room_id=?').get(r.headers.get('user'),room);export function progressionFromXp(xp){const level=Math.floor((1+Math.sqrt(1+xp/12.5))/2);return {xp,level,current:xp-50*(level-1)*level,required:100*level}};export const accountProgressions=async ids=>new Map(ids.map(id=>[id,progressionFromXp(110)]));`,
    );
    urls['@/lib/cosmetics'] = compile('lib/cosmetics.ts', 'cosmetics');
    urls['@/lib/rewards.mjs'] = pathToFileURL(resolve('lib/rewards.mjs')).href;
    urls['@/lib/companions'] = compile('lib/companions.ts', 'companions');
    const api = await import(compile('app/api/companions/route.ts', 'api')),
      results = await import(compile('app/api/results/route.ts', 'results'));
    const now = Date.now();
    for (const room of ['room', 'other'])
      db.prepare('INSERT INTO rooms(id,name,host_id,created_at) VALUES(?,?,?,?)').run(
        room,
        room,
        'a',
        now,
      );
    for (const [id, owner, room, seen] of [
      ['a', 'A', 'room', now],
      ['b', 'B', 'room', now],
      ['c', 'C', 'other', now],
      ['b2', 'B', 'other', now + 1],
    ])
      db.prepare(
        'INSERT INTO members(id,room_id,token_hash,account_id,name,avatar,last_seen) VALUES(?,?,?,?,?,?,?)',
      ).run(id, room, id, owner, owner, '🐱', seen);
    const req = (u, b, origin = 'https://test') =>
      new Request('https://test/api/companions', {
        method: b ? 'POST' : 'GET',
        headers: { ...(u ? { user: u } : {}), origin },
        ...(b ? { body: JSON.stringify(b) } : {}),
      });
    const post = (u, b) => api.POST(req(u, b)),
      get = async (u) => (await api.GET(req(u))).json();
    assert.equal((await post(null, { action: 'request', member: 'b' })).status, 401);
    assert.equal(
      (await api.POST(req('A', { action: 'request', member: 'b' }, 'https://evil'))).status,
      403,
    );
    assert.equal((await post('A', { action: 'request', member: 'c' })).status, 403);
    assert.equal((await post('A', { action: 'request', member: 'b' })).status, 200);
    let a = await get('A');
    assert.equal(a.recent[0].room.id, 'room', 'recent peer does not reveal nonshared room');
    assert.equal(a.friends[0].room, null, 'pending request cannot expose location');
    const id = a.friends[0].id;
    assert.equal((await post('A', { action: 'accept', id })).status, 409);
    assert.equal((await post('C', { action: 'accept', id })).status, 409);
    assert.equal((await post('B', { action: 'accept', id })).status, 200);
    a = await get('A');
    assert.equal(a.friends[0].room.id, 'other');
    assert.equal(a.friends[0].online, true);
    assert.equal((await post('B', { action: 'request', member: 'a' })).status, 409);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM friendships').get().n, 1);
    await post('C', { action: 'remove', id });
    assert.equal((await get('A')).friends.length, 1);
    await post('A', { action: 'remove', id });
    assert.equal((await get('B')).friends.length, 0);
    db.prepare("UPDATE members SET blocked=1 WHERE id='b'").run();
    assert.equal((await post('A', { action: 'request', member: 'b' })).status, 400);
    db.prepare("UPDATE members SET blocked=0 WHERE id='b'").run();
    db.prepare(
      "INSERT INTO rounds(id,room_id,mode,answer,starts_at) VALUES('r','room','daily','secret',?)",
    ).run(now);
    db.prepare(
      "INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at) VALUES('p','r','a','[{},{}]','won',?)",
    ).run(now);
    const rr = (u) =>
      results.GET(
        new Request('https://test/api/results?room=room&round=r', { headers: { user: u } }),
      );
    assert.equal((await rr('C')).status, 403);
    assert.equal((await rr('B')).status, 409);
    const result = await (await rr('A')).json();
    assert.equal(result.xp, 30);
    assert.equal(result.before.level, 1);
    assert.equal(result.after.level, 2);
    assert(result.unlocked.length);
    assert(!JSON.stringify(result).includes('secret'));
    await rr('A');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM plays').get().n, 1);
  } finally {
    delete globalThis.__socialDB;
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
