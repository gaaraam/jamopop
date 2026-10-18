import { startToktok, tapToktok, TOKTOK_TURNS, targetToktok } from './jamo-toktok.mjs';
export const TOKTOK_KEY = 'jamopop-toktok-v2';
export const TOKTOK_LEGACY_KEY = 'jamopop-toktok-v1';
export function replayToktok(seed, moves, options = {}) {
  if (
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 0xffffffff ||
    !Array.isArray(moves) ||
    moves.length > TOKTOK_TURNS
  )
    return null;
  if (options.rules !== undefined && options.rules !== 1 && options.rules !== 2) return null;
  if (
    options.round !== undefined &&
    (!Number.isInteger(options.round) || options.round < 1 || options.round > 999)
  )
    return null;
  let state = startToktok(seed, options);
  for (const index of moves) {
    const next = tapToktok(state, index);
    if (!next) return null;
    state = next;
  }
  return state;
}
export function freshToktok(seed) {
  return { seed, moves: [], best: 0, rules: 2, round: 1, bestRound: 1 };
}
export function readToktok(storage, fallbackSeed) {
  const empty = freshToktok(fallbackSeed);
  try {
    const modern = storage.getItem(TOKTOK_KEY);
    const raw = JSON.parse(modern ?? storage.getItem(TOKTOK_LEGACY_KEY) ?? 'null');
    if (raw?.version !== 1 && raw?.version !== 2) return empty;
    const options =
      raw.version === 1 ? { rules: 1, round: 1 } : { rules: raw.rules, round: raw.round };
    const valid =
      raw.version === 2 && ((raw.rules !== 1 && raw.rules !== 2) || !Number.isInteger(raw.round))
        ? null
        : replayToktok(raw.seed, raw.moves, options);
    const best =
      Number.isSafeInteger(raw.best) && raw.best >= 0 && raw.best <= 1000000 ? raw.best : 0;
    if (!valid) return { ...empty, best };
    return {
      seed: raw.seed,
      moves: raw.moves,
      best: Math.max(best, valid.score),
      ...options,
      bestRound: Math.max(
        options.round || 1,
        Number.isInteger(raw.bestRound) && raw.bestRound >= 1 && raw.bestRound <= 999
          ? raw.bestRound
          : 1,
      ),
    };
  } catch {
    return empty;
  }
}
export function writeToktok(storage, progress) {
  const options = { rules: progress.rules ?? 1, round: progress.round ?? 1 };
  if (!replayToktok(progress.seed, progress.moves, options)) return false;
  try {
    storage.setItem(TOKTOK_KEY, JSON.stringify({ ...progress, ...options, version: 2 }));
    return true;
  } catch {
    return false;
  }
}
export function nextToktokRound(progress, seed, advance = false) {
  const before = replayToktok(progress.seed, progress.moves, progress);
  const canAdvance =
    progress.rules === 2 && advance && before && before.score >= targetToktok(before);
  const round = progress.rules === 2 ? Math.min(999, progress.round + Number(!!canAdvance)) : 1;
  return {
    seed,
    moves: [],
    best: progress.best,
    rules: 2,
    round,
    bestRound: Math.max(progress.bestRound || 1, round),
  };
}
