import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startToktok,
  tapToktok,
  hintToktok,
  hasToktokMove,
  finishedToktok,
  TOKTOK_TURNS,
} from '../lib/jamo-toktok.mjs';
import { replayToktok, readToktok, writeToktok, TOKTOK_KEY } from '../lib/toktok-progress.mjs';
const storage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};
test('compound vowel links its base vowels and shared compounds, but not unrelated ㄲ', () => {
  const s = startToktok(43),
    copy = structuredClone(s),
    n = tapToktok(s, 12);
  assert.equal(n.triggered, 2);
  assert.ok(n.waves.some((w) => w.glyph === 'ㅘ'));
  assert.ok(n.waves.some((w) => w.glyph === 'ㅐ'));
  assert.ok(!n.cells.includes(4));
  assert.equal(new Set(n.cells).size, n.cells.length);
  assert.equal(n.points, n.cells.length ** 2 * 20 + 1000);
  assert.deepEqual(s, copy);
});
test('synthesis consumes a visible ingredient and creates a real compound', () => {
  for (const [ch, ingredient, earned] of [
    [0, null, 5],
    [1, 3, 6],
    [4, 1, 7],
  ]) {
    const s = startToktok(1);
    s.board = Array.from({ length: 25 }, () => ({ ch: 2 }));
    [0, 1, 5, 6].forEach((i) => (s.board[i] = { ch }));
    if (ingredient !== null) s.board[24] = { ch: ingredient };
    const n = tapToktok(s, 0);
    assert.equal(n.earned, earned);
    assert.ok(n.board.some((t) => t.ch === earned));
    if (ingredient !== null) assert.ok(n.cells.includes(24));
  }
});
test('missing ingredient cannot create a compound vowel', () => {
  const s = startToktok(1);
  s.board = Array.from({ length: 25 }, () => ({ ch: 2 }));
  [0, 1, 5, 6].forEach((i) => (s.board[i] = { ch: 1 }));
  assert.equal(tapToktok(s, 0).earned, null);
});
test('a base singleton is invalid, a compound singleton is playable', () => {
  const s = startToktok(1);
  s.board = Array.from({ length: 25 }, (_, i) => ({ ch: i % 2 }));
  s.board[12] = { ch: 2 };
  assert.equal(tapToktok(s, 12), null);
  s.board[12] = { ch: 5 };
  assert.ok(tapToktok(s, 12));
  for (const index of [-1, 25, 1.5, '1', NaN, null]) assert.equal(tapToktok(s, index), null);
});
test('target and turn limit reject subsequent taps', () => {
  for (const patch of [{ turn: TOKTOK_TURNS }, { score: 18000 }]) {
    const s = { ...startToktok(1), ...patch };
    assert.ok(finishedToktok(s));
    assert.equal(tapToktok(s, 12), null);
    assert.equal(hintToktok(s), null);
  }
});
test('many seeds replay exactly with playable next boards and finite scores', () => {
  for (let seed = 1; seed <= 100; seed++) {
    let s = startToktok(seed),
      moves = [];
    while (!finishedToktok(s)) {
      const h = hintToktok(s);
      assert.ok(h);
      moves.push(h.index);
      s = tapToktok(s, h.index);
      assert.equal(s.board.length, 25);
      assert.ok(s.board.every((t) => Number.isInteger(t.ch) && t.ch >= 0 && t.ch <= 7));
      assert.ok(Number.isSafeInteger(s.score));
      if (!finishedToktok(s)) assert.ok(hasToktokMove(s.board));
      assert.deepEqual(replayToktok(seed, moves), s);
    }
  }
});
test('current board, undo and completed round restore without storing animation', () => {
  const store = storage();
  store.setItem('other-record', 'keep');
  const s = tapToktok(startToktok(43), 12),
    p = { seed: 43, moves: [12], best: s.score };
  assert.ok(writeToktok(store, p));
  assert.deepEqual(readToktok(store, 1), { ...p, rules: 1, round: 1, bestRound: 1 });
  assert.deepEqual(replayToktok(43, []), startToktok(43));
  assert.equal(store.getItem('other-record'), 'keep');
});
test('invalid saved moves, seeds, oversized replay and broken JSON recover safely', () => {
  const store = storage();
  for (const raw of [
    '{',
    'null',
    JSON.stringify({ version: 2 }),
    JSON.stringify({ version: 1, seed: -1, moves: [], best: 99 }),
    JSON.stringify({ version: 1, seed: 43, moves: [25], best: 99 }),
    JSON.stringify({ version: 1, seed: 43, moves: Array(19).fill(12), best: 99 }),
  ]) {
    store.setItem(TOKTOK_KEY, raw);
    const p = readToktok(store, 42);
    assert.equal(p.seed, 42);
    assert.deepEqual(p.moves, []);
  }
  assert.equal(replayToktok('43', []), null);
  assert.equal(replayToktok(1, null), null);
});
test('storage exceptions are handled and invalid state is not written', () => {
  const bad = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('full');
    },
  };
  assert.deepEqual(readToktok(bad, 5), {
    seed: 5,
    moves: [],
    best: 0,
    rules: 2,
    round: 1,
    bestRound: 1,
  });
  assert.equal(writeToktok(bad, { seed: 5, moves: [], best: 0 }), false);
  assert.equal(writeToktok(storage(), { seed: 1, moves: [99], best: 0 }), false);
});
