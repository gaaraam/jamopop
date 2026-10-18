import { STACK_STAGES } from './stack-stages.mjs';
import { takeStack } from './jamo-stack.mjs';
export const STACK_KEY = 'jamopop-stack-v1';
export function replayStack(stage, moves) {
  if (!stage || !Array.isArray(moves) || moves.length > stage.cols.flat().length) return null;
  let state = { cols: structuredClone(stage.cols), tray: [] };
  for (const col of moves) {
    const next = takeStack(state.cols, state.tray, col);
    if (!next) return null;
    state = { cols: next.cols, tray: next.tray };
  }
  return state;
}
export function readStack(storage) {
  const empty = { stage: 1, moves: [], completed: [] };
  try {
    const raw = JSON.parse(storage.getItem(STACK_KEY) || 'null');
    if (!raw || raw.version !== 1) return empty;
    const stage = STACK_STAGES.find((s) => s.id === raw.stage);
    const completed = Array.isArray(raw.completed)
      ? [...new Set(raw.completed.filter((id) => STACK_STAGES.some((s) => s.id === id)))]
      : [];
    return {
      stage: stage?.id || 1,
      moves: replayStack(stage, raw.moves) ? raw.moves : [],
      completed,
    };
  } catch {
    return empty;
  }
}
export function writeStack(storage, state) {
  try {
    storage.setItem(STACK_KEY, JSON.stringify({ version: 1, ...state }));
    return true;
  } catch {
    return false;
  }
}
