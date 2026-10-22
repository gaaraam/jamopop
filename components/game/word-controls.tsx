'use client';
import '@/app/word-feel.css';
import { judgmentTiming } from '@/lib/word-feedback.mjs';
import { Delete } from 'lucide-react';
import { KEYS, type Guess, type Color } from '@/lib/game';
import { JudgmentMark, judgmentLabel } from './judgment-mark';
export function WordBoard({
  roundId,
  width,
  guesses,
  letters,
  isFinished = false,
  locked = false,
  composing = false,
  shake = 0,
  pending: isPending = false,
  reveal = null,
  won = false,
}: {
  roundId: string;
  width: number;
  guesses: Guess[];
  letters: string[];
  isFinished?: boolean;
  locked?: boolean;
  composing?: boolean;
  shake?: number;
  pending?: boolean;
  reveal?: { roundId: string; row: number } | null;
  won?: boolean;
}) {
  const timing = judgmentTiming(width);
  return (
    <div
      className="main-board word-feel"
      data-ready={(!isFinished && !locked && !isPending && letters.length === width) || undefined}
      data-outcome={isFinished ? (won ? 'won' : 'finished') : undefined}
      style={
        {
          gridTemplateColumns: `repeat(${width},minmax(0,1fr))`,
          '--board-columns': width,
          '--judgment-end': `${timing.end}ms`,
        } as React.CSSProperties
      }
      aria-label="단어 게임판"
      aria-busy={isPending}
    >
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: width }, (_, c) => {
          const g = guesses[r],
            active = r === guesses.length && !isFinished && !locked,
            pending = !g && isPending && r === guesses.length;
          return (
            <div
              key={`${roundId}-${r}-${c}-${g ? 'done' : active && !composing ? letters[c] || 'empty' : 'empty'}`}
              data-cursor={
                (active && c === Math.min(letters.length, width - 1) && !isPending) || undefined
              }
              data-submitting={pending || undefined}
              data-fx-row={r}
              data-letter={g?.letters[c] || ''}
              style={
                {
                  '--reveal-delay': `${c * timing.stagger}ms`,
                  '--win-delay': `${timing.end + c * 45}ms`,
                } as React.CSSProperties
              }
              className={`tile ${g ? g.colors[c] + (reveal?.roundId === roundId && reveal.row === r ? ' revealed' + (won && r === guesses.length - 1 ? ' victory-tile' : '') : '') : active && letters[c] ? `filled ${composing ? '' : 'input-pop'}` : ''} ${active ? 'active-row' + (shake ? (shake % 2 ? ' shake-a' : ' shake-b') : '') : ''} ${pending ? 'submission-pending' : ''}`}
              aria-label={`${r + 1}번째 시도 ${c + 1}칸 ${g?.letters[c] || (active && letters[c]) || '빈칸'} ${g ? judgmentLabel[g.colors[c]] : ''}`}
            >
              <span className="tile-glyph">{g?.letters[c] || (active ? letters[c] : '')}</span>
              <JudgmentMark color={g?.colors[c]} />
            </div>
          );
        }),
      )}
    </div>
  );
}
export function WordKeyboard({
  keyboardColors,
  pressed = '',
  disabled = false,
  onKey,
}: {
  keyboardColors: Record<string, Color>;
  pressed?: string;
  disabled?: boolean;
  onKey: (key: string) => void;
}) {
  return (
    <div
      className="keyboard"
      aria-label="한글 자판"
      onClick={(event) => {
        // Mouse activation may resume typing; keyboard activation must keep button focus.
        if (event.detail > 0 && matchMedia('(pointer:fine)').matches) {
          event.currentTarget
            .closest('.game-panel')
            ?.querySelector<HTMLInputElement>('.game-input-control input')
            ?.focus({ preventScroll: true });
        }
      }}
    >
      {KEYS.map((row, i) => (
        <div className="key-row" key={row}>
          {[...row].map((c) => (
            <button
              type="button"
              className={`key ${keyboardColors[c] || ''} ${pressed === c ? 'key-pressed' : ''}`}
              key={c}
              aria-label={keyboardColors[c] ? `${c} · ${judgmentLabel[keyboardColors[c]]}` : c}
              disabled={disabled}
              onClick={() => onKey(c)}
            >
              {c}
              <JudgmentMark color={keyboardColors[c]} />
            </button>
          ))}
          {i === 0 && (
            <button
              type="button"
              className={`key backspace ${pressed === 'Backspace' ? 'key-pressed' : ''}`}
              aria-label="한 칸 지우기"
              disabled={disabled}
              onClick={() => onKey('Backspace')}
            >
              <Delete size={20} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
