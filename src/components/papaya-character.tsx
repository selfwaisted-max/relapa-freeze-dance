'use client'

/**
 * PapayaCharacter — an animated SVG papaya that does the Floss dance.
 *
 * - idle: gentle sway + bob, arms relaxed.
 * - dancing: full floss loop (arms swing across the body, body sway, bob).
 * - freeze / frozen / gameover: animation pauses in place (frozen mid-floss),
 *   face switches to a surprised "O" expression.
 *
 * The freeze is achieved with `animation-play-state: paused`, which halts the
 * CSS animations exactly at the current frame — so the papaya keeps whatever
 * floss pose it was in when the music stopped.
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
  const isSad = state === 'gameover'

  const cls = [
    'papaya',
    isDancing ? 'is-dancing' : 'is-idle',
    isFrozen ? 'is-frozen' : '',
    isSad ? 'is-sad' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      viewBox="0 0 300 380"
      className={cls}
      role="img"
      aria-label="Папайа"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="papayaFlesh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="45%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id="papayaSkin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bef264" />
          <stop offset="100%" stopColor="#65a30d" />
        </linearGradient>
        <radialGradient id="papayaCavity" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="70%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#9a3412" />
        </radialGradient>
        <linearGradient id="papayaLimb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="papayaLeaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#4d7c0f" />
        </linearGradient>
        <radialGradient id="papayaCheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fb7185" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="bob-group">
        {/* ===== legs / feet (planted, only bob) ===== */}
        <g className="legs">
          <ellipse cx="116" cy="330" rx="25" ry="14" fill="url(#papayaLimb)" />
          <ellipse cx="184" cy="330" rx="25" ry="14" fill="url(#papayaLimb)" />
          <ellipse cx="116" cy="326" rx="25" ry="6" fill="#fff" opacity="0.18" />
          <ellipse cx="184" cy="326" rx="25" ry="6" fill="#fff" opacity="0.18" />
        </g>

        {/* ===== back arm (drawn behind body so floss reads front/behind) ===== */}
        <g className="arm-back">
          <rect
            x="69"
            y="198"
            width="16"
            height="74"
            rx="8"
            fill="url(#papayaLimb)"
            opacity="0.92"
          />
          <circle cx="77" cy="276" r="11" fill="#ea580c" />
        </g>

        {/* ===== body group (shoulders sway) ===== */}
        <g className="body-group">
          {/* green skin rim */}
          <ellipse cx="150" cy="212" rx="94" ry="120" fill="url(#papayaSkin)" />
          {/* flesh */}
          <ellipse cx="150" cy="214" rx="86" ry="113" fill="url(#papayaFlesh)" />
          {/* soft highlight */}
          <ellipse
            cx="118"
            cy="158"
            rx="30"
            ry="46"
            fill="#fff"
            opacity="0.18"
          />

          {/* ===== hips group (seed cavity + seeds, sways OPPOSITE to shoulders) ===== */}
          <g className="hips-group">
            <ellipse
              cx="150"
              cy="262"
              rx="44"
              ry="52"
              fill="url(#papayaCavity)"
            />
            <g fill="#1c1917">
              <ellipse cx="150" cy="232" rx="5" ry="7" />
              <ellipse cx="132" cy="244" rx="4.5" ry="6" />
              <ellipse cx="168" cy="244" rx="4.5" ry="6" />
              <ellipse cx="146" cy="262" rx="5" ry="7" />
              <ellipse cx="162" cy="266" rx="4.5" ry="6" />
              <ellipse cx="128" cy="272" rx="4.5" ry="6" />
              <ellipse cx="172" cy="276" rx="4.5" ry="6" />
              <ellipse cx="152" cy="284" rx="5" ry="6.5" />
              <ellipse cx="138" cy="290" rx="4" ry="5.5" />
              <ellipse cx="166" cy="292" rx="4" ry="5.5" />
            </g>
          </g>

          {/* leaf + stem on top */}
          <g className="leaf-stem">
            <rect
              x="146"
              y="92"
              width="8"
              height="22"
              rx="4"
              fill="#4d7c0f"
            />
            <path
              d="M150 96 C 128 78, 104 80, 96 96 C 116 104, 138 104, 150 96 Z"
              fill="url(#papayaLeaf)"
            />
            <path
              d="M150 96 C 172 78, 196 80, 204 96 C 184 104, 162 104, 150 96 Z"
              fill="url(#papayaLeaf)"
            />
          </g>

          {/* ===== face ===== */}
          {/* normal (happy) face */}
          <g className="face face-happy">
            {/* cheeks */}
            <circle cx="104" cy="196" r="13" fill="url(#papayaCheek)" />
            <circle cx="196" cy="196" r="13" fill="url(#papayaCheek)" />
            {/* eyes */}
            <ellipse cx="124" cy="176" rx="13" ry="15" fill="#fff" />
            <ellipse cx="176" cy="176" rx="13" ry="15" fill="#fff" />
            <circle cx="127" cy="179" r="5.5" fill="#1c1917" />
            <circle cx="173" cy="179" r="5.5" fill="#1c1917" />
            <circle cx="129" cy="177" r="1.8" fill="#fff" />
            <circle cx="175" cy="177" r="1.8" fill="#fff" />
            {/* smile */}
            <path
              d="M132 198 Q150 216 168 198"
              fill="none"
              stroke="#7c2d12"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </g>
          {/* surprised face (shown when frozen) */}
          <g className="face face-surprised">
            <circle cx="104" cy="196" r="13" fill="url(#papayaCheek)" />
            <circle cx="196" cy="196" r="13" fill="url(#papayaCheek)" />
            <ellipse cx="124" cy="176" rx="15" ry="17" fill="#fff" />
            <ellipse cx="176" cy="176" rx="15" ry="17" fill="#fff" />
            <circle cx="124" cy="178" r="7" fill="#1c1917" />
            <circle cx="176" cy="178" r="7" fill="#1c1917" />
            <circle cx="126" cy="175" r="2" fill="#fff" />
            <circle cx="178" cy="175" r="2" fill="#fff" />
            {/* O mouth */}
            <ellipse
              cx="150"
              cy="206"
              rx="8"
              ry="10"
              fill="#7c2d12"
            />
            <ellipse cx="150" cy="208" rx="5" ry="6" fill="#fb7185" />
          </g>
        </g>

        {/* ===== front arm (drawn after body so it's always in front) ===== */}
        <g className="arm-front">
          <rect
            x="215"
            y="198"
            width="16"
            height="74"
            rx="8"
            fill="url(#papayaLimb)"
          />
          <circle cx="223" cy="276" r="11" fill="#fb923c" />
          <circle cx="223" cy="276" r="11" fill="none" stroke="#c2410c" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  )
}
