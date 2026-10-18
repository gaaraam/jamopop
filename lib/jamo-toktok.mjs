export function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const adj = (i) =>
  [i % 5 > 0 ? i - 1 : -1, i % 5 < 4 ? i + 1 : -1, i >= 5 ? i - 5 : -1, i < 20 ? i + 5 : -1].filter(
    (x) => x >= 0,
  );
export function cluster(board, index, equal = (a, b) => a?.ch === b?.ch) {
  if (!board[index]) return [];
  let seen = new Set([index]),
    q = [index];
  for (let j = 0; j < q.length; j++)
    for (const i of adj(q[j]))
      if (!seen.has(i) && board[i] && equal(board[index], board[i])) {
        seen.add(i);
        q.push(i);
      }
  return q;
}
export const GLYPHS = ['ㄱ', 'ㅏ', 'ㄴ', 'ㅗ', 'ㅣ', 'ㄲ', 'ㅘ', 'ㅐ'];
export const PARTS = { 5: [0], 6: [3, 1], 7: [1, 4] };
export function startToktok(seed = 1) {
  const r = rng(seed),
    board = Array.from({ length: 25 }, () => ({ ch: Math.floor(r() * 5) }));
  // A visible composition chain: ㅘ -> ㅏ -> ㅐ -> ㅣ. ㄲ catches ㄱ.
  board[12] = { ch: 6 };
  board[2] = { ch: 7 };
  board[4] = { ch: 5 };
  board[0] = { ch: 1 };
  board[1] = { ch: 1 };
  return { board, seed: seed + 300, score: 0, turn: 0 };
}
export function tapToktok(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= 25 || finishedToktok(state)) return null;
  const tile = state.board[index];
  if (!tile) return null;
  const group = cluster(state.board, index);
  if (group.length < 2 && !PARTS[tile.ch]) return null;
  let earned = null;
  if (!PARTS[tile.ch] && group.length >= 4) {
    if (tile.ch === 0) earned = 5;
    else if (tile.ch === 1 && state.board.some((t) => t.ch === 3)) earned = 6;
    else if (tile.ch === 4 && state.board.some((t) => t.ch === 1)) earned = 7;
  }
  const affected = new Set(PARTS[tile.ch] ? [index] : group),
    queue = [...affected],
    waves = [];
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k],
      t = state.board[i];
    if (!PARTS[t.ch]) continue;
    const parts = PARTS[t.ch],
      targets = [];
    state.board.forEach((other, j) => {
      if (parts.includes(other.ch) || PARTS[other.ch]?.some((p) => parts.includes(p))) {
        if (!affected.has(j)) {
          affected.add(j);
          queue.push(j);
          targets.push(j);
        }
      }
    });
    waves.push({
      index: i,
      glyph: GLYPHS[t.ch],
      parts: parts.map((p) => GLYPHS[p]),
      cells: targets,
    });
  }
  // Synthesis consumes one visible ingredient when a compound vowel is made.
  if (earned === 6 || earned === 7) {
    const ingredient = earned === 6 ? 3 : 1;
    const j = state.board.findIndex((t, i) => !affected.has(i) && t.ch === ingredient);
    if (j >= 0) affected.add(j);
    else earned = null;
  }
  const board = structuredClone(state.board);
  for (const i of affected) board[i] = null;
  if (earned !== null) board[index] = { ch: earned };
  const r = rng(state.seed);
  for (let x = 0; x < 5; x++) {
    const col = Array.from({ length: 5 }, (_, y) => board[y * 5 + x]).filter(Boolean);
    while (col.length < 5) col.unshift({ ch: Math.floor(r() * 5) });
    for (let y = 0; y < 5; y++) board[y * 5 + x] = col[y];
  }
  if (!hasToktokMove(board)) {
    const candidates = board
      .map((t, i) => (i > 1 && t.ch === board[0].ch ? i : -1))
      .filter((i) => i >= 0);
    if (candidates.length) {
      const j = candidates[Math.floor(r() * candidates.length)];
      [board[1], board[j]] = [board[j], board[1]];
    }
  }
  const points = affected.size ** 2 * 20 + waves.length * 500;
  return {
    ...state,
    board,
    seed: state.seed + 3571,
    turn: state.turn + 1,
    score: state.score + points,
    points,
    cells: [...affected],
    waves,
    triggered: waves.length,
    earned,
  };
}
export const hasToktokMove = (board) =>
  board.some((t, i) => PARTS[t.ch] || cluster(board, i).length >= 2);

export const TOKTOK_TARGET = 18000;
export const TOKTOK_TURNS = 18;
export function finishedToktok(state) {
  return state.turn >= TOKTOK_TURNS || state.score >= TOKTOK_TARGET;
}
export function hintToktok(state) {
  let best = null;
  for (let i = 0; i < 25; i++) {
    const next = tapToktok(state, i);
    if (next && (!best || next.points > best.points)) best = { index: i, points: next.points };
  }
  return best;
}
