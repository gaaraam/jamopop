import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCelebrateRank } from '../lib/rank-feedback.ts';
const s = (rank, roundId = 'round-1') => ({ rank, roundId });
test('celebrates podium entry and promotion, not polling or demotion', () => {
  assert.equal(shouldCelebrateRank(s(), s(3)), true);
  assert.equal(shouldCelebrateRank(s(3), s(1)), true);
  assert.equal(shouldCelebrateRank(s(1), s(1)), false);
  assert.equal(shouldCelebrateRank(s(1), s(2)), false);
  assert.equal(shouldCelebrateRank(s(3), s(4)), false);
  assert.equal(shouldCelebrateRank(s(), s(4)), false);
});
test('round changes and cleared ranks never replay a stale celebration', () => {
  assert.equal(shouldCelebrateRank(s(), s(1, 'round-2')), false);
  assert.equal(shouldCelebrateRank(s(1), s()), false);
});
