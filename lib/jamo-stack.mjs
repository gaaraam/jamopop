export function takeStack(cols, tray, col) {
  if (
    !Number.isInteger(col) ||
    col < 0 ||
    col >= cols.length ||
    !cols[col]?.length ||
    tray.length >= 7
  )
    return null;
  const next = cols.map((c) => c.slice()),
    tile = next[col].shift();
  let t = [...tray, tile];
  let match = t.filter((x) => x.ch === tile.ch).length === 3;
  if (match) t = t.filter((x) => x.ch !== tile.ch);
  return { cols: next, tray: t, match, tile };
}
export function searchStack(cols, tray, limit = 140000) {
  let visits = 0,
    limited = false;
  const seen = new Set();
  function dfs(cs, t, path) {
    if (visits >= limit) {
      limited = true;
      return null;
    }
    visits++;
    if (cs.every((c) => !c.length)) return t.length === 0 ? path : null;
    if (t.length >= 7) return null;
    const key =
      cs.map((c) => c.length).join(',') +
      '|' +
      t
        .map((x) => x.ch)
        .sort()
        .join('');
    if (seen.has(key)) return null;
    seen.add(key);
    const order = cs
      .map((c, i) => i)
      .filter((i) => cs[i].length)
      .sort(
        (a, b) =>
          t.filter((x) => x.ch === cs[b][0].ch).length -
          t.filter((x) => x.ch === cs[a][0].ch).length,
      );
    for (const i of order) {
      if (limited) return null;
      const n = takeStack(cs, t, i);
      const out = dfs(n.cols, n.tray, [...path, i]);
      if (out) return out;
    }
    return null;
  }
  const path = dfs(cols, tray, []);
  return {
    path,
    status: path ? 'solved' : limited ? 'limit' : 'blocked',
    visits,
  };
}
export function solveStack(cols, tray, limit = 140000) {
  return searchStack(cols, tray, limit).path;
}
