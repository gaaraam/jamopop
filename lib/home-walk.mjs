// Scene coordinates never depend on viewport pixels. Rugs are walkable.
export const STEP = 2;
export function blocked(point, furniture = []) {
  return (
    point.x < 8 ||
    point.x > 92 ||
    point.y < 36 ||
    point.y > 92 ||
    furniture.some(
      (f) =>
        f.id !== 'home-rug' &&
        Math.abs(point.x - f.x) < (f.collisionWidth ?? (f.id === 'home-sofa' ? 11 : 6)) &&
        point.y > f.y - (f.collisionDepth ?? 5) &&
        point.y < f.y + 3,
    )
  );
}
const key = (p) => `${p.x},${p.y}`;
export function walkPath(start, goal, furniture = []) {
  const cells = [];
  for (let y = 36; y <= 92; y += STEP)
    for (let x = 8; x <= 92; x += STEP) if (!blocked({ x, y }, furniture)) cells.push({ x, y });
  if (!cells.length) return [];
  const distance = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const origin = cells.reduce((a, b) => (distance(a, start) <= distance(b, start) ? a : b));
  const queue = [origin],
    seen = new Map([[key(origin), null]]);
  let nearest = origin;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (distance(p, goal) < distance(nearest, goal)) nearest = p;
    for (const [dx, dy] of [
      [STEP, 0],
      [-STEP, 0],
      [0, STEP],
      [0, -STEP],
    ]) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (!seen.has(key(n)) && !blocked(n, furniture)) {
        seen.set(key(n), p);
        queue.push(n);
      }
    }
  }
  const path = [];
  for (let p = nearest; p; p = seen.get(key(p))) path.unshift(p);
  return path;
}

// Swept movement prevents tunnelling through furniture after a delayed frame.
export function moveOnFloor(start, dx, dy, furniture = []) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.5));
  let p = { ...start };
  for (let i = 0; i < steps; i++) {
    const x = { x: p.x + dx / steps, y: p.y };
    if (!blocked(x, furniture)) p = x;
    const y = { x: p.x, y: p.y + dy / steps };
    if (!blocked(y, furniture)) p = y;
  }
  return p;
}
