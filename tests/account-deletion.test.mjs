import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { previewDeletion, executeDeletion } from '../lib/account-deletion.mjs';
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync('drizzle/' + f, 'utf8'));
  let failure = false;
  const db = {
    prepare(query) {
      let args = [];
      return {
        bind(...a) {
          args = a;
          return this;
        },
        first() {
          return sql.prepare(query).get(...args) || null;
        },
        all() {
          return { results: sql.prepare(query).all(...args) };
        },
        run() {
          if (failure && query.startsWith('DELETE FROM skin_purchases')) throw Error('injected');
          return { meta: sql.prepare(query).run(...args) };
        },
      };
    },
    batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = statements.map((s) => s.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const insert = (t, data) => {
    const keys = Object.keys(data);
    sql
      .prepare(`INSERT INTO ${t}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`)
      .run(...Object.values(data));
  };
  for (const id of ['target', 'legacy', 'peer'])
    insert('profiles', { id, name: id, avatar: '🐱', created_at: 1 });
  for (const [subject, id] of [
    ['google-target', 'target'],
    ['google-peer', 'peer'],
  ]) {
    insert('google_accounts', {
      subject,
      game_account_id: id,
      email: id + '@example.test',
      name: id,
      created_at: 1,
      last_login_at: 1,
    });
    insert('google_sessions', { token_hash: subject, subject, expires_at: 9999999999999 });
    insert('linked_game_accounts', { account_id: id, subject, linked_at: 1 });
  }
  insert('linked_game_accounts', { account_id: 'legacy', subject: 'google-target', linked_at: 2 });
  insert('rooms', { id: 'room', name: 'shared', host_id: 'm-target', created_at: 1 });
  insert('rooms', { id: 'empty', name: 'only target', host_id: 'm-legacy', created_at: 1 });
  for (const [id, account, room] of [
    ['m-target', 'target', 'room'],
    ['m-legacy', 'legacy', 'empty'],
    ['m-peer', 'peer', 'room'],
  ])
    insert('members', {
      id,
      account_id: account,
      room_id: room,
      name: id,
      token_hash: id,
      avatar: '🐱',
      last_seen: 2,
    });
  insert('rounds', { id: 'round', room_id: 'room', mode: 'daily', answer: '사과', starts_at: 1 });
  for (const member of ['m-target', 'm-peer']) {
    insert('plays', {
      id: member,
      round_id: 'round',
      member_id: member,
      guesses: '["사과"]',
      status: 'won',
      updated_at: 1,
    });
    insert('chat_messages', {
      room_id: 'room',
      member_id: member,
      request_id: member,
      body: member + ' message',
      created_at: 1,
    });
    insert('drawing_hints', { round_id: 'round', member_id: member, strokes: '[]', updated_at: 1 });
  }
  for (const account of ['target', 'legacy', 'peer']) {
    insert('skin_purchases', { account_id: account, skin_id: 'skin', price: 10, purchased_at: 1 });
    insert('equipped_card_skins', { account_id: account, skin_id: 'skin' });
    insert('kongal_homes', { account_id: account, layout: '[]', updated_at: 1 });
    insert('solo_progress', { owner: 'account:' + account, state: '{}' });
    insert('lobby_messages', {
      owner: 'account:' + account,
      request_id: account,
      name: account,
      avatar: '🐱',
      body: 'private',
      created_at: 1,
    });
  }
  insert('solo_progress', { owner: 'guest:unrelated', state: '{}' });
  insert('friendships', {
    id: 'friend',
    requester: 'target',
    recipient: 'peer',
    status: 'accepted',
    created_at: 1,
    updated_at: 1,
  });
  insert('inquiries', {
    id: 'ticket',
    owner: 'account:target',
    request_id: 'ticket',
    name: 'target',
    category: '계정 삭제',
    title: '삭제',
    body: 'request',
    created_at: 1,
    updated_at: 1,
  });
  insert('deletion_receipts', {
    token_hash: 'receipt',
    inquiry_id: 'ticket',
    expires_at: 9999999999999,
  });
  insert('safety_reports', {
    id: 'report',
    reporter: 'account:peer',
    request_id: 'report',
    kind: 'member',
    reference: 'm-target',
    subject: 'account:target',
    name: 'target',
    reason: '기타',
    details: 'name target',
    evidence: '{"name":"target"}',
    created_at: 1,
    updated_at: 1,
  });
  return {
    sql,
    db,
    insert,
    fail: () => {
      failure = true;
    },
  };
}
test('deletion: linked profiles removed, shared room and peer records preserved, logout and tombstones', async () => {
  const f = fixture();
  try {
    const before = f.sql.prepare("SELECT * FROM plays WHERE member_id='m-peer'").get();
    const preview = await previewDeletion(f.db, 'ticket', 'operator', 'admin');
    assert.equal(preview.profileCount, 2);
    assert.deepEqual(
      preview.profiles.map((p) => p.id),
      ['legacy', 'target'],
    );
    const result = await executeDeletion(f.db, 'ticket', preview.token, 'operator', 'admin');
    assert(result.completedAt);
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM profiles WHERE id IN('target','legacy')").get().n,
      0,
    );
    assert.deepEqual(f.sql.prepare("SELECT * FROM plays WHERE member_id='m-peer'").get(), before);
    assert.equal(
      f.sql.prepare("SELECT host_id FROM rooms WHERE id='room'").get().host_id,
      'm-peer',
    );
    assert(f.sql.prepare("SELECT archived_at FROM rooms WHERE id='empty'").get().archived_at);
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM google_sessions WHERE subject='google-target'").get().n,
      0,
    );
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM google_accounts WHERE subject='google-target'").get().n,
      0,
    );
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM solo_progress WHERE owner='guest:unrelated'").get().n,
      1,
    );
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM chat_messages WHERE member_id='m-peer'").get().n,
      1,
    );
    assert.equal(
      f.sql.prepare("SELECT evidence FROM safety_reports WHERE id='report'").get().evidence,
      '{}',
    );
    assert.equal(
      f.sql.prepare("SELECT status FROM inquiries WHERE id='ticket'").get().status,
      'closed',
    );
    assert.equal(
      (await executeDeletion(f.db, 'ticket', preview.token, 'operator', 'admin')).alreadyCompleted,
      true,
    );
    assert.throws(
      () => f.insert('profiles', { id: 'target', name: 'late', avatar: '🐱', created_at: 1 }),
      /ACCOUNT_DELETED/,
    );
    assert.throws(
      () =>
        f.insert('linked_game_accounts', { account_id: 'legacy', subject: 'new', linked_at: 3 }),
      /ACCOUNT_DELETED/,
    );
    assert.throws(
      () => f.sql.exec("UPDATE members SET name='late' WHERE id='m-target'"),
      /ACCOUNT_DELETED/,
    );
    assert.throws(() => f.sql.exec('DELETE FROM deletion_audit'), /IMMUTABLE_AUDIT/);
  } finally {
    f.sql.close();
  }
});
test('deletion: stale preview, wrong actor, expired preview, cancellation and protected admin fail closed', async () => {
  const f = fixture();
  try {
    let p = await previewDeletion(f.db, 'ticket', 'operator', 'admin', 100);
    await assert.rejects(executeDeletion(f.db, 'ticket', p.token, 'other', 'admin', 101));
    await assert.rejects(executeDeletion(f.db, 'ticket', p.token, 'operator', 'admin', 400000));
    f.sql.exec("UPDATE profiles SET name='changed' WHERE id='target'");
    await assert.rejects(executeDeletion(f.db, 'ticket', p.token, 'operator', 'admin', 101));
    assert.equal(f.sql.prepare('SELECT count(*) n FROM deletion_audit').get().n, 0);
    p = await previewDeletion(f.db, 'ticket', 'operator', 'admin', 200);
    f.sql.exec("UPDATE inquiries SET status='closed',revision=revision+1 WHERE id='ticket'");
    await assert.rejects(executeDeletion(f.db, 'ticket', p.token, 'operator', 'admin', 201));
    f.sql.exec("UPDATE inquiries SET status='new' WHERE id='ticket'");
    await assert.rejects(previewDeletion(f.db, 'ticket', 'operator', 'legacy'));
    f.sql.exec("UPDATE linked_game_accounts SET is_admin=1 WHERE account_id='legacy'");
    await assert.rejects(previewDeletion(f.db, 'ticket', 'operator', 'admin'));
  } finally {
    f.sql.close();
  }
});
test('deletion: injected failure rolls back all deletes, host changes and audit; double execute once', async () => {
  const f = fixture();
  try {
    const p = await previewDeletion(f.db, 'ticket', 'operator', 'admin');
    f.fail();
    await assert.rejects(executeDeletion(f.db, 'ticket', p.token, 'operator', 'admin'));
    assert.equal(f.sql.prepare("SELECT name FROM profiles WHERE id='target'").get().name, 'target');
    assert.equal(
      f.sql.prepare("SELECT host_id FROM rooms WHERE id='room'").get().host_id,
      'm-target',
    );
    assert.equal(f.sql.prepare('SELECT count(*) n FROM deletion_audit').get().n, 0);
  } finally {
    f.sql.close();
  }
  const g = fixture();
  try {
    const p = await previewDeletion(g.db, 'ticket', 'operator', 'admin');
    const result = await Promise.all([
      executeDeletion(g.db, 'ticket', p.token, 'operator', 'admin'),
      executeDeletion(g.db, 'ticket', p.token, 'operator', 'admin'),
    ]);
    assert.equal(result.filter((r) => !r.alreadyCompleted).length, 1);
    assert.equal(g.sql.prepare('SELECT count(*) n FROM deletion_audit').get().n, 1);
  } finally {
    g.sql.close();
  }
});

test('deletion API: owner-only receipts, admin-only preview/execute and logged-out completion lookup', async () => {
  const f = fixture(),
    dir = mkdtempSync(join(tmpdir(), 'deletion-api-'));
  try {
    globalThis.__deletionFixture = f.db;
    writeFileSync(
      join(dir, 'store.mjs'),
      `export const database=()=>globalThis.__deletionFixture;export const adminAccountId=()=> 'admin';export const one=(s,...v)=>database().prepare(s).bind(...v).first();export const run=(s,...v)=>database().prepare(s).bind(...v).run();`,
    );
    writeFileSync(
      join(dir, 'account.mjs'),
      `export const accountId=r=>r.headers.get('test-account');export const isSiteAdmin=r=>accountId(r)==='operator';`,
    );
    let src = ts
      .transpileModule(readFileSync('app/api/account-deletion/route.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replaceAll('@/lib/store', './store.mjs')
      .replaceAll(
        '@/lib/account-deletion.mjs',
        pathToFileURL(resolve('lib/account-deletion.mjs')).href,
      )
      .replaceAll('@/lib/account', './account.mjs');
    writeFileSync(join(dir, 'route.mjs'), src);
    const { POST } = await import(pathToFileURL(join(dir, 'route.mjs')));
    const send = (account, body, origin = 'https://test') =>
      POST(
        new Request('https://test/api/account-deletion', {
          method: 'POST',
          headers: { origin, ...(account ? { 'test-account': account } : {}) },
          body: JSON.stringify(body),
        }),
      );
    assert.equal((await send(null, { action: 'preview', inquiry: 'ticket' })).status, 401);
    assert.equal((await send('peer', { action: 'receipt', inquiry: 'ticket' })).status, 403);
    assert.equal((await send('target', { action: 'preview', inquiry: 'ticket' })).status, 403);
    assert.equal(
      (await send('operator', { action: 'preview', inquiry: 'ticket' }, 'https://evil.test'))
        .status,
      403,
    );
    const receipt = await (await send('target', { action: 'receipt', inquiry: 'ticket' })).json();
    assert.match(receipt.code, /^[a-f0-9]{64}$/);
    assert.equal(
      f.sql.prepare('SELECT 1 FROM deletion_receipts WHERE token_hash=?').get(receipt.code),
      undefined,
    );
    assert.equal(
      (await (await send(null, { action: 'status', code: receipt.code })).json()).status,
      'pending',
    );
    const preview = await (await send('operator', { action: 'preview', inquiry: 'ticket' })).json();
    assert.equal(preview.profileCount, 2);
    assert.deepEqual(
      preview.profiles.map((p) => p.id),
      ['legacy', 'target'],
    );
    assert.equal(
      (
        await send('operator', {
          action: 'execute',
          inquiry: 'ticket',
          token: preview.token,
          confirm: 'wrong',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await send('operator', {
          action: 'execute',
          inquiry: 'ticket',
          token: preview.token,
          confirm: '계정 삭제 실행',
        })
      ).status,
      200,
    );
    const completed = await (await send(null, { action: 'status', code: receipt.code })).json();
    assert.equal(completed.status, 'completed');
    assert(completed.completedAt);
    assert.deepEqual(Object.keys(completed).sort(), ['completedAt', 'status']);
    assert.equal((await send(null, { action: 'status', code: 'f'.repeat(64) })).status, 404);
    f.sql.exec('UPDATE deletion_receipts SET expires_at=1');
    assert.equal((await send(null, { action: 'status', code: receipt.code })).status, 404);
  } finally {
    f.sql.close();
    delete globalThis.__deletionFixture;
    rmSync(dir, { recursive: true, force: true });
  }
});
