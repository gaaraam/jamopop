import test from 'node:test';
import assert from 'node:assert/strict';
import { measureRequest, measuredDatabase } from '../lib/operational-metrics.mjs';
async function scenario(sql, failures, method = 'first') {
  let attempts = 0;
  const logs = [];
  const db = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async [method]() {
          if (++attempts <= failures) throw Error('private provider details');
          return method === 'first' ? { allowed: true } : { results: [] };
        },
      };
    },
  };
  let response, error;
  try {
    response = await measureRequest(
      new Request('https://test/api/game'),
      async () => {
        const result = await measuredDatabase(db).prepare(sql).bind('private identity')[method]();
        return Response.json(result);
      },
      (line) => logs.push(JSON.parse(line)),
    );
  } catch (e) {
    error = e;
  }
  assert(!JSON.stringify(logs).includes('private'));
  return { attempts, response, error, metrics: logs[0] };
}
test('read failure is retried within a strict budget and records recovery', async () => {
  const r = await scenario('SELECT kind FROM safety_restrictions WHERE subject=?', 1);
  assert.equal(r.response.status, 200);
  assert.equal(r.attempts, 2);
  assert.equal(r.metrics.storageErrors, 1);
  assert.equal(r.metrics.storageRetries, 1);
  assert.equal(r.metrics.storageCalls, 2);
});
test('persistent read failure still fails closed after three attempts', async () => {
  const r = await scenario('SELECT 1', 10);
  assert(r.error);
  assert.equal(r.attempts, 3);
  assert.equal(r.metrics.status, 500);
  assert.equal(r.metrics.storageRetries, 2);
});
test('writes, RETURNING, multi-statements and run are never automatically replayed', async () => {
  for (const [sql, method] of [
    ['INSERT INTO t VALUES(?) RETURNING id', 'first'],
    ['UPDATE t SET id=?', 'first'],
    ['SELECT 1; DELETE FROM t', 'first'],
    ['SELECT 1', 'run'],
  ]) {
    const r = await scenario(sql, 10, method);
    assert(r.error);
    assert.equal(r.attempts, 1);
    assert.equal(r.metrics.storageRetries, 0);
  }
});
