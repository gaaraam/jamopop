import test from 'node:test';
import assert from 'node:assert/strict';
import { launchCheerBurst } from '../lib/cheer-burst.ts';
test('100 particles launch quickly, fall slowly, overlap safely and clean up', () => {
  let callback,
    draws = 0,
    positions = [],
    canvases = 0,
    reduced = false;
  const ctx = {
    setTransform() {},
    clearRect() {
      draws = 0;
      positions = [];
    },
    save() {},
    restore() {},
    rotate() {},
    translate(x, y) {
      positions.push([x, y]);
    },
    drawImage() {
      draws++;
    },
    fillText() {},
    fillRect() {},
  };
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  globalThis.devicePixelRatio = 1;
  globalThis.matchMedia = () => ({ matches: reduced });
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    body: {
      appendChild() {
        canvases++;
      },
    },
    createElement() {
      return {
        setAttribute() {},
        getContext() {
          return ctx;
        },
        remove() {
          canvases--;
        },
      };
    },
  };
  globalThis.requestAnimationFrame = (cb) => ((callback = cb), 1);
  globalThis.cancelAnimationFrame = () => {};
  const anchor = {
    getBoundingClientRect: () => ({ left: 400, top: 300, width: 0, height: 0, bottom: 300 }),
  };
  const start = performance.now(),
    release = launchCheerBurst(anchor, '👏');
  callback(start + 200);
  assert.equal(draws, 100);
  const peak = positions[0][1];
  callback(start + 1600);
  assert.equal(draws, 100);
  assert(positions[0][1] > peak);
  const release2 = launchCheerBurst(anchor, '🔥');
  assert.equal(canvases, 1);
  release();
  callback(performance.now() + 200);
  assert.equal(draws, 100);
  release2();
  assert.equal(canvases, 0);
  const releaseWin = launchCheerBurst(anchor, '🎉', true);
  callback(performance.now() + 200);
  assert.equal(draws, 100);
  releaseWin();
  assert.equal(canvases, 0);
  reduced = true;
  launchCheerBurst(anchor, '👏');
  assert.equal(canvases, 0);
  reduced = false;
  launchCheerBurst(anchor, '👏');
  callback(performance.now() + 4000);
  assert.equal(canvases, 0);
});
