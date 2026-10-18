import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXIT_STAGES } from '../lib/exit-stages.mjs';
import { shapes, movePiece, searchExit } from '../lib/kongal-exit.mjs';
import { replayExit, readExit, writeExit, EXIT_KEY } from '../lib/exit-progress.mjs';
const proofs = JSON.parse(readFileSync(new URL('./exit-proofs.json', import.meta.url)));
for (const stage of EXIT_STAGES)
  test(`exit ${stage.id}: in-bounds, unique cells and replayable solution`, () => {
    const before = JSON.stringify(stage);
    const cells = stage.pieces.flatMap((p) => shapes[p.ch].map(([x, y]) => [p.x + x, p.y + y]));
    assert(cells.every(([x, y]) => x >= 0 && y >= 0 && x < 6 && y < 6));
    assert.equal(new Set(cells.map((c) => c.join(','))).size, cells.length);
    assert.deepEqual(replayExit(stage, proofs[stage.id - 1]), []);
    const hint = searchExit(stage.pieces, 100000, 3);
    assert.equal(hint.status, 'solved');
    assert.deepEqual(replayExit(stage, hint.path), []);
    assert.equal(JSON.stringify(stage), before);
  });
test('30 distinct fixed maps start at normal and have three difficulties', () => {
  assert.equal(EXIT_STAGES.length, 30);
  assert.equal(EXIT_STAGES[0].tier, 'normal');
  assert.equal(new Set(EXIT_STAGES.map((s) => JSON.stringify(s.pieces))).size, 30);
  for (const tier of ['normal', 'hard', 'expert'])
    assert.equal(EXIT_STAGES.filter((s) => s.tier === tier).length, 10);
});
test('movement rejects invalid directions, teleporting, missing pieces and collisions', () => {
  const ps = EXIT_STAGES[0].pieces;
  for (const [dx, dy] of [
    [0, 0],
    [1, 1],
    [2, 0],
    [NaN, 0],
    ['1', 0],
  ])
    assert.equal(movePiece(ps, ps[0].id, dx, dy), null);
  assert.equal(movePiece(ps, 999, 1, 0), null);
  const pair = [
    { id: 1, ch: 'ㅡ', x: 0, y: 0, side: 'left', lane: 0 },
    { id: 2, ch: 'ㅡ', x: 2, y: 0, side: 'right', lane: 0 },
  ];
  assert.equal(movePiece(pair, 1, 1, 0), null);
  assert.equal(movePiece(pair, 1, 0, -1), null);
  assert.equal(movePiece(pair, 1, -1, 0).pieces.length, 1);
});
test('progress restores replayed moves; corrupt data and storage failures are safe', () => {
  const map = new Map([
    ['jamo-duo-v2', 'original'],
    ['solo', 'existing'],
  ]);
  const storage = { getItem: (key) => map.get(key), setItem: (key, value) => map.set(key, value) };
  const state = { stage: 1, moves: proofs[0].slice(0, 5), best: { 2: 40 } };
  assert(writeExit(storage, state));
  assert.deepEqual(readExit(storage), state);
  assert.equal(map.get('solo'), 'existing');
  assert.equal(map.get('jamo-duo-v2'), 'original');
  storage.setItem(
    EXIT_KEY,
    JSON.stringify({ version: 1, stage: 1, moves: [{ id: 999, dx: 1, dy: 0 }], best: { 2: -1 } }),
  );
  assert.deepEqual(readExit(storage), { stage: 1, moves: [], best: {} });
  storage.setItem(EXIT_KEY, 'broken');
  assert.equal(readExit(storage).stage, 1);
  assert.equal(
    writeExit(
      {
        setItem() {
          throw Error('full');
        },
      },
      state,
    ),
    false,
  );
  assert.equal(
    readExit({
      getItem() {
        throw Error('disabled');
      },
    }).moves.length,
    0,
  );
});
test('search limit is distinct from a deadlock', () => {
  assert.equal(searchExit(EXIT_STAGES[0].pieces, 0).status, 'limit');
});
