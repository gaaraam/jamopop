import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { memberAccess, accessResponse } from '../build/member-access.mjs';
import { authenticatedRequest, SESSION } from '../build/session.mjs';
import { stripUntrustedIdentity } from '../build/cloudflare-boundary.mjs';
import { hash } from '../lib/migration-ticket.mjs';
function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.exec(readFileSync('drizzle/' + f, 'utf8'));
  return db;
}
const insert =
  'INSERT INTO google_accounts(subject,game_account_id,email,name,created_at,last_login_at) VALUES(?,?,?,?,?,?)';
const req = (path, headers = {}) =>
  new Request('https://play.jamopop.workers.dev' + path, { headers });
const communityApis = [
  '/api/game',
  '/api/game?room=secret',
  '/api/party',
  '/api/speed',
  '/api/lobby-chat',
  '/api/companions',
  '/api/invitations',
  '/api/results',
  '/api/admin/users',
  '/api/safety',
];
const personalPaths = [
  '/personal',
  '/solo/word',
  '/solo/exit',
  '/daily',
  '/api/solo',
  '/api/daily',
  '/api/account-deletion',
  '/support',
];
test('guests cannot read or write any community surface', () => {
  for (const path of communityApis) {
    assert.equal(accessResponse(req(path), {}).status, 403, path);
    assert.equal(
      accessResponse(new Request(req(path), { method: 'POST', body: '{}' }), {}).status,
      403,
      path,
    );
  }
  for (const path of ['/?lobby=1', '/?r=secret', '/speed', '/admin'])
    assert.equal(accessResponse(req(path), {}).headers.get('location'), '/personal');
  for (const path of personalPaths) assert.equal(accessResponse(req(path), {}), null, path);
});
test('every signed-in member uses community features without admin approval', async () => {
  const h = { 'oai-authenticated-user-id': 'new' };
  assert.equal(memberAccess(req('/', h)), 'member');
  for (const path of [...communityApis, '/?lobby=1', '/speed', ...personalPaths])
    assert.equal(accessResponse(req(path, h), {}), null, path);
  const access = await accessResponse(req('/api/access', h), {}).json();
  assert.deepEqual(access, { status: 'member', social: true, signedIn: true });
});
test('spoofed identity headers are stripped before access is decided', () => {
  assert.equal(
    stripUntrustedIdentity(req('/', { 'x-jamopop-joined-at': '1' })).headers.get(
      'x-jamopop-joined-at',
    ),
    null,
  );
  assert.equal(
    memberAccess(
      stripUntrustedIdentity(
        req('/', { 'oai-authenticated-user-id': 'admin', 'x-jamopop-admin': '1' }),
      ),
    ),
    'guest',
  );
});
test('sessions of accounts left pending or rejected by the old approval flow still get access', async () => {
  const db = fixture();
  db.prepare(insert).run('new', 'new-id', 'new@example.test', 'new', 2, 2);
  const token = 'a'.repeat(64);
  db.prepare('INSERT INTO google_sessions VALUES(?,?,?)').run(
    await hash(token),
    'new',
    Date.now() + 60000,
  );
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                return db.prepare(sql).get(...args);
              },
            };
          },
        };
      },
    },
  };
  const r = req('/api/game', { cookie: SESSION + '=' + token });
  for (const status of ['pending', 'rejected']) {
    db.prepare('UPDATE google_accounts SET approval_status=? WHERE subject=?').run(status, 'new');
    const trusted = await authenticatedRequest(r, env);
    assert.equal(trusted.headers.get('x-jamopop-joined-at'), '2');
    assert.equal(memberAccess(trusted), 'member');
    assert.equal(accessResponse(trusted, {}), null);
  }
  db.close();
});
