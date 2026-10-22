import test from 'node:test';
import assert from 'node:assert/strict';
import { judgmentTiming, playWordCue } from '../lib/word-feedback.mjs';
test('victory starts after every tile judgment, with no added gameplay wait', () => {
  for (const width of [5, 6, 7, 8]) {
    const t = judgmentTiming(width);
    assert.equal(t.end, (width - 1) * t.stagger + t.flip);
    assert.ok(t.end < 700);
  }
});
test('sound envelope is quiet, starts after judgment and disconnects nodes', () => {
  const starts = [],
    stops = [],
    gains = [],
    disconnected = [];
  const audio = {
    currentTime: 10,
    destination: {},
    createOscillator() {
      const o = {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {
          disconnected.push('osc');
        },
        start(t) {
          starts.push(t);
        },
        stop(t) {
          stops.push(t);
        },
        onended: null,
      };
      queueMicrotask(() => o.onended());
      return o;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime(v) {
            gains.push(v);
          },
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {
          disconnected.push('gain');
        },
      };
    },
  };
  playWordCue(audio, 'win', 0.5);
  assert.deepEqual(starts, [10.5, 10.575, 10.65]);
  assert.ok(stops.every((t, i) => t > starts[i] && t - starts[i] < 0.3));
  assert.ok(gains.every((v) => v <= 0.035));
  return new Promise((resolve) =>
    queueMicrotask(() => {
      assert.equal(disconnected.length, 6);
      resolve();
    }),
  );
});
