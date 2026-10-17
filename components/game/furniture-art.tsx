import { FURNITURE } from '@/lib/furniture';
export function FurnitureArt({ id }: { id: string }) {
  const f = FURNITURE.find((x) => x.id === id);
  if (!f) return null;
  return (
    <svg
      viewBox="0 0 160 160"
      role="img"
      aria-label={f.name}
      className={`furniture-art furniture-${f.kind}`}
    >
      <ellipse cx="80" cy="139" rx="58" ry="10" fill="#715147" opacity=".12" />
      {f.kind === 'rug' && (
        <>
          <ellipse cx="80" cy="116" rx="74" ry="34" fill="#dfa2a4" />
          <ellipse cx="80" cy="110" rx="74" ry="34" fill={f.color} />
          <ellipse
            cx="80"
            cy="108"
            rx="61"
            ry="26"
            fill="none"
            stroke="#fff0e6"
            strokeWidth="3"
            strokeDasharray="3 5"
          />
          <path
            d="M52 105q8-12 16 0t16 0t16 0"
            fill="none"
            stroke="#ffe9d6"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </>
      )}
      {f.kind === 'sofa' && (
        <>
          <path d="M34 125v17m92-17v17" stroke="#ac7952" strokeWidth="8" strokeLinecap="round" />
          <rect x="19" y="46" width="122" height="78" rx="30" fill="#dbab60" />
          <rect x="27" y="44" width="106" height="62" rx="25" fill={f.color} />
          <path d="M80 57v40" stroke="#e6ba73" strokeWidth="3" />
          <rect x="27" y="100" width="106" height="32" rx="13" fill="#ffe1a1" />
          <rect x="12" y="86" width="26" height="45" rx="12" fill="#edc77d" />
          <rect x="122" y="86" width="26" height="45" rx="12" fill="#edc77d" />
          <rect
            x="41"
            y="75"
            width="27"
            height="28"
            rx="9"
            fill="#fff3d4"
            transform="rotate(-12 54 89)"
          />
        </>
      )}
      {f.kind === 'plant' && (
        <>
          <path
            d="M80 110V36m0 47L47 57m33 12 31-31"
            stroke="#457c56"
            strokeWidth="5"
            fill="none"
          />
          <path
            d="M78 68C24 77 24 25 35 24c40-2 41 20 43 44M82 59c-7-44 35-46 44-37 3 30-12 41-44 37M84 91c9-38 45-27 48-17-7 26-23 26-48 17"
            fill={f.color}
          />
          <path d="M51 104h58l-9 37H61z" fill="#e3a387" />
          <ellipse cx="80" cy="105" rx="30" ry="7" fill="#f4c5a9" />
          <path d="M70 118v13m12-13v13m12-13v13" stroke="#f8d7be" strokeWidth="3" />
        </>
      )}
      {f.kind === 'lamp' && (
        <>
          <circle cx="80" cy="59" r="47" fill="#ffe7a7" opacity=".15" />
          <path d="M79 86v49" stroke="#c49b63" strokeWidth="6" />
          <ellipse cx="79" cy="137" rx="28" ry="7" fill="#dfba7e" />
          <path d="M100 22c-42-7-61 38-32 62 20 16 45 8 54-12-45 12-63-26-22-50" fill={f.color} />
          <path d="m119 33 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#ffe9b1" />
        </>
      )}
      {f.kind === 'books' && (
        <>
          <rect x="28" y="24" width="104" height="119" rx="9" fill="#b17e5d" />
          <rect x="36" y="30" width="88" height="104" rx="5" fill="#e7c6a2" />
          <path d="M35 82h90M35 129h90" stroke="#bc8964" strokeWidth="8" />
          {['#91b8b1', '#ec9e9a', '#efc975', '#a3a8cf', '#86b2cc'].map((c, i) => (
            <g key={c}>
              <rect
                x={44 + i * 14}
                y={42 + (i % 2) * 7}
                width="11"
                height={36 - (i % 2) * 7}
                rx="2"
                fill={c}
              />
              <path d={`M${47 + i * 14} 69h5`} stroke="#fff5df" strokeWidth="2" />
            </g>
          ))}
          <rect x="45" y="98" width="35" height="24" rx="5" fill="#f6dfbd" />
          <circle cx="99" cy="112" r="12" fill="#a9c78e" />
          <path d="M96 111q4-10 10-9" stroke="#588864" fill="none" />
        </>
      )}
      {f.kind === 'cushion' && (
        <>
          <path
            d="M27 82Q20 47 53 53q28-17 54 0 35-4 29 29 15 33-16 44-41 18-74 0-28 4-19-44"
            fill={f.color}
          />
          <path
            d="M39 77q-6-17 17-16m51 2q20-4 17 15M43 116q30 17 65 4"
            fill="none"
            stroke="#ffdbe1"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M64 84q15-19 31 0l-15 22z" fill="#dd708c" />
          <path d="m75 81 5-6 6 6" fill="none" stroke="#6f9d69" strokeWidth="4" />
        </>
      )}
      {f.kind === 'aquarium' && (
        <>
          <rect x="33" y="31" width="94" height="101" rx="32" fill="#6376a7" />
          <rect x="39" y="35" width="82" height="86" rx="27" fill="#9ad9e0" />
          <path d="M42 57q15-9 32 0t45 0v43q0 22-23 22H63q-21 0-21-22z" fill="#79bfd4" />
          <path d="M60 81c0-28 41-28 41 0z" fill="#f2d1e9" />
          <path
            d="M63 85q-9 13 0 18m15-18q-9 13 0 24m14-24q-9 13 0 18"
            stroke="#fce4f0"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="71" cy="75" r="2" fill="#677191" />
          <circle cx="89" cy="75" r="2" fill="#677191" />
          <path d="M49 48v47" stroke="#e5faff" opacity=".7" strokeWidth="5" strokeLinecap="round" />
          <circle cx="107" cy="61" r="4" fill="#c9f4f4" />
          <path d="M40 131h80" stroke="#7e8db5" strokeWidth="9" strokeLinecap="round" />
        </>
      )}
      {f.kind === 'tea' && (
        <>
          <path d="M38 104v33m85-33v33" stroke="#b98059" strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="80" cy="100" rx="61" ry="20" fill="#ba825d" />
          <ellipse cx="80" cy="94" rx="61" ry="20" fill="#e0b38b" />
          <ellipse cx="67" cy="90" rx="21" ry="8" fill="#fff1d5" />
          <path d="M53 69h27v17q-12 11-27 0z" fill="#e9e6d0" />
          <path d="M80 73q20-3 10 12H80" fill="none" stroke="#e9e6d0" strokeWidth="5" />
          <ellipse cx="66" cy="69" rx="14" ry="4" fill="#a77651" />
          <path
            d="M61 57q-6-7 0-14m9 15q-6-7 0-14"
            stroke="#fff1dc"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="108" cy="94" rx="15" ry="6" fill="#fff1d5" />
          <path d="M98 89v-7h20v7" fill="#e8a598" />
          <path d="M98 82h20" stroke="#fff1d5" strokeWidth="4" />
        </>
      )}
    </svg>
  );
}
