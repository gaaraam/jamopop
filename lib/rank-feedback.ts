type RankSnapshot = { roundId: string; rank?: number };
export function shouldCelebrateRank(previous: RankSnapshot, next: RankSnapshot) {
  return (
    previous.roundId === next.roundId &&
    next.rank !== undefined &&
    next.rank >= 1 &&
    next.rank <= 3 &&
    (previous.rank === undefined || next.rank < previous.rank)
  );
}

export function shouldCelebrateWin(
  previous: { roundId: string; won: boolean },
  next: { roundId: string; won: boolean },
) {
  return previous.roundId === next.roundId && !previous.won && next.won;
}
