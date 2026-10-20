export const CARE_ACTIONS = ['pet', 'snack', 'play', 'visit'] as const;
export const CARE_REWARDS = [
  { id: 'home-nap-rabbit', points: 12, name: '낮잠 친구 토콩' },
  { id: 'home-snack-cat', points: 36, name: '간식 대장 냥콩' },
  { id: 'home-star-bear', points: 72, name: '별꿈 친구 곰콩' },
] as const;
export function careDay(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}
export function careProgress(points: number, done: string[] = []) {
  return {
    points,
    done,
    rewards: CARE_REWARDS.map((r) => ({ ...r, unlocked: points >= r.points })),
    next: CARE_REWARDS.find((r) => points < r.points) || null,
  };
}
// Fixed floor coordinates: paths remain in the aisle below furniture footprints.
export function residentTarget(random: number) {
  return 20 + Math.max(0, Math.min(1, random)) * 60;
}

// Progress through the current gift interval; earned gifts never reset the total.
export function bondProgress(points: number) {
  const next = CARE_REWARDS.find((reward) => points < reward.points) || null;
  const previous =
    [...CARE_REWARDS].reverse().find((reward) => points >= reward.points)?.points || 0;
  return {
    next,
    remaining: next ? next.points - points : 0,
    percent: next
      ? Math.max(0, Math.min(100, ((points - previous) / (next.points - previous)) * 100))
      : 100,
  };
}
