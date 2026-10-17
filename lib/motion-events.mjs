// Server-confirmed transitions only: never celebrate restored history.
export function motionEvents(previous, next) {
  if (!previous || previous.room.id !== next.room.id || previous.round.id !== next.round.id)
    return [];
  const events = [];
  if (
    previous.play.status !== 'won' &&
    next.play.status === 'won' &&
    next.play.guesses.length > previous.play.guesses.length
  )
    events.push({
      id: 'win:' + next.round.id,
      kind: 'win',
      actorId: next.me.id,
      targetId: next.me.id,
      row: next.play.guesses.length - 1,
      width: next.round.width,
    });
  const seen = new Set((previous.party?.events || []).map((e) => e.id));
  for (const e of [...(next.party?.events || [])].reverse()) {
    if (seen.has(e.id) || next.serverNow - e.createdAt > 8000 || e.createdAt > next.serverNow)
      continue;
    if (!e.actorId || !e.targetId) continue;
    const kind = e.effect.includes('준비')
      ? e.effect.includes('반사')
        ? 'reflect-ready'
        : 'shield'
      : e.effect.includes('반사')
        ? 'reflect'
        : e.effect.includes('차단')
          ? 'blocked'
          : e.effect.includes('+15')
            ? 'boost'
            : 'attack';
    events.push({ ...e, kind, negated: e.effect.includes('차단') || e.effect.includes('보호 중') });
  }
  return events.slice(-4);
}
export function flightPoint(a, b, t, arc = 80) {
  const p = Math.max(0, Math.min(1, t));
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p - Math.sin(Math.PI * p) * arc };
}
