export const shapes = {
  ㄱ: [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
  ㄴ: [
    [0, 0],
    [0, 1],
    [1, 1],
  ],
  ㅁ: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  ㅡ: [
    [0, 0],
    [1, 0],
  ],
  ㅣ: [
    [0, 0],
    [0, 1],
  ],
  ㅏ: [
    [0, 0],
    [0, 1],
    [1, 1],
    [0, 2],
  ],
  ㅗ: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  ㅜ: [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
};
export function movePiece(pieces, id, dx, dy) {
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1)
    return null;
  const p = pieces.find((p) => p.id === id);
  if (!p) return null;
  const cells = shapes[p.ch],
    x = p.x + dx,
    y = p.y + dy;
  const next = cells.map(([a, b]) => [a + x, b + y]);
  const outside = next.some(([a, b]) => a < 0 || a >= 6 || b < 0 || b >= 6);
  if (outside) {
    const w = Math.max(...cells.map((c) => c[0])) + 1,
      h = Math.max(...cells.map((c) => c[1])) + 1;
    const exit =
      (p.side === 'left' && dx === -1 && p.x === 0 && p.y === p.lane) ||
      (p.side === 'right' && dx === 1 && p.x + w === 6 && p.y === p.lane) ||
      (p.side === 'top' && dy === -1 && p.y === 0 && p.x === p.lane) ||
      (p.side === 'bottom' && dy === 1 && p.y + h === 6 && p.x === p.lane);
    return exit ? { pieces: pieces.filter((q) => q.id !== id), escaped: p } : null;
  }
  const occupied = new Set(
    pieces
      .filter((q) => q.id !== id)
      .flatMap((q) => shapes[q.ch].map(([a, b]) => `${q.x + a},${q.y + b}`)),
  );
  if (next.some(([a, b]) => occupied.has(`${a},${b}`))) return null;
  return {
    pieces: pieces.map((q) => (q.id === id ? { ...q, x, y } : q)),
    escaped: null,
  };
}
export function searchExit(pieces, limit = 180000, weight = 2.5) {
  const heap = [],
    best = new Map();
  let visits = 0;
  const key = (ps) => ps.map((q) => `${q.id}:${q.x},${q.y}`).join(';');
  const h = (ps) =>
    ps.reduce((sum, p) => {
      const c = shapes[p.ch],
        w = Math.max(...c.map((a) => a[0])) + 1,
        hh = Math.max(...c.map((a) => a[1])) + 1;
      return (
        sum +
        (p.side === 'left'
          ? p.x + 1 + Math.abs(p.y - p.lane)
          : p.side === 'right'
            ? 7 - p.x - w + Math.abs(p.y - p.lane)
            : p.side === 'top'
              ? p.y + 1 + Math.abs(p.x - p.lane)
              : 7 - p.y - hh + Math.abs(p.x - p.lane))
      );
    }, 0);
  function push(n) {
    heap.push(n);
    let i = heap.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= n.f) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = n;
  }
  function pop() {
    const a = heap[0],
      z = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++;
        if (heap[c].f >= z.f) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = z;
    }
    return a;
  }
  const start = {
    pieces,
    g: 0,
    f: h(pieces) * weight,
    parent: null,
    step: null,
  };
  push(start);
  best.set(key(pieces), 0);
  while (heap.length && visits < limit) {
    const cur = pop();
    if (best.get(key(cur.pieces)) < cur.g) continue;
    visits++;
    if (!cur.pieces.length) {
      const path = [];
      let n = cur;
      while (n.step) {
        path.push(n.step);
        n = n.parent;
      }
      return { status: 'solved', path: path.reverse(), visits };
    }
    for (const p of cur.pieces)
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const n = movePiece(cur.pieces, p.id, dx, dy);
        if (!n) continue;
        const k = key(n.pieces),
          g = cur.g + 1;
        if ((best.get(k) ?? Infinity) <= g) continue;
        best.set(k, g);
        push({
          pieces: n.pieces,
          g,
          f: g + weight * h(n.pieces),
          parent: cur,
          step: { id: p.id, dx, dy },
        });
      }
  }
  return { status: heap.length ? 'limit' : 'blocked', path: null, visits };
}

export function solveExit(pieces, limit = 120000) {
  return searchExit(pieces, limit).path;
}
