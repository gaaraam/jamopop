import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const moduleUrl = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
async function walletHarness() {
  const states = [],
    refs = [],
    effects = [],
    pending = [];
  let stateIndex = 0,
    refIndex = 0;
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [
        states[index],
        (v) => {
          states[index] = typeof v === 'function' ? v(states[index]) : v;
        },
      ];
    },
    useRef(v) {
      const i = refIndex++;
      return (refs[i] ||= { current: v });
    },
    useCallback: (f) => f,
    useEffect: (f) => effects.push(f),
  };
  globalThis.__walletReact = react;
  globalThis.fetch = (url, options) =>
    new Promise((resolve, reject) => pending.push({ url, options, resolve, reject }));
  let code = ts
    .transpileModule(readFileSync('components/game/hooks/use-shop-wallet.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(
      "from 'react'",
      `from ${JSON.stringify(moduleUrl('export const {useState,useRef,useCallback,useEffect}=globalThis.__walletReact; //' + Math.random()))}`,
    );
  const { useShopWallet } = await import(moduleUrl(code + '\n//' + Math.random()));
  function render() {
    stateIndex = 0;
    refIndex = 0;
    effects.length = 0;
    return useShopWallet();
  }
  return { render, pending, effects };
}
const reply = (p, status, data) =>
  p.resolve({ status, ok: status === 200, json: async () => data });
test('unknown wallet stays pending, duplicate reads and mutation clicks coalesce', async () => {
  const h = await walletHarness();
  let view = h.render();
  assert.equal(view.data, null);
  assert.equal(view.loading, true);
  const first = view.request();
  assert.equal(await view.request(), false);
  assert.equal(h.pending.length, 1);
  reply(h.pending[0], 200, { balance: 90, owned: ['skin'] });
  await first;
  view = h.render();
  assert.deepEqual(view.data.owned, ['skin']);
  const buy = view.request({ action: 'buy', skin: 'second' });
  assert.equal(await view.request({ action: 'buy', skin: 'second' }), false);
  assert.equal(h.pending.length, 2);
  reply(h.pending[1], 200, { balance: 10, owned: ['skin', 'second'] });
  assert.equal(await buy, true);
  assert.equal(h.render().data.balance, 10);
});
test('network failure is not a guest; retry clears error and only 401 clears ownership', async () => {
  const h = await walletHarness();
  let view = h.render();
  const failed = view.request();
  h.pending[0].reject(Error('offline'));
  await failed;
  view = h.render();
  assert.equal(view.guest, false);
  assert.equal(view.error, 'offline');
  const retry = view.request();
  assert.equal(h.render().error, '');
  assert.equal(h.render().loading, true);
  reply(h.pending[1], 200, { balance: 5, owned: ['one'] });
  await retry;
  const expired = h.render().request({ action: 'equip' });
  reply(h.pending[2], 401, { error: '로그인 필요' });
  await expired;
  view = h.render();
  assert.equal(view.guest, true);
  assert.equal(view.data, null);
  assert.equal(view.loading, false);
});
test('unmounted or replaced wallet ignores late responses and cannot unlock a newer request', async () => {
  const h = await walletHarness();
  h.render();
  const dispose = h.effects[0]();
  dispose();
  const next = h.render().request();
  reply(h.pending[0], 200, { balance: 999 });
  await new Promise((r) => setImmediate(r));
  assert.equal(h.render().data, null);
  assert.equal(await h.render().request(), false);
  reply(h.pending[1], 200, { balance: 7 });
  await next;
  assert.equal(h.render().data.balance, 7);
});
test('reward received during a pending wallet request queues a fresh balance read', async () => {
  const previousWindow = globalThis.window,
    listeners = new Map();
  globalThis.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  try {
    const h = await walletHarness();
    h.render();
    const dispose = h.effects[0]();
    const remove = h.effects[1]();
    listeners.get('jamopop-reward-claimed')();
    reply(h.pending[0], 200, { balance: 10 });
    await new Promise((r) => setImmediate(r));
    assert.equal(h.pending.length, 2);
    reply(h.pending[1], 200, { balance: 60 });
    await new Promise((r) => setImmediate(r));
    assert.equal(h.render().data.balance, 60);
    dispose();
    remove();
  } finally {
    globalThis.window = previousWindow;
  }
});
