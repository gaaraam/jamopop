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
    .filter((f) => f.endsWith('.sql') && f < '0034')
    .sort())
    db.exec(readFileSync('drizzle/' + f, 'utf8'));
  return db;
}
const insert =
  'INSERT INTO google_accounts(subject,game_account_id,email,name,created_at,last_login_at) VALUES(?,?,?,?,?,?)';
const req = (path, headers = {}) =>
  new Request('https://play.jamopop.workers.dev' + path, { headers });
test('migration preserves existing identities and only future registrations need approval', () => {
  const db = fixture();
  db.prepare(insert).run('old', 'old-id', 'old@example.test', 'old', 1, 1);
  db.exec(readFileSync('drizzle/0034_member_approval.sql', 'utf8'));
  db.prepare(insert).run('new', 'new-id', 'new@example.test', 'new', 2, 2);
  assert.deepEqual(
    db
      .prepare('SELECT subject,approval_status FROM google_accounts ORDER BY subject')
      .all()
      .map((x) => ({ ...x })),
    [
      { subject: 'new', approval_status: 'pending' },
      { subject: 'old', approval_status: 'approved' },
    ],
  );
  assert.equal(
    db.prepare('SELECT game_account_id FROM google_accounts WHERE subject=?').get('old')
      .game_account_id,
    'old-id',
  );
  db.close();
});
test('guests and unapproved accounts cannot read or write any community surface', () => {
  for (const status of ['guest', 'pending', 'rejected']) {
    const h =
      status === 'guest'
        ? {}
        : { 'oai-authenticated-user-id': 'new', 'x-jamopop-approval': status };
    for (const path of [
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
    ]) {
      assert.equal(accessResponse(req(path, h), {}).status, 403, path);
      assert.equal(
        accessResponse(new Request(req(path, h), { method: 'POST', body: '{}' }), {}).status,
        403,
        path,
      );
    }
    for (const path of ['/?lobby=1', '/?r=secret', '/speed', '/admin'])
      assert.equal(accessResponse(req(path, h), {}).headers.get('location'), '/personal');
    for (const path of [
      '/personal',
      '/solo/word',
      '/solo/exit',
      '/daily',
      '/api/solo',
      '/api/daily',
      '/api/account-deletion',
      '/support',
    ])
      assert.equal(accessResponse(req(path, h), {}), null, path);
  }
});
test('spoofed approval headers do not grant access, admins retain recovery access', () => {
  assert.equal(
    memberAccess(
      stripUntrustedIdentity(
        req('/', {
          'oai-authenticated-user-id': 'admin',
          'x-jamopop-admin': '1',
          'x-jamopop-approval': 'approved',
        }),
      ),
    ),
    'guest',
  );
  assert.equal(
    accessResponse(
      req('/api/game', { 'oai-authenticated-user-id': 'old', 'x-jamopop-approval': 'approved' }),
      {},
    ),
    null,
  );
  assert.equal(
    accessResponse(
      req('/api/admin/approvals', {
        'oai-authenticated-user-id': 'admin',
        'x-jamopop-approval': 'pending',
      }),
      { SITE_ADMIN_ACCOUNT_ID: 'admin' },
    ),
    null,
  );
});
test('existing sessions see approval immediately and profile switch cannot elevate it', async () => {
  const db = fixture();
  db.exec(readFileSync('drizzle/0034_member_approval.sql', 'utf8'));
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
  assert.equal(memberAccess(await authenticatedRequest(r, env)), 'pending');
  db.prepare('UPDATE google_accounts SET game_account_id=? WHERE subject=?').run(
    'legacy-id',
    'new',
  );
  assert.equal(memberAccess(await authenticatedRequest(r, env)), 'pending');
  db.prepare("UPDATE google_accounts SET approval_status='approved' WHERE subject=?").run('new');
  assert.equal(memberAccess(await authenticatedRequest(r, env)), 'approved');
  db.close();
});

test('admin approval API rejects outsiders and stale decisions, applies only to selected account', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { default: ts } = await import('typescript');
  const db = fixture();
  db.exec(readFileSync('drizzle/0034_member_approval.sql', 'utf8'));
  db.prepare(insert).run('candidate', 'candidate-id', 'candidate@example.test', '신규 회원', 2, 2);
  db.prepare(insert).run('other', 'other-id', 'other@example.test', '다른 회원', 3, 3);
  const dir = mkdtempSync(join(tmpdir(), 'approval-test-'));
  globalThis.__approvalDb = db;
  t.after(() => {
    delete globalThis.__approvalDb;
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(
    join(dir, 'account.mjs'),
    "export const isSiteAdmin=r=>r.headers.get('test-admin')==='yes';export const accountId=()=> 'admin';",
  );
  writeFileSync(
    join(dir, 'store.mjs'),
    'export const one=async(s,...v)=>globalThis.__approvalDb.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__approvalDb.prepare(s).all(...v);',
  );
  const code = ts
    .transpileModule(readFileSync('app/api/admin/approvals/route.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace('@/lib/account', './account.mjs')
    .replace('@/lib/store', './store.mjs');
  writeFileSync(join(dir, 'route.mjs'), code);
  const { GET, POST } = await import(pathToFileURL(join(dir, 'route.mjs')));
  const request = (body, admin = true, origin = 'https://test.local') =>
    new Request('https://test.local/api/admin/approvals', {
      method: body ? 'POST' : 'GET',
      headers: { 'test-admin': admin ? 'yes' : 'no', origin, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await GET(request(null, false))).status, 403);
  const decision = { subject: 'candidate', status: 'approved', revision: 0 };
  assert.equal((await POST(request(decision, false))).status, 403);
  assert.equal((await POST(request(decision, true, 'https://evil.test'))).status, 403);
  assert.equal((await POST(request(decision))).status, 200);
  assert.equal((await POST(request({ ...decision, status: 'rejected' }))).status, 409);
  assert.equal(
    db.prepare('SELECT approval_status FROM google_accounts WHERE subject=?').get('candidate')
      .approval_status,
    'approved',
  );
  assert.equal(
    db.prepare('SELECT approval_status FROM google_accounts WHERE subject=?').get('other')
      .approval_status,
    'pending',
  );
  const list = await (await GET(request())).json();
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].subject, 'other');
});
