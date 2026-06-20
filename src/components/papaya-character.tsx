'use client'

/**
 * PapayaCharacter (aka Relapa) — an animated SVG ant conductor that does the Floss dance.
 *
 * - idle: gentle sway + bob, arms relaxed.
 * - dancing: full floss loop (arms swing across the body, body sway, bob).
 * - freeze / frozen / gameover: animation pauses in place (frozen mid-floss),
 *   face switches to a surprised "O" expression.
 *
 * The freeze is achieved with `animation-play-state: paused`, which halts the
 * CSS animations exactly at the current frame — so Relapa keeps whatever
 * floss pose it was in when the music stopped.
 *
 * Character design: anthropomorphic ant conductor — warm amber-brown
 * exoskeleton, large expressive compound eyes, segmented antennae, top hat
 * with musical note, burgundy bow tie, tailored dark suit with gold buttons.
 */

export type CharState =
  | 'idle'
  | 'dancing'
  | 'freeze'
  | 'frozen'
  | 'gameover'

export function PapayaCharacter({
  state,
  className = '',
}: {
  state: CharState
  className?: string
}) {
  const isDancing =
    state === 'dancing' ||
    state === 'freeze' ||
    state === 'frozen' ||
    state === 'gameover'
  const isFrozen =
    state === 'freeze' || state === 'frozen' || state === 'gameover'

  const cls = [
    'papaya',
    isDancing ? 'is-dancing' : 'is-idle',
    isFrozen ? 'is-frozen' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      viewBox="0 0 300 380"
      className={cls}
      role="img"
      aria-label="Relapa"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Light warm amber-brown exoskeleton */}
        <linearGradient id="relapaBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8794a" />
          <stop offset="50%" stopColor="#9c6638" />
          <stop offset="100%" stopColor="#7a4e28" />
        </linearGradient>
        <linearGradient id="relapaHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c4854f" />
          <stop offset="50%" stopColor="#a06d3c" />
          <stop offset="100%" stopColor="#855830" />
        </linearGradient>
        <linearGradient id="relapaHat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d2b1a" />
          <stop offset="100%" stopColor="#1a1208" />
        </linearGradient>
        <linearGradient id="relapaSuit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2818" />
          <stop offset="100%" stopColor="#1f140a" />
        </linearGradient>
        <radialGradient id="relapaEye" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="70%" stopColor="#f0e8d8" />
          <stop offset="100%" stopColor="#c8b89a" />
        </radialGradient>
        {/* Highlight overlay for 3D sheen on exoskeleton */}
        <linearGradient id="relapaSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className="bob-group">
        {/* ===== legs / feet ===== */}
        <g className="legs">
          <rect x="125" y="318" width="14" height="42" rx="6" fill="url(#relapaBody)" />
          <rect x="161" y="318" width="14" height="42" rx="6" fill="url(#relapaBody)" />
          <ellipse cx="132" cy="362" rx="16" ry="8" fill="#5a3a1e" />
          <ellipse cx="168" cy="362" rx="16" ry="8" fill="#5a3a1e" />
        </g>

        {/* ===== back arm (drawn behind body so floss reads front/behind) ===== */}
        <g className="arm-back">
          <rect
            x="68"
            y="196"
            width="18"
            height="72"
            rx="9"
            fill="url(#relapaBody)"
            stroke="#5a3a1e"
            strokeWidth="1"
          />
          {/* hand */}
          <circle cx="77" cy="272" r="11" fill="url(#relapaHead)" stroke="#5a3a1e" strokeWidth="1" />
        </g>

        {/* ===== hips group (LOWER body: suit jacket lower half) ===== */}
        <g className="hips-group">
          {/* lower torso / suit jacket */}
          <ellipse cx="150" cy="290" rx="52" ry="58" fill="url(#relapaSuit)" />
          {/* sheen */}
          <ellipse cx="138" cy="272" rx="22" ry="30" fill="url(#relapaSheen)" />
          {/* suit lapels */}
          <path d="M126 258 L150 305 L174 258" fill="none" stroke="#6b4a2a" strokeWidth="2.5" strokeLinecap="round" />
          {/* gold buttons */}
          <circle cx="150" cy="278" r="3.5" fill="#e8b830" stroke="#a08020" strokeWidth="0.5" />
          <circle cx="150" cy="298" r="3.5" fill="#e8b830" stroke="#a08020" strokeWidth="0.5" />
          <circle cx="150" cy="318" r="3.5" fill="#e8b830" stroke="#a08020" strokeWidth="0.5" />
        </g>

        {/* ===== body group (UPPER body: head, hat, face, shoulders) ===== */}
        <g className="body-group">
          {/* upper torso / shoulders */}
          <ellipse cx="150" cy="215" rx="48" ry="42" fill="url(#relapaSuit)" />
          {/* sheen on shoulder */}
          <ellipse cx="135" cy="200" rx="18" ry="22" fill="url(#relapaSheen)" />

          {/* bow tie */}
          <path d="M136 206 L128 194 L128 218 L136 206 M164 206 L172 194 L172 218 L164 206" fill="#8b1d2e" stroke="#6a1521" strokeWidth="1" />
          <circle cx="150" cy="206" r="5" fill="#8b1d2e" />

          {/* collar */}
          <path d="M138 180 L150 200 L162 180" fill="none" stroke="#6b4a2a" strokeWidth="2" strokeLinecap="round" />

          {/* neck */}
          <rect x="142" y="160" width="16" height="22" rx="4" fill="url(#relapaBody)" />

          {/* head (ant head — more realistic oval with mandibles) */}
          <ellipse cx="150" cy="138" rx="44" ry="40" fill="url(#relapaHead)" stroke="#5a3a1e" strokeWidth="1" />
          {/* head sheen */}
          <ellipse cx="138" cy="122" rx="22" ry="26" fill="url(#relapaSheen)" />

          {/* mandibles (ant jaws) */}
          <path d="M128 156 Q120 162 122 168" fill="none" stroke="#5a3a1e" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M172 156 Q180 162 178 168" fill="none" stroke="#5a3a1e" strokeWidth="2.5" strokeLinecap="round" />

          {/* antennae — segmented, more realistic */}
          <g className="antennae">
            <path d="M130 104 Q118 84 112 66" fill="none" stroke="#7a4e28" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="112" cy="64" rx="5" ry="7" fill="#7a4e28" transform="rotate(-20 112 64)" />
            <path d="M170 104 Q182 84 188 66" fill="none" stroke="#7a4e28" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="188" cy="64" rx="5" ry="7" fill="#7a4e28" transform="rotate(20 188 64)" />
          </g>

          {/* top hat */}
          <g className="top-hat">
            {/* hat brim */}
            <ellipse cx="150" cy="102" rx="46" ry="9" fill="url(#relapaHat)" />
            {/* hat body */}
            <rect x="122" y="56" width="56" height="48" rx="4" fill="url(#relapaHat)" />
            {/* hat sheen */}
            <rect x="128" y="58" width="10" height="44" rx="3" fill="#5a3a1e" opacity="0.4" />
            {/* hat band */}
            <rect x="122" y="90" width="56" height="10" fill="#8b1d2e" />
            {/* musical note on hat */}
            <text x="150" y="80" textAnchor="middle" fontSize="18" fill="#e8b830" fontWeight="bold">♪</text>
          </g>

          {/* ===== face ===== */}
          {/* happy face (dancing) */}
          <g className="face face-happy">
            {/* compound eye base */}
            <ellipse cx="132" cy="136" rx="14" ry="16" fill="url(#relapaEye)" stroke="#5a3a1e" strokeWidth="1" />
            <ellipse cx="168" cy="136" rx="14" ry="16" fill="url(#relapaEye)" stroke="#5a3a1e" strokeWidth="1" />
            {/* pupils */}
            <circle cx="134" cy="138" r="6" fill="#1a0e04" />
            <circle cx="166" cy="138" r="6" fill="#1a0e04" />
            {/* eye highlights */}
            <circle cx="136" cy="135" r="2.5" fill="#fff" />
            <circle cx="168" cy="135" r="2.5" fill="#fff" />
            <circle cx="131" cy="141" r="1" fill="#fff" opacity="0.6" />
            <circle cx="163" cy="141" r="1" fill="#fff" opacity="0.6" />
            {/* smile */}
            <path d="M138 158 Q150 168 162 158" fill="none" stroke="#3a2010" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          {/* surprised face (frozen) */}
          <g className="face face-surprised">
            <ellipse cx="132" cy="132" rx="15" ry="18" fill="url(#relapaEye)" stroke="#5a3a1e" strokeWidth="1" />
            <ellipse cx="168" cy="132" rx="15" ry="18" fill="url(#relapaEye)" stroke="#5a3a1e" strokeWidth="1" />
            <circle cx="132" cy="134" r="8" fill="#1a0e04" />
            <circle cx="168" cy="134" r="8" fill="#1a0e04" />
            <circle cx="134" cy="131" r="3" fill="#fff" />
            <circle cx="170" cy="131" r="3" fill="#fff" />
            {/* O mouth */}
            <ellipse cx="150" cy="160" rx="7" ry="9" fill="#3a2010" />
            <ellipse cx="150" cy="162" rx="4" ry="6" fill="#8b1d2e" />
          </g>
        </g>

        {/* ===== front arm (drawn after body so it's always in front) ===== */}
        <g className="arm-front">
          <rect
            x="214"
            y="196"
            width="18"
            height="72"
            rx="9"
            fill="url(#relapaBody)"
            stroke="#5a3a1e"
            strokeWidth="1"
          />
          {/* hand */}
          <circle cx="223" cy="272" r="11" fill="url(#relapaHead)" stroke="#5a3a1e" strokeWidth="1" />
        </g>
      </g>
    </svg>
  )
}
