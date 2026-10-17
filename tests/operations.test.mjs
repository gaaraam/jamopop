import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measureRequest,
  measuredDatabase,
  metricPath,
  operationAlerts,
} from '../lib/operational-metrics.mjs';
test('operational logs exclude identities, query strings, words, errors and raw paths', async () => {
  const lines = [];
  const req = new Request('https://example.test/api/game?room=SECRET&word=ANSWER', {
    headers: { Cookie: 'private', Authorization: 'secret' },
  });
  const response = await measureRequest(
    req,
    async () => new Response('ANSWER'),
    (s) => lines.push(s),
  );
  assert.equal(response.status, 200);
  assert.equal(lines.length, 1);
  assert(!/SECRET|ANSWER|private|secret/.test(lines[0]));
  assert.equal(metricPath('https://x/api/unknown-account-id'), '/api/other');
  assert.equal(metricPath('https://x/transfer?ticket=token'), '/page');
  await assert.rejects(
    measureRequest(
      req,
      async () => {
        throw Error('private');
      },
      (s) => lines.push(s),
    ),
  );
  assert.equal(JSON.parse(lines[1]).status, 500);
  assert(!lines[1].includes('private'));
});
test('request-local metrics isolate simultaneous traffic and preserve DB result contracts', async () => {
  const logs = [];
  const db = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first(column) {
          return column ? 'value' : { value: 'value' };
        },
        async all() {
          return { results: [{ value: 'value' }], meta: { rows_read: 3, rows_written: 0 } };
        },
      };
    },
    async batch(stmts) {
      return stmts.map(() => ({ success: true, meta: { rows_read: 2, rows_written: 1 } }));
    },
  };
  await Promise.all(
    [1, 2].map((n) =>
      measureRequest(
        new Request('https://x/api/game'),
        async () => {
          const wrapped = measuredDatabase(db);
          for (let i = 0; i < n; i++) await wrapped.prepare('not logged').bind('secret').all();
          assert.equal(await wrapped.prepare('secret').first('value'), 'value');
          const result = await wrapped.batch([wrapped.prepare('x')]);
          assert.equal(result[0].success, true);
          return new Response();
        },
        (x) => logs.push(JSON.parse(x)),
      ),
    ),
  );
  assert.deepEqual(logs.map((x) => x.rowsRead).sort(), [5, 8]);
  assert.deepEqual(logs.map((x) => x.queries).sort(), [3, 4]);
  assert(logs.every((x) => x.queriesWithoutRowCounts === 1));
});
test('alerts need a sample floor and signal failure, tail latency and throttling separately', () => {
  assert.deepEqual(operationAlerts([]).alerts, []);
  assert.deepEqual(operationAlerts([{ status: 500, durationMs: 9000 }]).alerts, []);
  const samples = Array.from({ length: 100 }, (_, i) => ({
    status: i < 2 ? 500 : i < 10 ? 429 : 200,
    durationMs: i < 10 ? 2000 : 100,
  }));
  assert.deepEqual(operationAlerts(samples).alerts, ['server_errors', 'latency', 'rate_limit']);
});
