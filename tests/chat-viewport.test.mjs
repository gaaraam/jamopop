import test from 'node:test';
import assert from 'node:assert/strict';
import { chatViewport } from '../lib/chat-viewport.mjs';
test('software keyboard lift accounts for Safari scrolling and restores when focus leaves', () => {
  assert.deepEqual(chatViewport({ innerHeight: 800, height: 500, offsetTop: 40, focused: true }), {
    bottom: 260,
    height: 500,
  });
  assert.deepEqual(chatViewport({ innerHeight: 800, height: 500, offsetTop: 40, focused: false }), {
    bottom: 0,
    height: 500,
  });
  assert.deepEqual(chatViewport({ innerHeight: 600, height: 640, focused: true }), {
    bottom: 0,
    height: 640,
  });
});
test('pinch zoom and invalid viewport geometry do not displace chat', () => {
  assert.deepEqual(chatViewport({ innerHeight: 800, height: 400, scale: 2, focused: true }), {
    bottom: 0,
    height: 0,
  });
  assert.deepEqual(chatViewport({ innerHeight: 800, height: NaN, focused: true }), {
    bottom: 0,
    height: 0,
  });
});
