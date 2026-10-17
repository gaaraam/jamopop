const commands = new Set(['help', 'room', 'rank', 'next', 'practice', 'daily', 'view', 'clear']);
export function parseTerminalCommand(
  value: string,
): { kind: 'guess'; word: string } | { kind: 'command'; name: string } {
  const text = value.trim();
  if (!text.startsWith('/')) return { kind: 'guess', word: text };
  const name = text.slice(1).toLowerCase();
  return { kind: 'command', name: commands.has(name) ? name : 'unknown' };
}

import type { GameState } from './game';
export type ConsoleSnapshot = {
  roundId: string;
  ownCount: number;
  ownStatus: string;
  peers: Record<string, { attempts: number; status: string }>;
};
export function consoleUpdate(data: GameState, previous: ConsoleSnapshot | null) {
  const fresh = previous?.roundId !== data.round.id;
  const lines: string[] = [];
  const stamp = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(data.serverNow);
  const glyph = { green: '■', yellow: '▨', gray: '·' };
  if (fresh)
    lines.push(
      `-- ${data.room.name} / ${data.round.mode === 'practice' ? 'practice' : `round ${data.room.roundNo}`} / ${data.round.width} slots --`,
    );
  for (let i = fresh ? 0 : previous!.ownCount; i < data.play.guesses.length; i++) {
    const g = data.play.guesses[i];
    if (fresh) lines.push(`${data.me.name}@bubblecon:~/wordle $ ${g.letters.join('')}`);
    lines.push(
      `  ${g.letters.join(' ')}\n  ${g.colors.map((c) => glyph[c]).join(' ')}  [${i + 1}/5]`,
    );
  }
  if (
    (fresh || previous?.ownStatus !== data.play.status) &&
    ['won', 'lost'].includes(data.play.status)
  )
    lines.push(
      `${data.play.status === 'won' ? 'solved' : data.play.forfeited ? 'forfeited' : 'finished'}: ${data.play.answer ?? ''} [${data.play.guesses.length}/5]`,
    );
  const peers: ConsoleSnapshot['peers'] = {};
  for (const p of data.players) {
    peers[p.id] = { attempts: p.attempts, status: p.status };
    if (p.id === data.me.id) continue;
    const old = fresh ? undefined : previous?.peers[p.id];
    if (!old || p.attempts !== old.attempts || p.status !== old.status) {
      const marks =
        p.colors
          .at(-1)
          ?.map((c) => glyph[c])
          .join(' ') || '';
      const state =
        p.status === 'won'
          ? 'solved'
          : p.status === 'lost'
            ? p.forfeited
              ? 'forfeited'
              : 'finished'
            : p.attempts
              ? 'submitted'
              : 'waiting';
      lines.push(`[${stamp}] ${p.name}: ${marks}  ${state} [${p.attempts}/5]`);
    }
  }
  return {
    lines,
    snapshot: {
      roundId: data.round.id,
      ownCount: data.play.guesses.length,
      ownStatus: data.play.status,
      peers,
    },
  };
}
