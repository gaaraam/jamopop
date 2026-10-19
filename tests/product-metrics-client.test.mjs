import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const mapStorage = () => {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
    clear: () => values.clear(),
  };
};
test('client sends nothing without consent, batches without cookies, deduplicates refresh, resumes fairly, respects withdrawal and GPC', async () => {
  const saved = Object.fromEntries(
    ['window', 'localStorage', 'sessionStorage', 'navigator', 'fetch'].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  const sent = [];
  try {
    Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: mapStorage(), configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mapStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { doNotTrack: '0' },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'fetch', {
      value: async (url, init) => {
        sent.push({ url, init, body: JSON.parse(init.body) });
        return new Response(null, { status: 204 });
      },
      configurable: true,
    });
    let source = readFileSync(
      new URL('../lib/product-metrics-client.ts', import.meta.url),
      'utf8',
    ).replace(
      "'./product-metrics.mjs'",
      JSON.stringify(new URL('../lib/product-metrics.mjs', import.meta.url).href),
    );
    source = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const client = await import(
      'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
    );
    client.observeGame('toktok', { key: 'seed-private', steps: 0, status: 'playing' });
    await client.flushMeasurements();
    assert.equal(sent.length, 0);
    client.changeMeasurement(true);
    client.observeGame('toktok', { key: 'seed-private', steps: 0, status: 'playing' });
    client.observeGame('toktok', { key: 'seed-private', steps: 0, status: 'playing' });
    client.observeGame('toktok', { key: 'seed-private', steps: 1, status: 'won' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await client.flushMeasurements();
    const events = sent.flatMap((x) => x.body.events);
    assert.deepEqual(
      events.map((x) => x.name),
      ['view', 'start', 'first_action', 'complete'],
    );
    assert.equal(sent[0].init.credentials, 'omit');
    assert.equal(sent[0].init.keepalive, true);
    assert(!JSON.stringify(sent).includes('seed-private'));
    client.observeGame('toktok', { key: 'seed-private', steps: 1, status: 'won' });
    await client.flushMeasurements();
    assert.equal(sent.flatMap((x) => x.body.events).length, 4);
    client.newMeasuredAttempt('toktok', 'retry');
    client.observeGame('toktok', { key: 'seed-private', steps: 0, status: 'playing' });
    await client.flushMeasurements();
    assert.equal(sent.flatMap((x) => x.body.events).filter((x) => x.name === 'retry').length, 1);
    client.changeMeasurement(false);
    assert.equal(localStorage.getItem('jamopop-metrics-browser-v1'), null);
    client.observeGame('toktok', { key: 'seed-private', steps: 1, status: 'won' });
    const before = sent.length;
    await client.flushMeasurements();
    assert.equal(sent.length, before);
    navigator.globalPrivacyControl = true;
    client.changeMeasurement(true);
    assert.equal(client.measurementAllowed(), false);
    navigator.globalPrivacyControl = false;
    navigator.doNotTrack = '1';
    assert.equal(client.measurementAllowed(), false);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
