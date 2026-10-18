import { EXIT_STAGES } from './exit-stages.mjs';
import { movePiece } from './kongal-exit.mjs';
export const EXIT_KEY = 'jamopop-exit-v1';

export function replayExit(stage, moves) {
  if (!stage || !Array.isArray(moves) || moves.length > 5000) return null;
  let pieces = structuredClone(stage.pieces);
  for (const step of moves) {
    if (!step || !Number.isInteger(step.id)) return null;
    const next = movePiece(pieces, step.id, step.dx, step.dy);
    if (!next) return null;
    pieces = next.pieces;
  }
  return pieces;
}
export function readExit(storage) {
  const empty = { stage: 1, moves: [], best: {} };
  try {
    const raw = JSON.parse(storage.getItem(EXIT_KEY) || 'null');
    if (!raw || raw.version !== 1) return empty;
    const stage = EXIT_STAGES.find((s) => s.id === raw.stage);
    const valid = replayExit(stage, raw.moves);
    const best = {};
    for (const [id, count] of Object.entries(raw.best || {})) {
      if (
        EXIT_STAGES.some((s) => String(s.id) === id) &&
        Number.isInteger(count) &&
        count > 0 &&
        count <= 5000
      )
        best[id] = count;
    }
    return { stage: stage?.id || 1, moves: valid ? raw.moves : [], best };
  } catch {
    return empty;
  }
}
export function writeExit(storage, state) {
  try {
    storage.setItem(EXIT_KEY, JSON.stringify({ version: 1, ...state }));
    return true;
  } catch {
    return false;
  }
}
