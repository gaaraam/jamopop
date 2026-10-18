'use client';
import { useRef, type CSSProperties } from 'react';
import { GLYPHS, PARTS } from '@/lib/jamo-toktok.mjs';
export type ToktokTile = { ch: number };
export type ToktokEffect = {
  id: number;
  cells: number[];
  label: string;
  points: number;
  index: number;
  chain: number;
  glyph: string;
};
export function ToktokBoard({
  board,
  onPick,
  disabled = false,
  highlight = null,
  effect = null,
  preview = false,
  popping = false,
}: {
  board: ToktokTile[];
  onPick?: (index: number) => void;
  disabled?: boolean;
  highlight?: number | null;
  effect?: ToktokEffect | null;
  preview?: boolean;
  popping?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="toktok-board-wrap">
      <div
        className="toktok-board"
        role={preview ? undefined : 'group'}
        aria-label={preview ? undefined : '자모 톡톡 게임판'}
      >
        {board.map((tile, i) => {
          const parts = PARTS[tile.ch as keyof typeof PARTS] as number[] | undefined;
          const cls = `toktok-tile tt-c${tile.ch} ${parts ? 'compound' : ''} ${popping && effect?.cells.includes(i) ? 'popping' : ''} ${highlight === i ? 'hint' : ''}`;
          const contents = (
            <>
              <b>{GLYPHS[tile.ch]}</b>
              {parts && <small aria-hidden="true">{parts.map((p) => GLYPHS[p]).join(' + ')}</small>}
            </>
          );
          return preview ? (
            <span key={i} className={cls}>
              {contents}
            </span>
          ) : (
            <button
              key={i}
              type="button"
              ref={(el) => {
                buttons.current[i] = el;
              }}
              className={cls}
              aria-disabled={disabled}
              aria-label={`${Math.floor(i / 5) + 1}행 ${(i % 5) + 1}열 ${GLYPHS[tile.ch]}${parts ? `, ${parts.map((p) => GLYPHS[p]).join('와 ')} 연결` : ''}`}
              onClick={() => {
                if (!disabled) onPick?.(i);
              }}
              onKeyDown={(e) => {
                const step = (
                  { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 } as Record<
                    string,
                    number
                  >
                )[e.key];
                if (!step || e.nativeEvent.isComposing || e.ctrlKey || e.metaKey || e.altKey)
                  return;
                e.preventDefault();
                const next = i + step;
                if (
                  next >= 0 &&
                  next < 25 &&
                  (Math.abs(step) === 5 || Math.floor(next / 5) === Math.floor(i / 5))
                )
                  buttons.current[next]?.focus();
              }}
            >
              {contents}
            </button>
          );
        })}
      </div>
      {effect && (
        <div key={effect.id} className="toktok-fx" aria-hidden="true">
          {Array.from({ length: Math.min(72, 24 + effect.chain * 16) }, (_, i) => {
            const angle = i * 2.399963;
            return (
              <i
                key={i}
                style={
                  {
                    '--x': `${((effect.index % 5) + 0.5) * 20}%`,
                    '--y': `${(Math.floor(effect.index / 5) + 0.5) * 20}%`,
                    '--dx': `${Math.cos(angle) * (40 + i * 2.1)}px`,
                    '--dy': `${Math.sin(angle) * (35 + i * 1.9) - 35}px`,
                    '--r': `${i * 31}deg`,
                    '--delay': `${(i % 5) * 14}ms`,
                    '--p': ['#eacb64', '#aa9acc', '#8dbfa7', '#90bed9'][i % 4],
                  } as CSSProperties
                }
              >
                {i % 5 === 0 ? effect.glyph : ''}
              </i>
            );
          })}
          <div className="toktok-burst">
            <strong>{effect.label}</strong>
            <span>+{effect.points.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
