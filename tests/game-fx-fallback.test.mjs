import test from 'node:test';
import assert from 'node:assert/strict';
import { launchGameEffect } from '../lib/game-fx.mjs';
test('missing anchor is harmless and WebGL failure falls back then fully cleans up', async () => {
  const original = new Map(
    ['document', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'cancelAnimationFrame'].map(
      (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)],
    ),
  );
  let removed = 0,
    finished,
    done = 0,
    animations = 0;
  const element = () => ({
    style: {},
    dataset: {},
    setAttribute() {},
    append() {},
    prepend() {},
    remove() {
      removed++;
    },
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 100 }),
    animate() {
      animations++;
      return {
        finished: new Promise((r) => {
          finished = r;
        }),
        cancel() {
          finished();
        },
      };
    },
  });
  const card = { ...element(), getAttribute: () => 'me', isConnected: true };
  const doc = {
    querySelectorAll: () => [],
    querySelector: () => null,
    body: { append() {} },
    createElement: element,
    createElementNS: () => {
      throw Error('WebGL unavailable');
    },
  };
  try {
    Object.assign(globalThis, {
      document: doc,
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 1,
      cancelAnimationFrame() {},
    });
    launchGameEffect({ kind: 'shield', actorId: 'me', targetId: 'me' }, () => done++);
    await Promise.resolve();
    assert.equal(done, 1);
    assert.equal(animations, 0);
    doc.querySelectorAll = () => [card];
    const stop = launchGameEffect({ kind: 'shield', actorId: 'me', targetId: 'me' }, () => done++);
    assert.equal(animations, 1);
    stop();
    await Promise.resolve();
    assert.equal(removed, 1);
    assert.equal(done, 2);
    stop();
    assert.equal(removed, 1, 'cleanup is idempotent');
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
