import { ALL_SKINS } from '@/lib/skins';
import { CHARACTER_ART } from '@/lib/character-art';

/** Display-only mapping: never replaces persistent emoji identity. */
export function CharacterAvatar({
  avatar,
  skin,
  className = '',
}: {
  avatar?: string | null;
  skin?: string | null;
  className?: string;
}) {
  const outfit = ALL_SKINS.find((s) => s.id === skin && s.avatar === avatar);
  const art = outfit
    ? { name: `${outfit.name} ${CHARACTER_ART[avatar!]?.name || ''}`, box: outfit.box, sheet: 0 }
    : avatar
      ? CHARACTER_ART[avatar]
      : undefined;
  if (!art) return <span className={className}>{avatar || '👤'}</span>;
  const [x, y, width, height] = art.box.split(' ').map(Number);
  return (
    <svg
      className={`kongal-avatar ${className}`}
      viewBox={art.box}
      role="img"
      aria-label={art.name}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <svg x={x} y={y} width={width} height={height} viewBox={art.box} overflow="hidden">
        <image
          href={
            outfit
              ? outfit.source || '/characters/skins-01.png'
              : `/characters/kongal-0${art.sheet}.png`
          }
          width={outfit ? outfit.sheetSize || 1536 : 1254}
          height={outfit ? outfit.sheetSize || 1024 : 1254}
        />
      </svg>
    </svg>
  );
}
