import type { Guess } from './game';
const DAY = 86400000;
const KST = 9 * 3600000;
export function dailyClock(now: number) {
  const index = Math.floor((now + KST) / DAY);
  return {
    day: new Date(index * DAY).toISOString().slice(0, 10),
    resetsAt: (index + 1) * DAY - KST,
  };
}
export type DailyView = {
  day: string;
  resetsAt: number;
  serverNow: number;
  signedIn: boolean;
  guesses: Guess[];
  status: 'playing' | 'won' | 'lost';
  answer?: string;
};
export function dailyShare(view: DailyView) {
  if (view.status === 'playing') return '';
  const icons = { green: '🟩', yellow: '🟨', gray: '⬜' };
  return `자음모음팝 · ${view.day}\n${view.status === 'won' ? view.guesses.length : 'X'}/5\n\n${view.guesses.map((g) => g.colors.map((c) => icons[c]).join('')).join('\n')}\n\nhttps://play.jamopop.workers.dev/daily`;
}
