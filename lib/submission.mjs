import { rankPlayers } from './game.ts';
// Merge only a server-confirmed write into the same member and round.
// Other participants/rankings remain authoritative from the regular room sync.
export function mergeSubmission(current, ack) {
  if (
    !current ||
    !ack.submitted ||
    current.room.id !== ack.roomId ||
    current.round.id !== ack.roundId ||
    current.me.id !== ack.memberId
  )
    return null;
  if (current.play.guesses.length > ack.play.guesses.length) return null;
  if (current.play.status !== 'playing' && ack.play.status === 'playing') return null;
  const players = rankPlayers(
    current.players.map((p) =>
      p.id === ack.memberId
        ? {
            ...p,
            colors: ack.play.guesses.map((g) => g.colors),
            attempts: ack.play.guesses.length,
            status: ack.play.status,
            finishedAt: ack.finishedAt,
          }
        : p,
    ),
    current.round.mode,
  );
  const activeCount = players.filter((p) => p.status === 'playing').length;
  return {
    ...current,
    serverNow: ack.serverNow,
    play: ack.play,
    players,
    room: {
      ...current.room,
      activeCount,
      canReset:
        current.round.mode === 'daily' &&
        (current.room.isHost || current.room.isAdmin) &&
        activeCount === 0,
    },
  };
}
