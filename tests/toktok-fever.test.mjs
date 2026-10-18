import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startToktok,
  tapToktok,
  hintToktok,
  finishedToktok,
  targetToktok,
  TOKTOK_FEVER,
} from '../lib/jamo-toktok.mjs';
import {
  TOKTOK_KEY,
  replayToktok,
  readToktok,
  writeToktok,
  nextToktokRound,
} from '../lib/toktok-progress.mjs';
const storage = () => {
  let value = null;
  return { getItem: () => value, setItem: (k, v) => (value = v) };
};
test('a saved legacy board and its score are not silently reinterpreted by fever rules', () => {
  const seed = 43,
    moves = [12],
    old = replayToktok(seed, moves),
    store = storage();
  store.setItem(TOKTOK_KEY, JSON.stringify({ version: 1, seed, moves, best: old.score }));
  const saved = readToktok(store, 999);
  assert.equal(saved.rules, 1);
  assert.deepEqual(replayToktok(saved.seed, saved.moves, saved), old);
  assert.ok(writeToktok(store, saved));
  assert.deepEqual(readToktok(store, 999), saved);
  const fresh = nextToktokRound(saved, 55, true);
  assert.equal(fresh.rules, 2);
  assert.equal(fresh.round, 1);
  assert.equal(fresh.best, saved.best);
});
test('fever fills only on legal earned actions and is consumed exactly once', () => {
  const s = { ...startToktok(43, { rules: 2, round: 3 }), fever: TOKTOK_FEVER };
  const index = hintToktok(s).index;
  const plain = tapToktok({ ...s, fever: 0 }, index),
    boost = tapToktok(s, index);
  assert.equal(boost.points, plain.points * 2);
  assert.equal(boost.fever, 0);
  assert.equal(boost.feverCount, 1);
  assert.ok(boost.feverUsed);
  assert.equal(s.fever, TOKTOK_FEVER);
  const h = hintToktok(boost),
    after = tapToktok(boost, h.index);
  assert.equal(after.feverUsed, false);
  assert.equal(after.feverCount, 1);
  assert.equal(tapToktok(s, -1), null);
  assert.equal(s.fever, TOKTOK_FEVER);
});
test('charge is capped, tiny base pairs do not fill fever, and undo can restore the primed move', () => {
  const s = startToktok(43, { rules: 2, round: 4 });
  s.board = Array.from({ length: 25 }, () => ({ ch: 2 }));
  s.board[0] = { ch: 0 };
  s.board[1] = { ch: 0 };
  const n = tapToktok(s, 0);
  assert.equal(n.fever, 0);
  const seed = 43,
    p = { rules: 2, round: 4 },
    firstIndex = hintToktok(startToktok(seed, p)).index,
    first = tapToktok(startToktok(seed, p), firstIndex);
  assert.ok(first.fever > 0 && first.fever <= 6);
  assert.deepEqual(replayToktok(seed, [firstIndex], p), first);
  assert.deepEqual(replayToktok(seed, [], p), startToktok(seed, p));
});
test('higher round targets rise to the cap and do not terminate at the old target', () => {
  assert.equal(targetToktok(startToktok(1, { rules: 2, round: 1 })), 18000);
  assert.equal(targetToktok(startToktok(1, { rules: 2, round: 2 })), 20000);
  assert.equal(targetToktok(startToktok(1, { rules: 2, round: 99 })), 30000);
  assert.equal(finishedToktok({ ...startToktok(1, { rules: 2, round: 2 }), score: 18000 }), false);
  assert.equal(finishedToktok({ ...startToktok(1), score: 18000 }), true);
});
test('new-game progression needs an actual clear and retains round on retry', () => {
  let p = { seed: 43, moves: [], best: 0, rules: 2, round: 1, bestRound: 1 };
  let s = replayToktok(p.seed, p.moves, p);
  const premature = nextToktokRound(p, 77, true);
  assert.equal(premature.round, 1);
  while (!finishedToktok(s)) {
    const h = hintToktok(s);
    p.moves.push(h.index);
    s = tapToktok(s, h.index);
  }
  assert.ok(s.score >= targetToktok(s));
  p.best = s.score;
  const next = nextToktokRound(p, 77, true);
  assert.equal(next.round, 2);
  assert.equal(next.best, p.best);
  assert.equal(next.bestRound, 2);
  assert.equal(nextToktokRound(next, 88).round, 2);
  const store = storage();
  assert.ok(writeToktok(store, next));
  assert.deepEqual(readToktok(store, 1), next);
});
test('all enhanced move transcripts restore charge, maximum chain and fever counts', () => {
  for (let seed = 1; seed <= 75; seed++) {
    const options = { rules: 2, round: 1 + (seed % 7) };
    let s = startToktok(seed, options),
      moves = [];
    while (!finishedToktok(s)) {
      const h = hintToktok(s);
      assert.ok(h);
      moves.push(h.index);
      s = tapToktok(s, h.index);
      assert.ok(s.fever >= 0 && s.fever <= 6);
      assert.deepEqual(replayToktok(seed, moves, options), s);
    }
  }
});
test('malformed future saves cannot create an undefined mode or invalid round', () => {
  for (const patch of [
    { rules: undefined, round: 1 },
    { rules: 3, round: 1 },
    { rules: 2, round: 0 },
    { rules: 2, round: 1000 },
    { rules: 2, round: 1.5 },
  ]) {
    const store = storage();
    store.setItem(
      TOKTOK_KEY,
      JSON.stringify({ version: 2, seed: 43, moves: [12], best: 55, ...patch }),
    );
    const restored = readToktok(store, 7);
    assert.equal(restored.seed, 7);
    assert.equal(restored.rules, 2);
    assert.equal(restored.round, 1);
    assert.equal(restored.best, 55);
  }
});
test('enhanced starting shelves vary by seed while retaining three compounds and legal base pairs', () => {
  const a = startToktok(1, { rules: 2, round: 1 }),
    b = startToktok(2, { rules: 2, round: 1 });
  assert.notDeepEqual(a.board, b.board);
  assert.deepEqual(a, startToktok(1, { rules: 2, round: 1 }));
  for (const ch of [5, 6, 7]) assert.equal(a.board.filter((t) => t.ch === ch).length, 1);
  assert.ok(a.board.some((t, i) => t.ch < 5 && tapToktok(a, i)));
  assert.deepEqual(startToktok(43).board[12], { ch: 6 });
});
test('migration writes the new key and leaves the original legacy snapshot available for rollback', () => {
  const values = new Map(),
    store = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const legacy = JSON.stringify({ version: 1, seed: 43, moves: [12], best: 10000 });
  values.set('jamopop-toktok-v1', legacy);
  const imported = readToktok(store, 1);
  assert.equal(imported.rules, 1);
  assert.equal(imported.best, 10000);
  assert.ok(writeToktok(store, imported));
  assert.equal(values.get('jamopop-toktok-v1'), legacy);
  assert.ok(values.has('jamopop-toktok-v2'));
  const newRound = nextToktokRound(imported, 88);
  assert.ok(writeToktok(store, newRound));
  assert.equal(readToktok(store, 1).rules, 2);
  assert.equal(values.get('jamopop-toktok-v1'), legacy);
});
