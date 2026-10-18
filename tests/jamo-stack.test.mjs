import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STACK_STAGES } from '../lib/stack-stages.mjs';
import { takeStack, searchStack } from '../lib/jamo-stack.mjs';
import { replayStack, readStack, writeStack, STACK_KEY } from '../lib/stack-progress.mjs';
const proofs = JSON.parse(readFileSync(new URL('./stack-proofs.json', import.meta.url)));
for (const s of STACK_STAGES)
  test(`stack ${s.id}: triples, fixed source and two replayed solutions`, () => {
    const before = JSON.stringify(s);
    const tiles = s.cols.flat();
    assert.equal(s.cols.length, 6);
    assert.equal(new Set(tiles.map((t) => t.id)).size, tiles.length);
    assert.equal(tiles.length, { normal: 36, hard: 45, expert: 54 }[s.tier]);
    for (const ch of new Set(tiles.map((t) => t.ch)))
      assert.equal(tiles.filter((t) => t.ch === ch).length % 3, 0);
    const result = replayStack(s, proofs[s.id - 1]);
    assert(result);
    assert.equal(result.cols.flat().length, 0);
    assert.equal(result.tray.length, 0);
    const hint = searchStack(s.cols, [], 240000);
    assert.equal(hint.status, 'solved');
    assert.deepEqual(replayStack(s, hint.path), {
      cols: Array.from({ length: 6 }, () => []),
      tray: [],
    });
    assert.equal(JSON.stringify(s), before);
  });
test('30 distinct stages start at normal and have three selectable difficulties', () => {
  assert.equal(STACK_STAGES.length, 30);
  assert.equal(STACK_STAGES[0].tier, 'normal');
  assert.equal(new Set(STACK_STAGES.map((s) => JSON.stringify(s.cols))).size, 30);
  for (const tier of ['normal', 'hard', 'expert'])
    assert.equal(STACK_STAGES.filter((s) => s.tier === tier).length, 10);
});
test('third matching tile clears even when tray already has six tiles', () => {
  const cols = [[{ id: 9, ch: 'ㄱ' }]],
    tray = [
      { id: 1, ch: 'ㄱ' },
      { id: 2, ch: 'ㄱ' },
      { id: 3, ch: 'ㄴ' },
      { id: 4, ch: 'ㅅ' },
      { id: 5, ch: 'ㅁ' },
      { id: 6, ch: 'ㅇ' },
    ];
  const before = JSON.stringify({ cols, tray });
  const n = takeStack(cols, tray, 0);
  assert(n.match);
  assert.equal(n.tray.length, 4);
  assert.equal(JSON.stringify({ cols, tray }), before);
});
test('full tray blocks further picks; undo replay can recover a failed board', () => {
  const s = STACK_STAGES[0];
  let cols = s.cols,
    tray = [],
    moves = [];
  while (tray.length < 7 && cols.flat().length) {
    const options = cols.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
    const pick =
      options.find((i) => tray.filter((t) => t.ch === cols[i][0].ch).length < 2) ?? options[0];
    moves.push(pick);
    ({ cols, tray } = takeStack(cols, tray, pick));
  }
  assert.equal(tray.length, 7);
  assert.equal(takeStack(cols, tray, 0), null);
  const recovered = replayStack(s, moves.slice(0, -1));
  assert(recovered.tray.length < 7);
});
test('invalid columns, malformed history and moves after completion are rejected', () => {
  const s = STACK_STAGES[0];
  for (const col of [-1, 6, NaN, 1.5, '0', null]) assert.equal(takeStack(s.cols, [], col), null);
  assert.equal(replayStack(s, [999]), null);
  assert.equal(replayStack(s, [...proofs[0], 0]), null);
  assert.equal(searchStack(s.cols, [], 0).status, 'limit');
  assert.equal(searchStack([[], [], [], [], [], []], []).status, 'solved');
});
test('progress restore validates history, survives storage failure and preserves other games', () => {
  const m = new Map([
    ['jamopop-exit-v1', 'keep exit'],
    ['solo', 'keep word'],
  ]);
  const storage = { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) };
  const p = { stage: 1, moves: proofs[0].slice(0, 5), completed: [2] };
  assert(writeStack(storage, p));
  assert.deepEqual(readStack(storage), p);
  assert.equal(m.get('jamopop-exit-v1'), 'keep exit');
  assert.equal(m.get('solo'), 'keep word');
  storage.setItem(
    STACK_KEY,
    JSON.stringify({ version: 1, stage: 999, moves: [0], completed: [2, 2, -1, '3', 31] }),
  );
  assert.deepEqual(readStack(storage), { stage: 1, moves: [], completed: [2] });
  storage.setItem(STACK_KEY, 'broken');
  assert.deepEqual(readStack(storage), { stage: 1, moves: [], completed: [] });
  assert.equal(
    writeStack(
      {
        setItem() {
          throw Error('full');
        },
      },
      p,
    ),
    false,
  );
  assert.equal(
    readStack({
      getItem() {
        throw Error('disabled');
      },
    }).moves.length,
    0,
  );
});
