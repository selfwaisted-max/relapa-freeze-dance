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
 * Character design: anthropomorphic ant conductor — black exoskeleton, large
 * eyes, antennae, top hat with musical note, burgundy bow tie, black suit
 * with gold buttons, holding a conductor's baton.
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
        <linearGradient id="relapaBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>
        <linearGradient id="relapaHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#333" />
          <stop offset="100%" stopColor="#111" />
        </linearGradient>
        <linearGradient id="relapaHat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>
        <linearGradient id="relapaSuit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#222" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>
        <radialGradient id="relapaEye" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="80%" stopColor="#f0f0f0" />
          <stop offset="100%" stopColor="#ccc" />
        </radialGradient>
      </defs>

      <g className="bob-group">
        {/* ===== legs / feet ===== */}
        <g className="legs">
          <rect x="125" y="318" width="14" height="42" rx="6" fill="url(#relapaBody)" />
          <rect x="161" y="318" width="14" height="42" rx="6" fill="url(#relapaBody)" />
          <ellipse cx="132" cy="362" rx="16" ry="8" fill="#1a1a1a" />
          <ellipse cx="168" cy="362" rx="16" ry="8" fill="#1a1a1a" />
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
            stroke="#000"
            strokeWidth="1.5"
          />
          <circle cx="77" cy="272" r="11" fill="url(#relapaBody)" stroke="#000" strokeWidth="1.5" />
        </g>

        {/* ===== hips group (LOWER body: suit jacket lower half) ===== */}
        <g className="hips-group">
          {/* lower torso / suit jacket */}
          <ellipse cx="150" cy="290" rx="52" ry="58" fill="url(#relapaSuit)" />
          {/* suit lapels */}
          <path d="M128 258 L150 300 L172 258" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" />
          {/* gold buttons */}
          <circle cx="150" cy="278" r="3" fill="#d4a017" />
          <circle cx="150" cy="298" r="3" fill="#d4a017" />
          <circle cx="150" cy="318" r="3" fill="#d4a017" />
        </g>

        {/* ===== body group (UPPER body: head, hat, face, shoulders) ===== */}
        <g className="body-group">
          {/* upper torso / shoulders */}
          <ellipse cx="150" cy="215" rx="48" ry="42" fill="url(#relapaSuit)" />
          {/* bow tie */}
          <path d="M138 205 L132 195 L132 215 L138 205 M162 205 L168 195 L168 215 L162 205" fill="#7c1d2e" stroke="#5a1521" strokeWidth="1" />
          <circle cx="150" cy="205" r="5" fill="#7c1d2e" />

          {/* neck */}
          <rect x="142" y="160" width="16" height="20" fill="url(#relapaBody)" />

          {/* head (ant head — oval) */}
          <ellipse cx="150" cy="140" rx="42" ry="38" fill="url(#relapaHead)" stroke="#000" strokeWidth="1" />

          {/* antennae */}
          <g className="antennae">
            <path d="M132 108 Q120 88 116 72" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
            <circle cx="116" cy="70" r="5" fill="#1a1a1a" />
            <path d="M168 108 Q180 88 184 72" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
            <circle cx="184" cy="70" r="5" fill="#1a1a1a" />
          </g>

          {/* top hat */}
          <g className="top-hat">
            {/* hat brim */}
            <ellipse cx="150" cy="104" rx="44" ry="8" fill="url(#relapaHat)" />
            {/* hat body */}
            <rect x="124" y="60" width="52" height="46" rx="4" fill="url(#relapaHat)" />
            {/* hat band */}
            <rect x="124" y="92" width="52" height="8" fill="#7c1d2e" />
            {/* musical note on hat */}
            <text x="150" y="82" textAnchor="middle" fontSize="16" fill="#d4a017" fontWeight="bold">♪</text>
          </g>

          {/* ===== face ===== */}
          {/* happy face (dancing) */}
          <g className="face face-happy">
            {/* eyes — large compound ant eyes */}
            <ellipse cx="134" cy="138" rx="12" ry="14" fill="url(#relapaEye)" />
            <ellipse cx="166" cy="138" rx="12" ry="14" fill="url(#relapaEye)" />
            <circle cx="136" cy="140" r="5" fill="#1a1a1a" />
            <circle cx="164" cy="140" r="5" fill="#1a1a1a" />
            <circle cx="138" cy="137" r="1.8" fill="#fff" />
            <circle cx="166" cy="137" r="1.8" fill="#fff" />
            {/* smile */}
            <path d="M138 156 Q150 166 162 156" fill="none" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          {/* surprised face (frozen) */}
          <g className="face face-surprised">
            <ellipse cx="134" cy="134" rx="14" ry="16" fill="url(#relapaEye)" />
            <ellipse cx="166" cy="134" rx="14" ry="16" fill="url(#relapaEye)" />
            <circle cx="134" cy="136" r="7" fill="#1a1a1a" />
            <circle cx="166" cy="136" r="7" fill="#1a1a1a" />
            <circle cx="136" cy="133" r="2" fill="#fff" />
            <circle cx="168" cy="133" r="2" fill="#fff" />
            {/* O mouth */}
            <ellipse cx="150" cy="158" rx="6" ry="8" fill="#1a1a1a" />
            <ellipse cx="150" cy="160" rx="3.5" ry="5" fill="#7c1d2e" />
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
            stroke="#000"
            strokeWidth="1.5"
          />
          <circle cx="223" cy="272" r="11" fill="url(#relapaBody)" stroke="#000" strokeWidth="1.5" />
          {/* conductor's baton */}
          <line x1="223" y1="272" x2="245" y2="245" stroke="#d4a017" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="223" cy="272" r="3" fill="#d4a017" />
        </g>
      </g>
    </svg>
  )
}
