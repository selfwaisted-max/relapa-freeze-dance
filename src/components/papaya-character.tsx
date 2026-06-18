'use client'

import { motion } from 'framer-motion'

/**
 * RelapaCharacter — the ant conductor character.
 *
 * - idle: gentle sway.
 * - dancing: bouncy dance animation using the dancing image.
 * - freeze / frozen / gameover: switches to the frozen image (surprised pose).
 *
 * Uses framer-motion for animation since we're using raster images
 * instead of an animated SVG.
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

  // Use the frozen image when frozen/gameover, dancing image otherwise
  const imgSrc = isFrozen ? '/relapa-frozen.png' : '/relapa-dance.png'

  return (
    <motion.img
      src={imgSrc}
      alt="Relapa"
      className={`select-none drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)] ${className}`}
      style={{ maxWidth: '100%', maxHeight: '340px', height: 'auto', objectFit: 'contain' }}
      animate={
        isDancing && !isFrozen
          ? {
              y: [0, -18, 0, -10, 0],
              rotate: [-3, 4, -5, 3, -3],
              scaleX: [1, 0.96, 1.04, 0.98, 1],
            }
          : isFrozen
            ? { rotate: -1, scale: 1.02 }
            : { rotate: [0, -2, 2, -2, 0] }
      }
      transition={
        isDancing && !isFrozen
          ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' }
          : isFrozen
            ? { duration: 0.2 }
            : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
      }
    />
  )
}
