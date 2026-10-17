import type { Color } from '@/lib/game';
export const judgmentLabel: Record<Color, string> = {
  green: '위치 일치',
  yellow: '다른 위치',
  gray: '미포함 또는 개수 초과',
};
export function JudgmentMark({ color }: { color?: Color }) {
  if (!color) return null;
  return (
    <span className={`judgment-mark judgment-${color}`} aria-hidden="true">
      {color === 'green' ? '✓' : color === 'yellow' ? '•' : '−'}
    </span>
  );
}
