import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  safetyIdentity,
  safetyBefore,
  safetyEndpoint,
  safetyAfter,
  rateLimit,
  betweenBlocked,
} from '../build/safety.mjs';
import { stripUntrustedIdentity } from '../build/cloudflare-boundary.mjs';
import { hash } from '../lib/migration-ticket.mjs';
function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((x) => x.endsWith('.sql'))
    .sort())
    db.exec(readFileSync('drizzle/' + f, 'utf8'));
  const prepare = (sql) => ({
    bind(...values) {
      return {
        first: async () => db.prepare(sql).get(...values) || null,
        all: async () => ({ results: db.prepare(sql).all(...values) }),
        run: async () => ({ meta: db.prepare(sql).run(...values) }),
      };
    },
  });
  const env = {
    SITE_ADMIN_ACCOUNT_ID: 'admin',
    DB: {
      prepare,
      batch: async (stmts) => {
        db.exec('BEGIN');
        try {
          const results = [];
          for (const s of stmts) results.push(await s.run());
          db.exec('COMMIT');
          return results;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      },
    },
  };
  const now = Date.now();
  db.exec(
    `INSERT INTO rooms(id,name,host_id,created_at,current_round_id) VALUES('room','공개 방','b',1,'round'),('private','비밀 방','b',1,'privround');INSERT INTO rounds(id,room_id,mode,answer,starts_at,width,hint_policy) VALUES('round','room','daily','기차',1,5,1),('privround','private','daily','기차',1,5,1);UPDATE rooms SET password_hash='private-hash' WHERE id='private';`,
  );
  for (const [id, account, room] of [
    ['a', 'alice', 'room'],
    ['b', 'bob', 'room'],
    ['c', 'carol', 'room'],
    ['s', 'spectator', 'room'],
    ['p', 'private-user', 'private'],
  ])
    db.prepare(
      'INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id,spectator) VALUES(?,?,?,?,?,?,?,?)',
    ).run(id, room, id.repeat(64), '테스트 ' + id, '🐱', now, account, id === 's' ? 1 : 0);
  db.exec(
    `INSERT INTO chat_messages(id,room_id,member_id,request_id,body,created_at,channel) VALUES(1,'room','b','chat-one','원본 메시지',1,'player'),(2,'room','s','chat-two','관전 대화',1,'spectator');INSERT INTO lobby_messages(id,owner,request_id,name,avatar,body,created_at) VALUES(1,'account:bob','lobby-one','테스트 b','🐱','대기실 원본',1);INSERT INTO friendships VALUES('friend','alice','bob','accepted',1,1);`,
  );
  const strokes = JSON.stringify([
    {
      color: '#273449',
      width: 6,
      points: [
        [0.1, 0.1],
        [0.8, 0.9],
      ],
    },
  ]);
  db.prepare('INSERT INTO drawing_hints VALUES(?,?,?,?)').run('round', 'b', strokes, now);
  db.prepare(
    "INSERT INTO room_invitations(id,sender,recipient,room_id,status,created_at,expires_at) VALUES('invite','bob','alice','room','pending',?,?)",
  ).run(now, now + 60000);
  return { db, env, close: () => db.close() };
}
const req = (user = 'alice', body, path = '/api/safety', headers = {}) =>
  new Request('https://test' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: 'https://test',
      ...(user ? { 'oai-authenticated-user-id': user } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const target = { kind: 'room_message', room: 'room', id: 1 };
const report = (t = target) => ({
  action: 'report',
  target: t,
  reason: '도배·광고',
  details: '추가 설명',
  requestId: crypto.randomUUID(),
});
async function endpoint(f, user, b, path) {
  return safetyEndpoint(req(user, b, path), f.env);
}
async function block(f, user = 'alice', t = target, action = 'block') {
  const r = await endpoint(f, user, { action, target: t });
  assert.equal(r.status, 200, JSON.stringify(await r.json()));
}
async function filtered(f, user, data, path = '/api/game?room=room') {
  return (await safetyAfter(req(user, null, path), f.env, Response.json(data))).json();
}

test('identity uses verified account or hashed guest cookie; spoofed admin is stripped before safety', async (t) => {
  const f = fixture();
  t.after(f.close);
  const token = 'f'.repeat(64);
  const guest = await safetyIdentity(
    req(null, null, '/api/safety', { cookie: 'bw_session=' + token }),
    f.env,
  );
  assert.equal(guest.subject, 'guest:' + (await hash(token)));
  assert.deepEqual(guest.aliases, [guest.subject]);
  assert.equal(guest.admin, false);
  const signed = await safetyIdentity(req('alice'), f.env);
  assert.deepEqual(signed.aliases, ['account:alice', 'guest:' + 'a'.repeat(64)]);
  const forged = stripUntrustedIdentity(
    req('admin', null, '/api/safety?admin=1', { 'x-jamopop-admin': '1' }),
  );
  assert.equal((await safetyEndpoint(forged, f.env)).status, 401);
  assert.equal((await endpoint(f, 'bob', null, '/api/safety?admin=1')).status, 403);
});
test('reports snapshot real chat, names and hints, are idempotent, private and do not trust supplied evidence', async (t) => {
  const f = fixture();
  t.after(f.close);
  const b = { ...report(), evidence: 'forged', name: 'forged' };
  const r = await endpoint(f, 'alice', b);
  assert.equal(r.status, 200);
  const id = (await r.json()).id;
  assert.equal((await (await endpoint(f, 'alice', b)).json()).id, id);
  assert.equal((await endpoint(f, 'alice', { ...b, details: 'different' })).status, 409);
  assert.equal((await endpoint(f, 'alice', report())).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_reports').get().n, 1);
  const row = f.db.prepare('SELECT * FROM safety_reports').get();
  assert.equal(JSON.parse(row.evidence).body, '원본 메시지');
  assert.equal(row.name, '테스트 b');
  assert.equal(row.subject, 'account:bob');
  assert.equal(row.details, '추가 설명');
  assert.equal((await (await endpoint(f, 'bob')).json()).reports.length, 0);
  for (const tg of [
    { kind: 'lobby_message', id: 1 },
    { kind: 'member', room: 'room', id: 'b' },
    { kind: 'room', room: 'room', id: 'room' },
  ])
    assert.equal((await endpoint(f, 'alice', report(tg))).status, 200);
  const hint = { kind: 'hint', room: 'room', round: 'round', id: 'b' };
  assert.equal((await endpoint(f, 'alice', report(hint))).status, 403);
  f.db.exec("INSERT INTO hint_views VALUES('round','a',1)");
  assert.equal((await endpoint(f, 'alice', report(hint))).status, 200);
  const admin = await (await endpoint(f, 'admin', null, '/api/safety?admin=1')).json();
  assert.equal(admin.rows.length, 5);
  assert.ok(admin.rows.some((x) => x.evidence.strokes));
  assert.equal(admin.rows[0].reporter, undefined);
  assert.equal(admin.rows[0].subject, undefined);
  assert.equal(
    (await endpoint(f, 'alice', report({ kind: 'room_message', room: 'private', id: 1 }))).status,
    403,
  );
  assert.equal(
    (await endpoint(f, 'alice', report({ kind: 'room_message', room: 'room', id: 2 }))).status,
    403,
  );
  assert.equal(
    (await endpoint(f, 'alice', report({ kind: 'room', room: 'private', id: 'private' }))).status,
    403,
  );
  assert.equal(
    (await endpoint(f, 'alice', report({ kind: 'member', room: 'room', id: 'a' }))).status,
    400,
  );
  assert.equal((await endpoint(f, 'alice', { ...report(), reason: 'bad' })).status, 400);
  assert.equal(
    (
      await safetyEndpoint(
        req('alice', report(), '/api/safety', { origin: 'https://evil.test' }),
        f.env,
      )
    ).status,
    403,
  );
});
test('block and mute persist, filter social content but keep game records, and unblock is owner-only', async (t) => {
  const f = fixture();
  t.after(f.close);
  await block(f);
  const data = {
    roster: [{ id: 'a' }, { id: 'b' }],
    players: [{ id: 'b', guesses: ['unchanged'] }],
    chat: {
      messages: [
        { id: 1, memberId: 'b', body: 'hide' },
        { id: 3, memberId: 'a', body: 'keep' },
      ],
    },
    reactions: [{ memberId: 'b' }],
    party: { hints: [{ memberId: 'b' }] },
  };
  const clean = await filtered(f, 'alice', data);
  assert.equal(clean.chat.messages.length, 1);
  assert.equal(clean.roster.length, 2);
  assert.deepEqual(clean.players, data.players);
  assert.equal(clean.reactions.length, 0);
  assert.equal(clean.party.hints.length, 0);
  assert.equal(
    (
      await filtered(
        f,
        'alice',
        { messages: [{ id: 1, memberId: 'other', body: 'hide' }] },
        '/api/lobby-chat',
      )
    ).messages.length,
    0,
  );
  assert.equal(
    (await filtered(f, 'alice', { hints: [{ memberId: 'b' }] }, '/api/party?room=room')).hints
      .length,
    0,
  );
  assert.equal(
    (
      await filtered(
        f,
        'alice',
        { friends: [{ id: 'friend' }], recent: [{ id: 'b' }] },
        '/api/companions',
      )
    ).friends.length,
    0,
  );
  assert.equal(
    (
      await filtered(
        f,
        'alice',
        { items: [{ id: 'invite' }], friends: [{ id: 'friend' }] },
        '/api/invitations?room=room',
      )
    ).items.length,
    0,
  );
  assert.equal(
    (
      await filtered(
        f,
        'alice',
        { items: [], friends: [{ id: 'friend' }] },
        '/api/invitations?room=room',
      )
    ).friends.length,
    0,
  );
  assert.equal(
    (await filtered(f, 'bob', { friends: [{ id: 'friend' }] }, '/api/companions')).friends.length,
    0,
  );
  const own = await (await endpoint(f, 'alice')).json(),
    id = own.blocks[0].id;
  assert.equal(own.blocks[0].target, undefined);
  await endpoint(f, 'bob', { action: 'unblock', id });
  assert.equal((await (await endpoint(f, 'alice')).json()).blocks.length, 1);
  await endpoint(f, 'alice', { action: 'unblock', id });
  assert.equal((await (await endpoint(f, 'alice')).json()).blocks.length, 0);
  await block(f, 'alice', target, 'mute');
  assert.equal((await filtered(f, 'alice', data)).chat.messages.length, 1);
  assert.equal(await betweenBlocked(f.env, ['account:alice'], ['account:bob']), false);
  assert.equal(
    (await filtered(f, 'alice', { friends: [{ id: 'friend' }] }, '/api/companions')).friends.length,
    1,
  );
});
test('block is enforced server-side for friend requests, acceptance, pending invites and home visits', async (t) => {
  const f = fixture();
  t.after(f.close);
  await block(f);
  for (const [who, b, path] of [
    ['alice', { action: 'request', member: 'b' }, '/api/companions'],
    ['bob', { action: 'accept', id: 'friend' }, '/api/companions'],
    ['bob', { action: 'send', id: 'friend', room: 'room' }, '/api/invitations'],
    ['alice', { action: 'join', id: 'invite' }, '/api/invitations'],
    ['alice', { action: 'visit', friend: 'friend', stamp: 'heart' }, '/api/home/life'],
  ]) {
    const gate = await safetyBefore(req(who, b, path), f.env);
    assert.equal(gate.response?.status, 403, path);
  }
  assert.equal(
    (await safetyBefore(req('alice', null, '/api/home/life?friend=friend'), f.env)).response
      ?.status,
    403,
  );
  assert.equal(
    (await safetyBefore(req('carol', { action: 'request', member: 'b' }, '/api/companions'), f.env))
      .response,
    undefined,
  );
});
test('moderation is atomic, expires, supports appeal and preserves the game/account data', async (t) => {
  const f = fixture();
  t.after(f.close);
  const id = (await (await endpoint(f, 'alice', report())).json()).id;
  const review = {
    action: 'review',
    id,
    revision: 0,
    status: 'reviewing',
    measure: 'chat_mute',
    hours: 1,
    note: '반복 도배 확인',
  };
  assert.equal((await endpoint(f, 'bob', review)).status, 403);
  assert.equal((await endpoint(f, 'admin', review)).status, 200);
  assert.equal((await endpoint(f, 'admin', { ...review, measure: 'suspend' })).status, 409);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_actions').get().n, 1);
  assert.equal(
    f.db.prepare("SELECT kind FROM safety_restrictions WHERE subject='account:bob'").get().kind,
    'chat_mute',
  );
  for (const [path, action] of [
    ['/api/game', 'chat_send'],
    ['/api/game', 'react'],
    ['/api/party', 'draw'],
  ])
    assert.equal(
      (await safetyBefore(req('bob', { action, body: 'hello' }, path), f.env)).response.status,
      403,
    );
  assert.equal(
    (await safetyBefore(req('bob', { action: 'guess', word: '기차' }, '/api/game'), f.env))
      .response,
    undefined,
  );
  assert.equal(
    (
      await safetyBefore(
        req('bob', { action: 'chat_send', body: '@문의 이의 신청' }, '/api/game'),
        f.env,
      )
    ).response,
    undefined,
  );
  assert.equal(
    (await endpoint(f, 'admin', { ...review, revision: 1, measure: 'suspend' })).status,
    200,
  );
  assert.equal(
    (await safetyBefore(req('bob', null, '/api/game?room=room'), f.env)).response.status,
    403,
  );
  assert.equal(
    (await safetyBefore(req('bob', { action: 'create' }, '/api/inquiries'), f.env)).response,
    undefined,
  );
  assert.equal((await endpoint(f, 'bob', null, '/api/safety?notice=1')).status, 200);
  f.db.exec('UPDATE safety_restrictions SET expires_at=1');
  assert.equal(
    (await safetyBefore(req('bob', null, '/api/game?room=room'), f.env)).response,
    undefined,
  );
  assert.equal(
    (await endpoint(f, 'admin', { ...review, revision: 2, measure: 'warn' })).status,
    200,
  );
  assert.equal(
    (await safetyBefore(req('bob', { action: 'chat_send' }, '/api/game'), f.env)).response,
    undefined,
  );
  assert.equal(
    (await endpoint(f, 'admin', { ...review, revision: 3, measure: 'revoke', status: 'closed' }))
      .status,
    200,
  );
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM safety_restrictions').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM members').get().n, 5);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM chat_messages').get().n, 2);
});
test('atomic action limits combine identity and generous IP budgets; GET polling does not spend quota', async (t) => {
  const f = fixture();
  t.after(f.close);
  const now = 60001;
  const results = await Promise.all(
    Array.from({ length: 30 }, () => rateLimit(f.env, 'atomic', 10, 60000, now)),
  );
  assert.equal(results.filter((x) => x.allowed).length, 10);
  assert.equal((await rateLimit(f.env, 'atomic', 10, 60000, 120001)).allowed, true);
  const headers = { 'CF-Connecting-IP': '203.0.113.10' };
  for (let i = 0; i < 25; i++)
    assert.equal(
      (await safetyBefore(req('alice', { action: 'chat_send' }, '/api/lobby-chat', headers), f.env))
        .response,
      undefined,
    );
  const denied = (
    await safetyBefore(req('alice', { action: 'chat_send' }, '/api/lobby-chat', headers), f.env)
  ).response;
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('Retry-After')) > 0);
  assert.equal(
    (await safetyBefore(req('bob', { action: 'chat_send' }, '/api/lobby-chat', headers), f.env))
      .response,
    undefined,
  );
  for (let i = 0; i < 30; i++)
    assert.equal(
      (await safetyBefore(req('alice', null, '/api/game?room=room', headers), f.env)).response,
      undefined,
    );
  for (let i = 0; i < 100; i++)
    assert.equal(
      (await safetyBefore(req(null, null, '/auth/google/start', headers), f.env)).response,
      undefined,
    );
  assert.equal(
    (await safetyBefore(req(null, null, '/auth/google/start', headers), f.env)).response.status,
    429,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM safety_rate WHERE key LIKE '%203.0.113.10%'").get().n,
    0,
  );
});
test('large rosters stay within D1 bind limits and blocked social content never exposes authentication fields', async (t) => {
  const f = fixture();
  t.after(f.close);
  for (let i = 0; i < 120; i++) {
    f.db
      .prepare('INSERT INTO rooms(id,name,host_id,created_at) VALUES(?,?,?,?)')
      .run('extra-room' + i, '추가 방', 'extra' + i, 1);
    f.db
      .prepare(
        'INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id) VALUES(?,?,?,?,?,?,?)',
      )
      .run('extra' + i, 'extra-room' + i, 'x' + i, '테스트 ' + i, '🐱', 1, 'alice');
  }
  const actor = await safetyIdentity(req('alice'), f.env);
  assert.equal(actor.aliases.length, 122);
  await block(f);
  const data = await filtered(f, 'alice', {
    roster: [...Array.from({ length: 120 }, (_, i) => ({ id: 'extra' + i })), { id: 'b' }],
    chat: { messages: [{ memberId: 'b', id: 1 }] },
  });
  assert.equal(data.roster.length, 121);
  assert.equal(data.chat.messages.length, 0);
  const visible = await filtered(
    f,
    'carol',
    { chat: { messages: [{ memberId: 'b', id: 1 }] } },
    '/api/game?room=room',
  );
  assert.deepEqual(visible.chat.messages[0].safetyTarget, {
    kind: 'room_message',
    id: 1,
    room: 'room',
  });
  assert.equal(JSON.stringify(visible).includes('token_hash'), false);
});

test('private-room password attempts have an additional IP ceiling even after identity resets', async (t) => {
  const f = fixture();
  t.after(f.close);
  for (let i = 0; i < 60; i++) {
    const g = await safetyBefore(
      req('new-' + i, { action: 'join', room: 'private' }, '/api/game', {
        'CF-Connecting-IP': '198.51.100.2',
      }),
      f.env,
    );
    assert.equal(g.response, undefined);
  }
  const g = await safetyBefore(
    req('another', { action: 'join', room: 'private' }, '/api/game', {
      'CF-Connecting-IP': '198.51.100.2',
    }),
    f.env,
  );
  assert.equal(g.response.status, 429);
  assert.ok(g.response.headers.get('Retry-After'));
});
test('a guest mute follows a later account link without hiding game state', async (t) => {
  const f = fixture();
  t.after(f.close);
  f.db.exec("UPDATE members SET account_id=NULL WHERE id='b'");
  await block(f, 'alice', target, 'mute');
  f.db.exec("UPDATE members SET account_id='bob' WHERE id='b'");
  assert.equal(
    (await filtered(f, 'alice', { messages: [{ id: 1, memberId: 'other' }] }, '/api/lobby-chat'))
      .messages.length,
    0,
  );
  assert.equal(
    (
      await filtered(
        f,
        'alice',
        { roster: [{ id: 'b' }], chat: { messages: [{ id: 1, memberId: 'b' }] } },
        '/api/speed?room=room',
      )
    ).chat.messages.length,
    0,
  );
});
test('real Worker boundary authenticates before safety, preserves POST bodies and filters speed and lobby responses', async (t) => {
  const f = fixture();
  t.after(f.close);
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs'),
    { tmpdir } = await import('node:os'),
    { join, resolve } = await import('node:path'),
    { pathToFileURL } = await import('node:url'),
    { default: ts } = await import('typescript');
  const dir = mkdtempSync(join(tmpdir(), 'jamopop-safety-worker-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const now = Date.now(),
    token = 'e'.repeat(64);
  f.db
    .prepare(
      'INSERT INTO google_accounts(subject,game_account_id,email,name,created_at,last_login_at) VALUES(?,?,?,?,?,?)',
    )
    .run('google-test', 'alice', 'local@example.test', '테스트', now, now);
  f.db
    .prepare('INSERT INTO google_sessions VALUES(?,?,?)')
    .run(await hash(token), 'google-test', now + 60000);
  const stub = join(dir, 'handler.mjs');
  writeFileSync(
    stub,
    `export default {fetch:async req=>{globalThis.__safetyWorkerCalls++;if(req.method==='POST')return Response.json({body:await req.json(),user:req.headers.get('oai-authenticated-user-id')});return Response.json({room:{id:'room'},roster:[{id:'b'}],chat:{messages:[{id:1,memberId:'b',body:'원본'}]}})}};`,
  );
  let code = ts.transpileModule(readFileSync('build/cloudflare-worker.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code
    .replace("'vinext/server/fetch-handler'", JSON.stringify(pathToFileURL(stub).href))
    .replace(/'(\.\.?\/[^']+\.mjs)'/g, (_, name) =>
      JSON.stringify(pathToFileURL(resolve('build', name)).href),
    );
  writeFileSync(join(dir, 'worker.mjs'), code);
  const worker = (await import(pathToFileURL(join(dir, 'worker.mjs')).href)).default;
  f.env.MIGRATION_LOCK = 'open';
  globalThis.__safetyWorkerCalls = 0;
  t.after(() => delete globalThis.__safetyWorkerCalls);
  const spoofed = await worker.fetch(
    req('admin', report(), '/api/safety', { 'x-jamopop-admin': '1' }),
    f.env,
    {},
  );
  assert.equal(spoofed.status, 403);
  f.db.exec("UPDATE google_accounts SET approval_status='approved'");
  const headers = { cookie: '__Host-jamopop_session=' + token };
  const body = { action: 'guess', word: '기차', expected: 0 };
  const posted = await worker.fetch(req(null, body, '/api/game', headers), f.env, {});
  assert.equal(posted.status, 200);
  assert.deepEqual((await posted.json()).body, body);
  const own = await worker.fetch(req(null, report(), '/api/safety', headers), f.env, {});
  assert.equal(own.status, 200);
  assert.equal(
    (await worker.fetch(req(null, null, '/api/safety?admin=1', headers), f.env, {})).status,
    403,
  );
  const denied = await worker.fetch(
    req(null, body, '/api/game', { ...headers, origin: 'https://evil.test' }),
    f.env,
    {},
  );
  assert.equal(denied.status, 403);
  await block(f);
  const speed = await worker.fetch(req(null, null, '/api/speed?room=room', headers), f.env, {});
  const result = await speed.json();
  assert.equal(result.roster.length, 1);
  assert.equal(result.chat.messages.length, 0);
  assert.equal(speed.headers.get('Cache-Control'), 'private, no-store');
});
test('room creation, requests, invitations, inquiries and reports each enforce their own action budget', async (t) => {
  const f = fixture();
  t.after(f.close);
  for (const [path, body, limit] of [
    ['/api/game', { action: 'create' }, 5],
    ['/api/companions', { action: 'request', member: 'b' }, 10],
    ['/api/invitations', { action: 'send', id: 'friend' }, 10],
    ['/api/inquiries', { action: 'create' }, 10],
    ['/api/safety', report(), 5],
  ]) {
    for (let i = 0; i < limit; i++)
      assert.equal((await safetyBefore(req('alice', body, path), f.env)).response, undefined, path);
    const response = (await safetyBefore(req('alice', body, path), f.env)).response;
    assert.equal(response.status, 429, path);
    assert.ok(response.headers.get('Retry-After'));
  }
});

test('confirmed own acknowledgements avoid social reads but adding chat still enforces blocks', async (t) => {
  const f = fixture();
  t.after(f.close);
  await block(f);
  let queries = 0;
  const prepare = f.env.DB.prepare;
  f.env.DB.prepare = (...args) => {
    queries++;
    return prepare(...args);
  };
  const ack = {
    submitted: true,
    roomId: 'room',
    roundId: 'round',
    memberId: 'a',
    serverNow: Date.now(),
    finishedAt: null,
    play: { status: 'playing', guesses: [] },
  };
  assert.deepEqual(await filtered(f, 'alice', ack), ack);
  assert.equal(queries, 0);
  const result = await filtered(f, 'alice', {
    ...ack,
    chat: { messages: [{ id: 1, memberId: 'b', body: 'hidden' }] },
  });
  assert.equal(result.chat.messages.length, 0);
  assert(queries > 0);
});
