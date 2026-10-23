import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { retentionPreview, cleanupExpiredTechnical } from '../lib/retention.mjs';
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle')
    .filter((x) => x.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync('drizzle/' + name, 'utf8'));
  const db = {
    prepare(q) {
      let args = [];
      return {
        bind(...a) {
          args = a;
          return this;
        },
        first() {
          return sql.prepare(q).get(...args);
        },
        run() {
          return { meta: { changes: Number(sql.prepare(q).run(...args).changes) } };
        },
      };
    },
    batch(items) {
      sql.exec('BEGIN');
      try {
        const r = items.map((x) => x.run());
        sql.exec('COMMIT');
        return r;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sql, db };
}
test('retention preview never changes old chats, active cases, game records or balances', async () => {
  const { sql, db } = fixture(),
    now = 500 * 86400000;
  sql.exec(
    "INSERT INTO lobby_messages(id,owner,name,avatar,request_id,body,created_at) VALUES(1,'owner','name','🐱','request','private',1)",
  );
  const before = sql.prepare('SELECT * FROM lobby_messages').all();
  const preview = await retentionPreview(db, now);
  assert.equal(preview.mode, 'preview-only');
  assert.equal(preview.rows.find((x) => x.label === '대기실 대화').count, 1);
  assert.deepEqual(sql.prepare('SELECT * FROM lobby_messages').all(), before);
  await cleanupExpiredTechnical(db, now);
  assert.deepEqual(sql.prepare('SELECT * FROM lobby_messages').all(), before);
});
test('technical expiry cleanup is bounded, idempotent and preserves valid sessions and audit', async () => {
  const { sql, db } = fixture();
  sql.exec(
    "INSERT INTO safety_rate VALUES('expired',5,99),('active',5,101);INSERT INTO google_accounts(subject,game_account_id,email,name,created_at,last_login_at) VALUES('subject','account','fake@example.test','name',1,1);INSERT INTO google_sessions VALUES('old','subject',99),('valid','subject',101);INSERT INTO deletion_audit VALUES('case','admin',1,'{}',1)",
  );
  const result = await cleanupExpiredTechnical(db, 100);
  assert.equal(result.google_sessions, 1);
  assert.equal(result.safety_rate, 1);
  assert.equal(sql.prepare('SELECT count(*) n FROM deletion_audit').get().n, 1);
  assert.equal(sql.prepare('SELECT token_hash FROM google_sessions').get().token_hash, 'valid');
  assert.equal((await cleanupExpiredTechnical(db, 100)).google_sessions, 0);
  const stmt = sql.prepare('INSERT INTO safety_rate VALUES(?,1,1)');
  for (let i = 0; i < 600; i++) stmt.run('old' + i);
  await cleanupExpiredTechnical(db, 100);
  assert.equal(
    sql.prepare('SELECT count(*) n FROM safety_rate WHERE expires_at<=100').get().n,
    100,
  );
});
