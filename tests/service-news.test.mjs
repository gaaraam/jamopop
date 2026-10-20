import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { kstDay, validateNews } from '../lib/service-news.mjs';
import { targets } from '../lib/account-deletion.mjs';
test('Korean midnight, bounded event periods and reward validation', () => {
  assert.equal(kstDay(Date.parse('2026-10-20T14:59:59Z')), '2026-10-20');
  assert.equal(kstDay(Date.parse('2026-10-20T15:00:00Z')), '2026-10-21');
  const p = {
    kind: 'event',
    title: '감사 선물',
    body: '고맙습니다.',
    status: 'published',
    gold: 100,
    startsAt: 1000,
    endsAt: 2000,
  };
  assert.ok(validateNews(p));
  for (const values of [
    { gold: 0 },
    { gold: 10001 },
    { gold: 1.5 },
    { endsAt: 1000 },
    { startsAt: -1 },
    { endsAt: 8640000000000001 },
    { endsAt: 91 * 86400000 },
    { status: 'anything' },
    { title: ' ' },
    { body: 'x'.repeat(6001) },
  ])
    assert.equal(validateNews({ ...p, ...values }), null);
  assert.ok(
    targets({ subject: 'subject', accounts: ['one'], members: [] }).some(
      ([name]) => name === 'service_gold_claims',
    ),
  );
});
test('reward endpoints: authorization, duplicate tabs, profile switching, expiry, withdrawal, revision and usable wallet', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'jamo-news-')),
    originalNow = Date.now;
  let now = Date.parse('2026-10-20T12:00:00Z');
  Date.now = () => now;
  try {
    for (const f of readdirSync('drizzle')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    globalThis.__newsDb = db;
    writeFileSync(
      join(dir, 'store.mjs'),
      `const d=globalThis.__newsDb;export const one=async(s,...v)=>d.prepare(s).get(...v)||null;export const all=async(s,...v)=>d.prepare(s).all(...v);export const run=async(s,...v)=>({meta:d.prepare(s).run(...v)});`,
    );
    writeFileSync(
      join(dir, 'account.mjs'),
      `export const accountId=r=>r.headers.get('test-user');export const isSiteAdmin=r=>accountId(r)==='admin';`,
    );
    writeFileSync(join(dir, 'news.mjs'), readFileSync('lib/service-news.mjs', 'utf8'));
    const src = ts
      .transpileModule(readFileSync('app/api/news/route.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replaceAll('@/lib/account', './account.mjs')
      .replaceAll('@/lib/store', './store.mjs')
      .replaceAll('@/lib/service-news.mjs', './news.mjs');
    writeFileSync(join(dir, 'route.mjs'), src);
    const { GET, POST } = await import(pathToFileURL(join(dir, 'route.mjs')));
    const req = (user, body, query = '', origin = 'https://test') =>
      new Request('https://test/api/news' + query, {
        method: body ? 'POST' : 'GET',
        headers: { origin, ...(user ? { 'test-user': user } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    db.exec(
      "INSERT INTO google_accounts VALUES('subject','one','test@example.test','테스트',1,1); INSERT INTO profiles(id,name,avatar,created_at) VALUES('one','테스트','🐱',1)",
    );
    assert.equal((await GET(req(null, null, '?admin=1'))).status, 403);
    assert.equal((await POST(req(null, { action: 'attendance' }))).status, 401);
    assert.equal(
      (await POST(req('one', { action: 'attendance' }, '', 'https://elsewhere'))).status,
      403,
    );
    const welcome = await (await GET(req('one', null, '?attendance=1'))).json();
    assert.equal(welcome.received, false);
    assert.match(welcome.welcomeKey, /^[a-f0-9]{64}$/);
    assert.equal(welcome.items, undefined);
    const claimed = await Promise.all(
      Array.from({ length: 12 }, () =>
        POST(req('one', { action: 'attendance' })).then((r) => r.json()),
      ),
    );
    assert.equal(claimed.filter((x) => x.received).length, 1);
    assert.equal(db.prepare('SELECT SUM(amount) amount FROM service_gold_claims').get().amount, 50);
    db.exec("UPDATE google_accounts SET game_account_id='two' WHERE subject='subject'");
    assert.equal(
      (await (await POST(req('two', { action: 'attendance' }))).json()).otherProfile,
      true,
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM service_gold_claims').get().n, 1);
    const linkedWelcome = await (await GET(req('two', null, '?attendance=1'))).json();
    assert.equal(linkedWelcome.received, true);
    assert.equal(linkedWelcome.welcomeKey, welcome.welcomeKey);
    db.exec("UPDATE google_accounts SET game_account_id='one' WHERE subject='subject'");
    now = Date.parse('2026-10-20T15:00:00Z');
    assert.equal((await (await POST(req('one', { action: 'attendance' }))).json()).received, true);
    const event = {
      action: 'save',
      kind: 'event',
      title: '감사 선물',
      body: '고맙습니다.',
      status: 'published',
      gold: 100,
      startsAt: now + 1000,
      endsAt: now + 2000,
    };
    assert.equal((await POST(req('one', event))).status, 403);
    const created = await (await POST(req('admin', event))).json();
    assert.ok(created.id);
    assert.equal((await POST(req('one', { action: 'claim', id: created.id }))).status, 409);
    now += 1000;
    const first = await (await POST(req('one', { action: 'claim', id: created.id }))).json();
    assert.equal(first.amount, 100);
    assert.equal(first.received, true);
    assert.equal(
      (await POST(req('admin', { ...event, id: created.id, revision: 1, gold: 500 }))).status,
      409,
    );
    assert.equal(
      (await POST(req('admin', { ...event, id: created.id, revision: 1, status: 'archived' })))
        .status,
      200,
    );
    assert.equal((await (await GET(req(null))).json()).items.length, 0);
    assert.equal((await POST(req('admin', { ...event, id: created.id, revision: 1 }))).status, 409);
    assert.equal(
      (await (await POST(req('one', { action: 'claim', id: created.id }))).json()).received,
      false,
    );
    db.exec(
      "INSERT INTO google_accounts VALUES('subject-b','three','b@example.test','테스트2',1,1)",
    );
    assert.equal((await POST(req('three', { action: 'claim', id: created.id }))).status, 409);
    assert.equal(
      (await POST(req('admin', { ...event, id: created.id, revision: 2, status: 'published' })))
        .status,
      200,
    );
    now += 1000;
    assert.equal((await POST(req('three', { action: 'claim', id: created.id }))).status, 409);
    const data = await (await GET(req('one'))).json();
    assert.ok(data.claims.some((c) => c.kind === 'event'));
    assert.ok(!JSON.stringify(data).includes('subject'));
    assert.equal(data.items[0].gold, 100);
    assert.equal(data.items[0].claimCount, undefined);
    const adminFeed = await (await GET(req('admin', null, '?admin=1'))).json();
    assert.equal(adminFeed.items[0].claimCount, 1);
    assert.equal(adminFeed.items[0].goldIssued, 100);
    const sql = readFileSync('lib/shop.ts', 'utf8').match(/BALANCE_SQL = `([\s\S]*?)`;/)[1];
    assert.equal(db.prepare(sql).get('one', 'one').balance, 200);
    db.prepare('INSERT INTO skin_purchases VALUES(?,?,?,?)').run('one', 'skin', 120, now);
    assert.equal(db.prepare(sql).get('one', 'one').balance, 80);
    db.close();
  } finally {
    Date.now = originalNow;
    delete globalThis.__newsDb;
    rmSync(dir, { recursive: true, force: true });
  }
});
