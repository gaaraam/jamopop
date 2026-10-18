'use client';
import { shapes } from '@/lib/kongal-exit.mjs';
export type ExitPiece = {
  id: number;
  ch: string;
  x: number;
  y: number;
  side: string;
  lane: number;
};
export const EXIT_COLORS = [
  '#edb950',
  '#7bc5b3',
  '#9b9bd9',
  '#e8a599',
  '#8ebce0',
  '#b4ca7a',
  '#ce9bc7',
  '#e1bd94',
];
export function ExitBoard({
  pieces,
  initial,
  selected,
  onSelect,
  onDrag,
}: {
  pieces: ExitPiece[];
  initial: ExitPiece[];
  selected?: number | null;
  onSelect?: (id: number) => void;
  onDrag?: (id: number, dx: number, dy: number) => void;
}) {
  return (
    <div
      className="exit-board"
      role={onSelect ? 'group' : undefined}
      aria-label={onSelect ? '탈출 보드' : undefined}
    >
      {Array.from({ length: 36 }, (_, i) => (
        <span
          className="exit-grid-cell"
          key={i}
          style={{ left: `${((i % 6) * 100) / 6}%`, top: `${(Math.floor(i / 6) * 100) / 6}%` }}
        />
      ))}
      {initial
        .filter((p) => pieces.some((q) => q.id === p.id))
        .map((p) => {
          const cells = shapes[p.ch as keyof typeof shapes];
          const vertical = p.side === 'left' || p.side === 'right';
          const size = Math.max(...cells.map((c) => c[vertical ? 1 : 0])) + 1;
          const style: React.CSSProperties = {
            background: EXIT_COLORS[p.id % 8],
            ...(vertical
              ? {
                  top: `${(p.lane * 100) / 6}%`,
                  height: `${(size * 100) / 6}%`,
                  [p.side]: '-9px',
                  width: 6,
                }
              : {
                  left: `${(p.lane * 100) / 6}%`,
                  width: `${(size * 100) / 6}%`,
                  [p.side]: '-9px',
                  height: 6,
                }),
          };
          return (
            <span className="exit-gate" style={style} key={p.id}>
              <span>{p.ch}</span>
            </span>
          );
        })}
      {pieces.map((p) => {
        const cells = shapes[p.ch as keyof typeof shapes];
        const width = Math.max(...cells.map((c) => c[0])) + 1,
          height = Math.max(...cells.map((c) => c[1])) + 1;
        return (
          <div
            key={p.id}
            className="exit-piece"
            style={{
              left: `${(p.x * 100) / 6}%`,
              top: `${(p.y * 100) / 6}%`,
              width: `${(width * 100) / 6}%`,
              height: `${(height * 100) / 6}%`,
              pointerEvents: 'none',
            }}
          >
            {cells.map(([x, y], i) => (
              <button
                type="button"
                key={i}
                disabled={!onSelect}
                tabIndex={i === 0 && onSelect ? 0 : -1}
                aria-hidden={i !== 0 || !onSelect ? true : undefined}
                aria-label={`${p.ch} 블록 선택`}
                aria-pressed={selected === p.id}
                className="exit-piece-cell"
                style={{
                  left: `${(x / width) * 100}%`,
                  top: `${(y / height) * 100}%`,
                  width: `${100 / width}%`,
                  height: `${100 / height}%`,
                  background: EXIT_COLORS[p.id % 8],
                  pointerEvents: onSelect ? 'auto' : 'none',
                }}
                onPointerDown={(e) => {
                  if (!onSelect) return;
                  onSelect(p.id);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.currentTarget.dataset.dragX = String(e.clientX);
                  e.currentTarget.dataset.dragY = String(e.clientY);
                }}
                onPointerUp={(e) => {
                  if (!onDrag) return;
                  const dx = e.clientX - Number(e.currentTarget.dataset.dragX),
                    dy = e.clientY - Number(e.currentTarget.dataset.dragY);
                  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
                  onDrag(
                    p.id,
                    Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0,
                    Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : 0,
                  );
                }}
                onClick={() => onSelect?.(p.id)}
              >
                {i === 0 ? (
                  <>
                    <b>{p.ch}</b>
                    <span className="exit-face">•ᴗ•</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
