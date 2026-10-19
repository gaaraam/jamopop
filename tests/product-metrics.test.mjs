import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  advanceMetric,
  validateMetricBatch,
  saveMetricBatch,
  readProductMetrics,
  cleanupProductMetrics,
  metricScene,
} from '../lib/product-metrics.mjs';
import { productMetricsEndpoint } from '../build/product-metrics.mjs';
const visitor = randomUUID(),
  session = randomUUID(),
  run = randomUUID();
const evt = (name, extra = {}) => ({ id: randomUUID(), run, mode: 'toktok', name, ...extra });
const batch = (events) => ({ version: 1, visitor, session, events });
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0032_product_metrics.sql', import.meta.url), 'utf8'));
  sql.exec(
    "CREATE TABLE safety_rate(key TEXT PRIMARY KEY,hits INTEGER,expires_at INTEGER);CREATE TABLE existing_records(id TEXT, gold INTEGER); INSERT INTO existing_records VALUES('preserve',1490);",
  );
  const db = {
    prepare(query) {
      const s = sql.prepare(query);
      let args = [];
      return {
        bind(...v) {
          args = v;
          return this;
        },
        async first() {
          return s.get(...args) || null;
        },
        async all() {
          return { results: s.all(...args) };
        },
        async run() {
          return { meta: s.run(...args) };
        },
      };
    },
    async batch(stmts) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const s of stmts) results.push(await s.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sql, db };
}
test('strict event vocabulary rejects identity, text, URLs, extra fields, oversized/invalid batches', () => {
  assert.ok(validateMetricBatch(batch([evt('view')])));
  for (const privateField of ['email', 'word', 'chat', 'url', 'account', 'room', 'ip']) {
    assert.equal(validateMetricBatch({ ...batch([evt('view')]), [privateField]: 'private' }), null);
    assert.equal(validateMetricBatch(batch([evt('view', { [privateField]: 'private' })])), null);
  }
  assert.equal(validateMetricBatch(batch(Array.from({ length: 13 }, () => evt('view')))), null);
  assert.equal(validateMetricBatch({ ...batch([evt('view')]), visitor: 'account:123' }), null);
  assert.equal(validateMetricBatch(batch([evt('complete')])), null);
  assert.equal(validateMetricBatch(batch([evt('first_action', { outcome: 'won' })])), null);
  assert.equal(
    validateMetricBatch(batch([evt('complete', { outcome: 'won' })]))?.events[0].outcome,
    'won',
  );
  assert.equal(metricScene('/', '?lobby=1&r=private'), 'lobby');
  assert.equal(metricScene('/solo/toktok', '?word=private'), null);
  assert.equal(metricScene('/admin/users', '?email=private'), null);
});
test('restored saves and undo do not synthesize completions; first move win emits ordered action + complete once', () => {
  let p = advanceMetric(null, { key: 'a', steps: 0, status: 'playing' });
  assert.deepEqual(p.events, ['view', 'start']);
  p = advanceMetric(p.state, { key: 'a', steps: 1, status: 'won' });
  assert.deepEqual(p.events, ['first_action', 'complete']);
  assert.deepEqual(advanceMetric(p.state, { key: 'a', steps: 1, status: 'won' }).events, []);
  const undone = advanceMetric(p.state, { key: 'a', steps: 0, status: 'playing' });
  assert.deepEqual(advanceMetric(undone.state, { key: 'a', steps: 1, status: 'won' }).events, []);
  assert.deepEqual(advanceMetric(null, { key: 'a', steps: 18, status: 'won' }).events, ['view']);
  const resumed = advanceMetric(null, { key: 'b', steps: 3, status: 'playing' });
  assert.deepEqual(resumed.events, ['view', 'start']);
  assert.deepEqual(
    advanceMetric(resumed.state, { key: 'b', steps: 3, status: 'timeout' }).events,
    [],
  );
  assert.deepEqual(
    advanceMetric(resumed.state, { key: 'b', steps: 2, status: 'playing' }).events,
    [],
  );
});
test('real SQL deduplicates retries, keeps cohorts separate, counts return on distinct KST dates and expires only new events', async () => {
  const { sql, db } = fixture(),
    now = Date.UTC(2026, 9, 19, 10);
  const b = validateMetricBatch(
    batch([
      evt('view'),
      evt('start'),
      evt('first_action'),
      evt('complete', { outcome: 'won' }),
      evt('retry'),
    ]),
  );
  await saveMetricBatch(db, b, now - 86400000);
  await saveMetricBatch(db, b, now - 86400000);
  await saveMetricBatch(db, validateMetricBatch(batch([evt('complete', { outcome: 'won' })])), now); // semantic duplicate
  await saveMetricBatch(
    db,
    {
      ...b,
      session: randomUUID(),
      events: [{ ...evt('view'), run: randomUUID(), mode: 'lobby', outcome: null }],
    },
    now,
  );
  await saveMetricBatch(
    db,
    validateMetricBatch({
      ...batch([evt('complete', { outcome: 'won' })]),
      visitor: randomUUID(),
      session: randomUUID(),
    }),
    now,
  ); // orphan must not inflate funnel
  const report = await readProductMetrics(db, 7, now);
  assert.equal(report.summary.returningBrowsers, 1);
  const funnel = report.funnel.find((x) => x.mode === 'toktok');
  assert.equal(funnel.starts, 1);
  assert.equal(funnel.actions, 1);
  assert.equal(funnel.completions, 1);
  assert.equal(funnel.wins, 1);
  assert.equal(funnel.retries, 1);
  assert(!JSON.stringify(report).includes(visitor));
  assert(!JSON.stringify(report).includes(session));
  assert.equal(report.daily[0].day, '2026-10-19');
  await cleanupProductMetrics(db, now + 8 * 86400000);
  assert.equal(sql.prepare('SELECT count(*) n FROM product_events').get().n, 0);
  assert.equal(sql.prepare('SELECT gold FROM existing_records').get().gold, 1490);
});
test('collector enforces same origin, content size/type, quotas, and does not inspect auth cookies', async () => {
  const { db, sql } = fixture();
  const request = (body = batch([evt('view')]), headers = {}) =>
    new Request('https://game.test/api/product-metrics', {
      method: 'POST',
      headers: {
        Origin: 'https://game.test',
        'Content-Type': 'application/json',
        Cookie: 'private-account-cookie',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  assert.equal((await productMetricsEndpoint(request(), { DB: db })).status, 204);
  assert.equal(
    (await productMetricsEndpoint(request(undefined, { Origin: 'https://evil.test' }), { DB: db }))
      .status,
    403,
  );
  assert.equal(
    (await productMetricsEndpoint(request(undefined, { 'Content-Type': 'text/plain' }), { DB: db }))
      .status,
    415,
  );
  assert.equal((await productMetricsEndpoint(request('x'.repeat(6001)), { DB: db })).status, 413);
  assert.equal(
    (await productMetricsEndpoint(request(batch([evt('view', { word: 'secret' })])), { DB: db }))
      .status,
    400,
  );
  const saved = JSON.stringify(sql.prepare('SELECT * FROM product_events').all());
  assert(!/cookie|secret|private-account/.test(saved));
  for (let i = 0; i < 60; i++)
    assert.equal(
      (
        await productMetricsEndpoint(request(undefined, { 'CF-Connecting-IP': '192.0.2.1' }), {
          DB: db,
        })
      ).status,
      204,
    );
  assert.equal(
    (
      await productMetricsEndpoint(request(undefined, { 'CF-Connecting-IP': '192.0.2.1' }), {
        DB: db,
      })
    ).status,
    429,
  );
});
