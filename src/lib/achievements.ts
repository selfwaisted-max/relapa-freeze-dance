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
  perfectFreezes?: number
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
    title: 'First Freeze!',
    desc: 'Successfully freeze once',
    icon: '🥭',
    check: (s) => s.freezes >= 1,
  },
  {
    id: 'combo-3',
    title: 'Streak ×3',
    desc: 'Freeze 3 times in a row',
    icon: '🔥',
    check: (s) => s.bestCombo >= 3,
  },
  {
    id: 'combo-5',
    title: 'Combo Master',
    desc: 'Freeze 5 times in a row',
    icon: '⚡',
    check: (s) => s.bestCombo >= 5,
  },
  {
    id: 'combo-10',
    title: 'Unstoppable',
    desc: 'Freeze 10 times in a row',
    icon: '💎',
    check: (s) => s.bestCombo >= 10,
  },
  {
    id: 'dancer-30',
    title: 'Dancer',
    desc: 'Dance for 30 seconds in one game',
    icon: '💃',
    check: (s) => s.danceSeconds >= 30,
  },
  {
    id: 'dancer-60',
    title: 'Marathoner',
    desc: 'Dance for 60 seconds in one game',
    icon: '🏃',
    check: (s) => s.danceSeconds >= 60,
  },
  {
    id: 'round-5',
    title: 'Enduring',
    desc: 'Reach round 5',
    icon: '⭐',
    check: (s) => s.round >= 5,
  },
  {
    id: 'round-10',
    title: 'Unbreakable',
    desc: 'Reach round 10',
    icon: '🌟',
    check: (s) => s.round >= 10,
  },
  {
    id: 'score-500',
    title: 'Score 500',
    desc: 'Score 500 points',
    icon: '🎯',
    check: (s) => s.score >= 500,
  },
  {
    id: 'score-1000',
    title: 'Score 1000',
    desc: 'Score 1000 points',
    icon: '🏆',
    check: (s) => s.score >= 1000,
  },
  {
    id: 'perfect-5',
    title: 'Sniper',
    desc: '5 perfect freezes (PERFECT!)',
    icon: '🎯',
    check: (s) => (s.perfectFreezes ?? 0) >= 5,
  },
  {
    id: 'score-2000',
    title: 'Legend',
    desc: 'Score 2000 points',
    icon: '👑',
    check: (s) => s.score >= 2000,
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
