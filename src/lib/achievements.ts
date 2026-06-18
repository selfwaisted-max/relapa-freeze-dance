/**
 * Achievements / milestones for the freeze-dance game.
 *
 * Each achievement has a unique id, a check predicate (given the live stats),
 * and display metadata. Unlocked ids are persisted in localStorage.
 */

export type AchievementStats = {
  freezes: number
  combo: number
  bestCombo: number
  danceSeconds: number
  round: number
  score: number
}

export type Achievement = {
  id: string
  title: string
  desc: string
  icon: string // emoji
  check: (s: AchievementStats) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-freeze',
    title: 'Первый замри!',
    desc: 'Успешно замереть хоть раз',
    icon: '🥭',
    check: (s) => s.freezes >= 1,
  },
  {
    id: 'combo-3',
    title: 'Серия ×3',
    desc: 'Замереть 3 раза подряд',
    icon: '🔥',
    check: (s) => s.bestCombo >= 3,
  },
  {
    id: 'combo-5',
    title: 'Мастер комбо',
    desc: 'Замереть 5 раз подряд',
    icon: '⚡',
    check: (s) => s.bestCombo >= 5,
  },
  {
    id: 'combo-10',
    title: 'Несокрушимый',
    desc: 'Замереть 10 раз подряд',
    icon: '💎',
    check: (s) => s.bestCombo >= 10,
  },
  {
    id: 'dancer-30',
    title: 'Танцор',
    desc: 'Протанцевать 30 секунд за игру',
    icon: '💃',
    check: (s) => s.danceSeconds >= 30,
  },
  {
    id: 'dancer-60',
    title: 'Марафонец',
    desc: 'Протанцевать 60 секунд за игру',
    icon: '🏃',
    check: (s) => s.danceSeconds >= 60,
  },
  {
    id: 'round-5',
    title: 'Выносливый',
    desc: 'Дойти до 5-го раунда',
    icon: '⭐',
    check: (s) => s.round >= 5,
  },
  {
    id: 'round-10',
    title: 'Несгибаемый',
    desc: 'Дойти до 10-го раунда',
    icon: '🌟',
    check: (s) => s.round >= 10,
  },
  {
    id: 'score-500',
    title: 'Счёт 500',
    desc: 'Набрать 500 очков',
    icon: '🎯',
    check: (s) => s.score >= 500,
  },
  {
    id: 'score-1000',
    title: 'Счёт 1000',
    desc: 'Набрать 1000 очков',
    icon: '🏆',
    check: (s) => s.score >= 1000,
  },
]

const STORAGE_KEY = 'papaya-achievements'

export function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(arr)
  } catch {
    return new Set()
  }
}

export function saveUnlocked(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

/** Returns the list of achievement ids newly unlocked given the stats. */
export function checkNewlyUnlocked(
  stats: AchievementStats,
  alreadyUnlocked: Set<string>
): string[] {
  const newly: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (!alreadyUnlocked.has(a.id) && a.check(stats)) {
      newly.push(a.id)
    }
  }
  return newly
}

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}
