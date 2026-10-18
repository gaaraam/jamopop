'use client';
export type StackTile = { id: number; ch: string };
const COLORS: Record<string, string> = {
  ㄱ: 'mint',
  ㄴ: 'violet',
  ㅁ: 'peach',
  ㅅ: 'sky',
  ㅇ: 'gold',
  ㅏ: 'rose',
  ㅗ: 'lime',
  ㅜ: 'blue',
};
export function StackBoard({
  cols,
  onPick,
  highlight,
  disabled = false,
}: {
  cols: StackTile[][];
  onPick?: (col: number) => void;
  highlight?: number | null;
  disabled?: boolean;
}) {
  const depth = Math.max(1, ...cols.map((c) => c.length));
  return (
    <div
      className="stack-board"
      role={onPick ? 'group' : undefined}
      aria-label={onPick ? '자모 더미' : undefined}
      style={{ height: `calc(var(--stack-tile) + ${depth - 1} * var(--stack-depth))` }}
    >
      {cols.map((col, i) => (
        <button
          key={i}
          className="stack-column"
          type="button"
          aria-label={`${i + 1}열${col[0] ? ` 맨 위 ${col[0].ch}` : ' 비었음'}`}
          disabled={!onPick || disabled || !col.length}
          data-hint={highlight === i || undefined}
          onClick={() => onPick?.(i)}
        >
          {col.length ? (
            col.map((tile, j) => (
              <span
                aria-hidden="true"
                key={tile.id}
                className={`stack-tile stack-${COLORS[tile.ch] || 'mint'}`}
                data-front={j === 0 || undefined}
                style={{ top: `calc(${j} * var(--stack-depth))`, zIndex: col.length - j }}
              >
                {tile.ch}
              </span>
            ))
          ) : (
            <span className="stack-empty" aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  );
}
export function StackTray({ tray, matched }: { tray: StackTile[]; matched?: string | null }) {
  return (
    <div className="stack-tray-wrap">
      <div className="stack-tray-heading">
        <span>보관함</span>
        <span>{tray.length} / 7</span>
      </div>
      <div
        className="stack-tray"
        role="group"
        aria-label={`보관함 ${tray.length} / 7`}
        data-full={tray.length === 7 || undefined}
      >
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className={`stack-tray-slot ${tray[i] ? `stack-${COLORS[tray[i].ch] || 'mint'}` : ''}`}
            aria-label={tray[i]?.ch || '빈칸'}
          >
            {tray[i]?.ch}
          </span>
        ))}
      </div>
      <div className="stack-match" role="status" key={matched || 'empty'}>
        {matched ? `${matched} × 3` : '\u00a0'}
      </div>
    </div>
  );
}
