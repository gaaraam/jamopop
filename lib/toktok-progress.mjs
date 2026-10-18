import { startToktok, tapToktok, TOKTOK_TURNS } from './jamo-toktok.mjs';
export const TOKTOK_KEY = 'jamopop-toktok-v1';
export function replayToktok(seed, moves) {
  if (
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 0xffffffff ||
    !Array.isArray(moves) ||
    moves.length > TOKTOK_TURNS
  )
    return null;
  let state = startToktok(seed);
  for (const index of moves) {
    const next = tapToktok(state, index);
    if (!next) return null;
    state = next;
  }
  return state;
}
export function freshToktok(seed) {
  return { seed, moves: [], best: 0 };
}
export function readToktok(storage, fallbackSeed) {
  const empty = freshToktok(fallbackSeed);
  try {
    const raw = JSON.parse(storage.getItem(TOKTOK_KEY) || 'null');
    if (raw?.version !== 1) return empty;
    const valid = replayToktok(raw.seed, raw.moves);
    const best =
      Number.isSafeInteger(raw.best) && raw.best >= 0 && raw.best <= 1000000 ? raw.best : 0;
    if (!valid) return { ...empty, best };
    return { seed: raw.seed, moves: raw.moves, best: Math.max(best, valid.score) };
  } catch {
    return empty;
  }
}
export function writeToktok(storage, progress) {
  if (!replayToktok(progress.seed, progress.moves)) return false;
  try {
    storage.setItem(TOKTOK_KEY, JSON.stringify({ ...progress, version: 1 }));
    return true;
  } catch {
    return false;
  }
}
