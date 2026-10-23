import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { authenticatedRequest, sessionAccount, safeReturn, SESSION } from '../../build/session.mjs';
import { stripUntrustedIdentity } from '../../build/cloudflare-boundary.mjs';
import {
  legacyLink,
  profileSwitch,
  LEGACY_TARGET,
  openLegacyTicket,
} from '../../build/legacy-link.mjs';
import { hash, SOURCE, random } from '../../lib/migration-ticket.mjs';
const origin = 'https://play.jamopop.workers.dev';
function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.exec(readFileSync('drizzle/' + f, 'utf8'));
  const prepare = (sql, args = []) => ({
    bind(...a) {
      return prepare(sql, a);
    },
    async first() {
      return db.prepare(sql).get(...args) || null;
    },
    async run() {
      return { meta: { changes: db.prepare(sql).run(...args).changes } };
    },
    async all() {
      return { results: db.prepare(sql).all(...args) };
    },
  });
  const env = {
    DB: {
      prepare,
      async batch(q) {
        db.exec('BEGIN');
        try {
          const results = [];
          for (const s of q) results.push(await s.run());
          db.exec('COMMIT');
          return results;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      },
    },
    MIGRATION_BRIDGE_KEY: 'a'.repeat(64),
  };
  return { db, env };
}
async function identity(db, subject, admin = 0) {
  const token = random(),
    id = 'google:' + subject,
    now = Date.now();
  db.prepare(
    'INSERT INTO google_accounts(subject,game_account_id,email,name,created_at,last_login_at) VALUES(?,?,?,?,?,?)',
  ).run(subject, id, subject + '@example.test', '이름', now, now);
  db.prepare('INSERT INTO google_sessions VALUES(?,?,?)').run(
    await hash(token),
    subject,
    now + 86400000,
  );
  db.prepare('INSERT INTO linked_game_accounts VALUES(?,?,?,?,?)').run(
    id,
    subject,
    'Google',
    admin,
    now,
  );
  return `${SESSION}=${token}`;
}
function req(path, cookie, body, extra = {}) {
  return new Request(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, ...(body ? { origin, 'content-type': 'application/json' } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function signed(p, secret) {
  const enc = new TextEncoder(),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await crypto.subtle.importKey(
      'raw',
      Uint8Array.from(secret.match(/../g), (x) => parseInt(x, 16)),
      'AES-GCM',
      false,
      ['encrypt'],
    );
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(LEGACY_TARGET) },
      key,
      enc.encode(JSON.stringify(p)),
    ),
  );
  return Buffer.from(iv).toString('base64url') + '.' + Buffer.from(bytes).toString('base64url');
}
test('independent identity uses a live server session; spoofed Sites and admin headers are stripped', async () => {
  const { db, env } = fixture(),
    cookie = await identity(db, 'alice');
  const anonymous = stripUntrustedIdentity(
    req('/api/account', '', null, { 'oai-authenticated-user-id': 'owner', 'x-jamopop-admin': '1' }),
  );
  assert.equal(await sessionAccount(anonymous, env), null);
  assert.equal(anonymous.headers.get('x-jamopop-admin'), null);
  const verified = await authenticatedRequest(
    stripUntrustedIdentity(
      req('/api/account', cookie, null, {
        'oai-authenticated-user-id': 'victim',
        'x-jamopop-admin': '1',
      }),
    ),
    env,
  );
  assert.equal(verified.headers.get('oai-authenticated-user-id'), 'google:alice');
  assert.equal(verified.headers.get('x-jamopop-admin'), null);
  db.prepare('UPDATE linked_game_accounts SET is_admin=1').run();
  assert.equal(
    (await authenticatedRequest(req('/', cookie), env)).headers.get('x-jamopop-admin'),
    '1',
  );
  db.prepare('UPDATE google_sessions SET expires_at=0').run();
  assert.equal(await sessionAccount(req('/', cookie), env), null);
  db.close();
});
test('redirect targets remain same-origin and profile switches cannot select somebody else', async () => {
  assert.equal(safeReturn('//evil.test'), '/?lobby=1');
  assert.equal(safeReturn('/\\evil.test'), '/?lobby=1');
  assert.equal(safeReturn('/auth/logout'), '/?lobby=1');
  assert.equal(safeReturn('/?r=abc'), '/?r=abc');
  const { db, env } = fixture(),
    a = await identity(db, 'alice');
  await identity(db, 'bob');
  assert.equal(
    (await profileSwitch(req('/auth/profiles', a, { id: 'google:bob' }), env)).status,
    403,
  );
  assert.equal(
    (
      await profileSwitch(
        req('/auth/profiles', a, { id: 'google:alice' }, { origin: 'https://evil.test' }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await (await profileSwitch(req('/auth/profiles', a), env)).json()).profiles.length,
    1,
  );
  db.close();
});
test('legacy account proof is browser-bound, replay-safe and preserves both new and old profiles', async () => {
  const { db, env } = fixture(),
    a = await identity(db, 'alice'),
    b = await identity(db, 'bob');
  db.prepare('INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?)').run(
    'legacy:1',
    '기존 이름',
    '🐱',
    1,
  );
  db.prepare('INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?)').run(
    'google:alice',
    '새 이름',
    '🐻',
    2,
  );
  const old = JSON.stringify(db.prepare('SELECT * FROM profiles ORDER BY id').all());
  const start = await legacyLink(req('/auth/legacy/start', a, {}), env),
    info = await start.json(),
    state = start.headers.get('set-cookie').split(';')[0],
    challenge = new URL(info.url).searchParams.get('challenge');
  const p = {
      iss: SOURCE,
      aud: LEGACY_TARGET,
      jti: random(),
      challenge,
      exp: Date.now() + 120000,
      accountId: 'legacy:1',
      admin: true,
      guest: '',
    },
    ticket = await signed(p, env.MIGRATION_BRIDGE_KEY);
  await assert.rejects(openLegacyTicket(ticket, 'b'.repeat(64)));
  await assert.rejects(
    openLegacyTicket(
      await signed({ ...p, exp: 0 }, env.MIGRATION_BRIDGE_KEY),
      env.MIGRATION_BRIDGE_KEY,
    ),
  );
  assert.equal((await legacyLink(req('/auth/legacy/complete', a, { ticket }), env)).status, 400);
  assert.equal(
    (await legacyLink(req('/auth/legacy/complete', b + '; ' + state, { ticket }), env)).status,
    400,
  );
  const preview = await legacyLink(req('/auth/legacy/preview', a + '; ' + state, { ticket }), env);
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).summary.name, '기존 이름');
  assert.equal((await sessionAccount(req('/', a), env)).game_account_id, 'google:alice');
  assert.equal(
    (await legacyLink(req('/auth/legacy/preview', b + '; ' + state, { ticket }), env)).status,
    400,
  );
  const complete = await legacyLink(
    req('/auth/legacy/complete', a + '; ' + state, {
      ticket: LEGACY_TARGET + '/auth/complete?ticket=' + encodeURIComponent(ticket),
    }),
    env,
  );
  assert.equal(complete.status, 200);
  assert.equal((await sessionAccount(req('/', a), env)).game_account_id, 'legacy:1');
  assert.equal((await sessionAccount(req('/', a), env)).is_admin, 1);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM profiles ORDER BY id').all()), old);
  assert.equal(
    (await (await profileSwitch(req('/auth/profiles', a), env)).json()).profiles.length,
    2,
  );
  assert.equal(
    (await legacyLink(req('/auth/legacy/complete', a + '; ' + state, { ticket }), env)).status,
    400,
  );
  assert.equal(
    (await profileSwitch(req('/auth/profiles', a, { id: 'google:alice' }), env)).status,
    200,
  );
  assert.equal((await sessionAccount(req('/', a), env)).game_account_id, 'google:alice');
  db.close();
});

test('new Google user migrates guest room, progress and titles without altering guesses or other owners', async () => {
  const { db, env } = fixture(),
    a = await identity(db, 'new-guest-user'),
    b = await identity(db, 'other-user');
  const token = random(),
    h = await hash(token),
    guest = 'guest:' + h,
    id = 'legacy-guest:' + h,
    owner = 'account:' + id;
  db.prepare('INSERT INTO rooms(id,name,host_id,created_at) VALUES(?,?,?,?)').run(
    'room',
    '테스트방',
    'member',
    1,
  );
  db.prepare(
    'INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen) VALUES(?,?,?,?,?,?)',
  ).run('member', 'room', h, '게스트닉', '🐧', 1);
  db.prepare('INSERT INTO rounds(id,room_id,mode,answer,starts_at) VALUES(?,?,?,?,?)').run(
    'round',
    'room',
    'daily',
    '사과',
    1,
  );
  db.prepare(
    'INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at) VALUES(?,?,?,?,?,?)',
  ).run('play', 'round', 'member', '["ㄱㅏㅂㅏㅇ","ㅅㅏㄱㅗㅏ"]', 'won', 1);
  db.prepare('INSERT INTO solo_progress VALUES(?,?,?)').run(
    guest,
    JSON.stringify({ xp: 70, completed: [1, 2] }),
    3,
  );
  db.prepare('INSERT INTO earned_titles VALUES(?,?,?)').run(guest, 'clutch', 1);
  db.prepare('INSERT INTO equipped_titles VALUES(?,?)').run(guest, 'clutch');
  db.prepare('INSERT INTO solo_runs VALUES(?,?,?,?,?,?,?,?,?)').run(
    'solo-run',
    guest,
    2,
    'won',
    3,
    2,
    1,
    300001,
    9,
  );
  const before = JSON.stringify(db.prepare('SELECT * FROM plays').all());
  const start = await legacyLink(req('/auth/legacy/start', a, {}), env),
    info = await start.json(),
    state = start.headers.get('set-cookie').split(';')[0];
  const ticket = await signed(
    {
      iss: SOURCE,
      aud: LEGACY_TARGET,
      jti: random(),
      challenge: new URL(info.url).searchParams.get('challenge'),
      exp: Date.now() + 120000,
      accountId: null,
      guest: token,
    },
    env.MIGRATION_BRIDGE_KEY,
  );
  const preview = await legacyLink(req('/auth/legacy/preview', a + '; ' + state, { ticket }), env);
  assert.equal(preview.status, 200);
  const s = (await preview.json()).summary;
  assert.equal(s.name, '게스트닉');
  assert.equal(s.xp, 100);
  assert.equal(s.rooms, 1);
  assert.equal(s.wins, 1);
  assert.equal(db.prepare('SELECT account_id FROM members').get().account_id, null);
  assert.equal(
    (await legacyLink(req('/auth/legacy/complete', a + '; ' + state, { ticket }), env)).status,
    200,
  );
  assert.equal((await sessionAccount(req('/', a), env)).game_account_id, id);
  assert.equal(db.prepare('SELECT account_id FROM members').get().account_id, id);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays').all()), before);
  assert.deepEqual(
    JSON.parse(db.prepare('SELECT state FROM solo_progress WHERE owner=?').get(owner).state),
    { xp: 70, completed: [1, 2] },
  );
  assert.equal(
    db.prepare('SELECT title FROM equipped_titles WHERE owner=?').get(owner).title,
    'clutch',
  );
  assert.equal((await sessionAccount(req('/', b), env)).game_account_id, 'google:other-user');
  assert.equal(
    (await legacyLink(req('/auth/legacy/complete', a + '; ' + state, { ticket }), env)).status,
    400,
  );
  const profiles = await (await profileSwitch(req('/auth/profiles', a), env)).json();
  assert.equal(profiles.profiles.length, 2);
  assert.equal(profiles.profiles.find((p) => p.id === id).label, '게스트닉');
  assert.equal(db.prepare('SELECT avatar FROM profiles WHERE id=?').get(id).avatar, '🐧');
  assert.equal(db.prepare('SELECT owner FROM solo_runs WHERE id=?').get('solo-run').owner, owner);
  assert.equal(db.prepare('SELECT attempts FROM solo_runs WHERE id=?').get('solo-run').attempts, 3);
  const freshSession = random();
  db.prepare('INSERT INTO google_sessions VALUES(?,?,?)').run(
    await hash(freshSession),
    'new-guest-user',
    Date.now() + 10000,
  );
  assert.equal(
    (await sessionAccount(req('/', `${SESSION}=${freshSession}`), env)).game_account_id,
    id,
  );
  const again = await legacyLink(req('/auth/legacy/start', a, {}), env),
    againInfo = await again.json(),
    againState = again.headers.get('set-cookie').split(';')[0];
  const againTicket = await signed(
    {
      iss: SOURCE,
      aud: LEGACY_TARGET,
      jti: random(),
      challenge: new URL(againInfo.url).searchParams.get('challenge'),
      exp: Date.now() + 120000,
      accountId: null,
      guest: token,
    },
    env.MIGRATION_BRIDGE_KEY,
  );
  const againPreview = await (
    await legacyLink(
      req('/auth/legacy/preview', a + '; ' + againState, { ticket: againTicket }),
      env,
    )
  ).json();
  assert.equal(againPreview.summary.name, '게스트닉');
  assert.equal(againPreview.summary.xp, 100);

  db.close();
});
