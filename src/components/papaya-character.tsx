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

export type Skin = 'papaya' | 'strawberry' | 'blueberry' | 'grape' | 'lime'

export const SKINS: { id: Skin; label: string; emoji: string }[] = [
  { id: 'papaya', label: 'Папайа', emoji: '🥭' },
  { id: 'strawberry', label: 'Клубника', emoji: '🍓' },
  { id: 'blueberry', label: 'Черника', emoji: '🫐' },
  { id: 'grape', label: 'Виноград', emoji: '🍇' },
  { id: 'lime', label: 'Лайм', emoji: '🟢' },
]

export function PapayaCharacter({
  state,
  skin = 'papaya',
  className = '',
}: {
  state: CharState
  skin?: Skin
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
    skin !== 'papaya' ? `skin-${skin}` : '',
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
          <stop offset="0%" stopColor="var(--p-flesh-top, #fde047)" />
          <stop offset="45%" stopColor="var(--p-flesh-mid, #fbbf24)" />
          <stop offset="100%" stopColor="var(--p-flesh-bot, #f97316)" />
        </linearGradient>
        <linearGradient id="papayaSkin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--p-skin-top, #bef264)" />
          <stop offset="100%" stopColor="var(--p-skin-bot, #65a30d)" />
        </linearGradient>
        <radialGradient id="papayaCavity" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--p-cav-top, #fb923c)" />
          <stop offset="70%" stopColor="var(--p-cav-mid, #ea580c)" />
          <stop offset="100%" stopColor="var(--p-cav-bot, #9a3412)" />
        </radialGradient>
        <linearGradient id="papayaLimb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--p-limb-top, #fb923c)" />
          <stop offset="100%" stopColor="var(--p-limb-bot, #ea580c)" />
        </linearGradient>
        <linearGradient id="papayaLeaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--p-leaf-top, #86efac)" />
          <stop offset="100%" stopColor="var(--p-leaf-bot, #4d7c0f)" />
        </linearGradient>
        <radialGradient id="papayaCheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--p-cheek, #fb7185)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="var(--p-cheek, #fb7185)" stopOpacity="0" />
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

        {/* ===== back arm (drawn behind body so floss reads front/behind) =====
             Thicker + darker outline so it stays visible as a limb. */}
        <g className="arm-back">
          <rect
            x="66"
            y="196"
            width="20"
            height="78"
            rx="10"
            fill="url(#papayaLimb)"
            opacity="0.95"
            stroke="var(--p-outline, #9a3412)"
            strokeWidth="1.5"
          />
          <circle cx="76" cy="278" r="13" fill="var(--p-limb-top, #fb923c)" stroke="var(--p-outline, #9a3412)" strokeWidth="1.5" />
        </g>

        {/* ===== hips group (LOWER body half: belly + seed cavity + seeds).
             Drawn BEFORE body-group so the upper body overlaps its top edge,
             and it sways OPPOSITE to the shoulders — the real floss read. ===== */}
        <g className="hips-group">
          {/* lower half of the papaya silhouette */}
          <ellipse cx="150" cy="300" rx="92" ry="86" fill="url(#papayaSkin)" />
          <ellipse cx="150" cy="300" rx="85" ry="80" fill="url(#papayaFlesh)" />
          {/* seed cavity + seeds */}
          <ellipse cx="150" cy="288" rx="46" ry="56" fill="url(#papayaCavity)" />
          <g fill="var(--p-seed, #1c1917)">
            <ellipse cx="150" cy="258" rx="5" ry="7" />
            <ellipse cx="132" cy="270" rx="4.5" ry="6" />
            <ellipse cx="168" cy="270" rx="4.5" ry="6" />
            <ellipse cx="146" cy="288" rx="5" ry="7" />
            <ellipse cx="162" cy="292" rx="4.5" ry="6" />
            <ellipse cx="128" cy="298" rx="4.5" ry="6" />
            <ellipse cx="172" cy="302" rx="4.5" ry="6" />
            <ellipse cx="152" cy="310" rx="5" ry="6.5" />
            <ellipse cx="138" cy="316" rx="4" ry="5.5" />
            <ellipse cx="166" cy="318" rx="4" ry="5.5" />
          </g>
        </g>

        {/* ===== body group (UPPER body half: shoulders/chest + leaf + face,
             sways side to side). Drawn after hips so it overlaps cleanly. ===== */}
        <g className="body-group">
          {/* upper half of the papaya silhouette */}
          <ellipse cx="150" cy="160" rx="94" ry="96" fill="url(#papayaSkin)" />
          <ellipse cx="150" cy="162" rx="86" ry="89" fill="url(#papayaFlesh)" />
          {/* soft highlight on the upper chest */}
          <ellipse
            cx="118"
            cy="128"
            rx="28"
            ry="42"
            fill="#fff"
            opacity="0.18"
          />

          {/* leaf + stem on top */}
          <g className="leaf-stem">
            <rect
              x="146"
              y="64"
              width="8"
              height="22"
              rx="4"
              fill="var(--p-stem, #4d7c0f)"
            />
            <path
              d="M150 68 C 128 50, 104 52, 96 68 C 116 76, 138 76, 150 68 Z"
              fill="url(#papayaLeaf)"
            />
            <path
              d="M150 68 C 172 50, 196 52, 204 68 C 184 76, 162 76, 150 68 Z"
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

        {/* ===== front arm (drawn after body so it's always in front).
             Thicker + outlined so it reads as a limb against the body. ===== */}
        <g className="arm-front">
          <rect
            x="214"
            y="196"
            width="20"
            height="78"
            rx="10"
            fill="url(#papayaLimb)"
            stroke="var(--p-outline, #9a3412)"
            strokeWidth="1.5"
          />
          <circle cx="224" cy="278" r="13" fill="var(--p-limb-top, #fb923c)" stroke="var(--p-outline, #9a3412)" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  )
}
