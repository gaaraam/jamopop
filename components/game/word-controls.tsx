'use client';
import { Delete } from 'lucide-react';
import { KEYS, type Guess, type Color } from '@/lib/game';
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
  return (
    <div
      className={`main-board ${shake ? (shake % 2 ? 'shake-a' : 'shake-b') : ''}`}
      style={
        {
          gridTemplateColumns: `repeat(${width},minmax(0,1fr))`,
          '--board-columns': width,
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
              data-submitting={pending || undefined}
              data-fx-row={r}
              data-letter={g?.letters[c] || ''}
              style={
                {
                  '--reveal-delay': `${c * 45}ms`,
                  '--win-delay': `${width * 45 + 270 + c * 45}ms`,
                } as React.CSSProperties
              }
              className={`tile ${g ? g.colors[c] + (reveal?.roundId === roundId && reveal.row === r ? ' revealed' + (won && r === guesses.length - 1 ? ' victory-tile' : '') : '') : active && letters[c] ? `filled ${composing ? '' : 'input-pop'}` : ''} ${active ? 'active-row' : ''} ${pending ? 'submission-pending' : ''}`}
              aria-label={`${r + 1}번째 시도 ${c + 1}칸 ${g?.letters[c] || (active && letters[c]) || '빈칸'} ${g ? { green: '정확', yellow: '다른 위치', gray: '미포함' }[g.colors[c]] : ''}`}
            >
              {g?.letters[c] || (active ? letters[c] : '')}
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
    <div className="keyboard" aria-label="한글 자판">
      {KEYS.map((row, i) => (
        <div className="key-row" key={row}>
          {[...row].map((c) => (
            <button
              type="button"
              className={`key ${keyboardColors[c] || ''} ${pressed === c ? 'key-pressed' : ''}`}
              key={c}
              disabled={disabled}
              onClick={() => onKey(c)}
            >
              {c}
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
