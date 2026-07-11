'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChuckyEngine } from '@/lib/music'
import { PapayaCharacter } from '@/components/papaya-character'
import {
  loadUnlocked,
  saveUnlocked,
  checkNewlyUnlocked,
  getAchievement,
  type AchievementStats,
} from '@/lib/achievements'
import { useTelegram } from '@/components/telegram-provider'
import {
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticSuccess,
  hapticError,
  hapticWarning,
  hapticSelection,
  shareToTelegram,
  showMainButton,
  hideMainButton,
} from '@/lib/telegram'
import {
  Hand,
  Trophy,
  Play,
  RotateCcw,
  Skull,
  Timer,
  Sparkles,
  Zap,
  AlertTriangle,
  Crown,
  Flame,
  Star,
  TrendingUp,
  PartyPopper,
  CalendarDays,
  Share2,
  Music2,
  Check,
  Users,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type GameState =
  | 'idle'
  | 'countdown'
  | 'dancing'
  | 'freeze'
  | 'frozen'
  | 'gameover'

type ScoreEntry = {
  id: string
  playerName: string
  score: number
  danceSeconds: number
  freezes: number
  rounds: number
  createdAt: string
}

type FailReason = 'early' | 'late' | null
type PlayerMode = 'solo' | 'duo'
type ArrowDirection = 'up' | 'down' | 'left' | 'right'

type ArrowEvent = {
  id: number
  direction: ArrowDirection
  spawnedAt: number
  hitWindow: number
}

type HitFeedback = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong' | null

type DuoPlayerState = {
  score: number
  combo: number
  bestCombo: number
  freezes: number
  perfectFreezes: number
  alive: boolean
  failReason: FailReason
  name: string
  arrowsHit: number
  arrowsMissed: number
  currentArrow: ArrowEvent | null
  frozenThisRound: boolean
  hitFeedback: HitFeedback
}

// ── Arrow helpers ──────────────────────────────────────────────────────────

const DIRECTIONS: ArrowDirection[] = ['up', 'down', 'left', 'right']

const DIR_ICON = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
}

const DIR_LABEL = { up: '↑', down: '↓', left: '←', right: '→' }

const DIR_COLOR = {
  up: 'text-emerald-400 border-emerald-400/60 bg-emerald-500/15',
  down: 'text-rose-400 border-rose-400/60 bg-rose-500/15',
  left: 'text-amber-400 border-amber-400/60 bg-amber-500/15',
  right: 'text-cyan-400 border-cyan-400/60 bg-cyan-500/15',
}

const DIR_BTN_ACTIVE = {
  up: 'bg-emerald-600/50 border-emerald-400',
  down: 'bg-rose-600/50 border-rose-400',
  left: 'bg-amber-600/50 border-amber-400',
  right: 'bg-cyan-600/50 border-cyan-400',
}

let _arrowId = 0
function nextArrowId() { return ++_arrowId }

// Arrow spawn interval (ms) — gets faster with rounds
function getArrowInterval(round: number): number {
  return Math.max(700, 1800 - (round - 1) * 120)
}

// Arrow hit window (ms) — gets tighter with rounds
function getArrowHitWindow(round: number): number {
  return Math.max(500, 1400 - (round - 1) * 100)
}

// ── Difficulty constants (freeze window) ───────────────────────────────────

const BASE_WINDOW = 2200
const MIN_WINDOW = 600
const WINDOW_SHRINK = 100

function getFreezeWindow(round: number): number {
  return Math.max(MIN_WINDOW, BASE_WINDOW - (round - 1) * WINDOW_SHRINK)
}

function randMusicDuration(round: number): number {
  const shrink = Math.min(1500, (round - 1) * 120)
  const musicMin = Math.max(2500, 4000 - shrink)
  const musicMax = Math.max(4500, 7500 - shrink)
  return musicMin + Math.random() * (musicMax - musicMin)
}

// ── Daily challenge seeded RNG ────────────────────────────────────────────

function getTodaySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dailyMusicDuration(round: number): number {
  const shrink = Math.min(1500, (round - 1) * 120)
  const musicMin = Math.max(2500, 4000 - shrink)
  const musicMax = Math.max(4500, 7500 - shrink)
  return musicMin + dailyRand() * (musicMax - musicMin)
}

let _dailyRand: (() => number) | null = null
function dailyRand(): number {
  if (!_dailyRand) _dailyRand = mulberry32(getTodaySeed())
  return _dailyRand()
}

// ── Player helpers ────────────────────────────────────────────────────────

function createInitialDuoPlayer(name: string): DuoPlayerState {
  return {
    score: 0,
    combo: 0,
    bestCombo: 0,
    freezes: 0,
    perfectFreezes: 0,
    alive: true,
    failReason: null,
    name,
    arrowsHit: 0,
    arrowsMissed: 0,
    currentArrow: null,
    frozenThisRound: false,
    hitFeedback: null,
  }
}

function getComboMult(combo: number): number {
  return Math.min(3, 1 + Math.floor(combo / 3) * 0.5)
}

// ── Main component ────────────────────────────────────────────────────────

export default function TelegramGame() {
  const { user, isTelegramApp } = useTelegram()

  // ── State ───────────────────────────────────────────────────────────────

  const [state, setState] = useState<GameState>('idle')
  const [danceSeconds, setDanceSeconds] = useState(0)
  const [round, setRound] = useState(1)
  const [failReason, setFailReason] = useState<FailReason>(null)
  const [freezeProgress, setFreezeProgress] = useState(1)
  const [lastSavedRank, setLastSavedRank] = useState<number | null>(null)
  const [savedThisRun, setSavedThisRun] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [dailyMode, setDailyMode] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [freezes, setFreezes] = useState(0)
  const [perfectFreezes, setPerfectFreezes] = useState(0)
  const [arrowsHit, setArrowsHit] = useState(0)
  const [arrowsMissed, setArrowsMissed] = useState(0)
  const [personalBest, setPersonalBest] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem('papaya-best-score')
      if (stored) {
        const n = parseInt(stored, 10)
        return Number.isNaN(n) ? null : n
      }
    } catch { /* ignore */ }
    return null
  })
  const [isNewBest, setIsNewBest] = useState(false)
  const [unlockedAch, setUnlockedAch] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    return loadUnlocked()
  })
  const [achToast, setAchToast] = useState<string | null>(null)
  const [achQueue, setAchQueue] = useState<string[]>([])
  const [countdown, setCountdown] = useState<number | null>(null)
  const [screenShake, setScreenShake] = useState(false)
  const [shared, setShared] = useState(false)

  // Solo arrow state
  const [currentArrow, setCurrentArrow] = useState<ArrowEvent | null>(null)
  const [hitFeedback, setHitFeedback] = useState<HitFeedback>(null)

  // ── Duo mode state ──────────────────────────────────────────────────────

  const [playerMode, setPlayerMode] = useState<PlayerMode>('solo')
  const [duoPlayers, setDuoPlayers] = useState<DuoPlayerState[]>([
    createInitialDuoPlayer('P1'),
    createInitialDuoPlayer('P2'),
  ])

  // ── Refs ────────────────────────────────────────────────────────────────

  const engineRef = useRef<ChuckyEngine | null>(null)
  const musicStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const freezeWindowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frozenResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const danceTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const freezeAnimRef = useRef<number | null>(null)
  const freezeStartRef = useRef<number>(0)
  const freezeWindowRef = useRef<number>(1500)
  const stateRef = useRef<GameState>('idle')
  const roundRef = useRef(1)
  const comboRef = useRef(0)
  const dailyModeRef = useRef(false)
  const soundOnRef = useRef(true)

  // Arrow refs
  const arrowSpawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const arrowTimeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentArrowRef = useRef<ArrowEvent | null>(null)
  const duoPlayersRef = useRef<DuoPlayerState[]>([
    createInitialDuoPlayer('P1'),
    createInitialDuoPlayer('P2'),
  ])
  const duoArrowTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([null, null])
  const duoSpawnTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([null, null])
  const freezeProgressRef = useRef(1)
  const danceSecondsRef = useRef(0)
  const playerModeRef = useRef<PlayerMode>('solo')
  const bestComboRef = useRef(0)
  useEffect(() => { bestComboRef.current = bestCombo }, [bestCombo])

  // ── Derived ─────────────────────────────────────────────────────────────

  const comboMultiplier = Math.min(3, 1 + Math.floor(combo / 3) * 0.5)
  const score = Math.floor(
    arrowsHit * 20 * comboMultiplier + freezes * 100 * comboMultiplier + Math.floor(danceSeconds * 0.5)
  )

  const playerName = user?.fullName || user?.username || 'Dancer'
  const isPlaying = state === 'dancing' || state === 'freeze' || state === 'frozen'
  const dancing = state === 'dancing'
  const showFreezeOverlay = state === 'freeze'
  const isCountdown = state === 'countdown'

  // ── Sync refs ───────────────────────────────────────────────────────────

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { roundRef.current = round }, [round])
  useEffect(() => { comboRef.current = combo }, [combo])
  useEffect(() => { dailyModeRef.current = dailyMode }, [dailyMode])
  useEffect(() => { playerModeRef.current = playerMode }, [playerMode])
  useEffect(() => { duoPlayersRef.current = duoPlayers }, [duoPlayers])
  useEffect(() => { freezeProgressRef.current = freezeProgress }, [freezeProgress])
  useEffect(() => { danceSecondsRef.current = danceSeconds }, [danceSeconds])
  useEffect(() => { currentArrowRef.current = currentArrow }, [currentArrow])

  // ── Achievements: check and queue ───────────────────────────────────────

  const checkAchievements = useCallback(
    (stats: AchievementStats) => {
      const newly = checkNewlyUnlocked(stats, unlockedAch)
      if (newly.length === 0) return
      const next = new Set(unlockedAch)
      for (const id of newly) next.add(id)
      setUnlockedAch(next)
      saveUnlocked(next)
      setAchQueue((q) => [...q, ...newly])
    },
    [unlockedAch]
  )

  // ── Achievement toast queue processor ───────────────────────────────────

  useEffect(() => {
    if (achToast || achQueue.length === 0) return
    const [first, ...rest] = achQueue
    queueMicrotask(() => {
      setAchQueue(rest)
      setAchToast(first)
    })
    if (!engineRef.current) {
      engineRef.current = new ChuckyEngine()
      engineRef.current.init().catch(() => {})
    }
    engineRef.current?.blip('achievement')
    const t = setTimeout(() => setAchToast(null), 2500)
    return () => clearTimeout(t)
  }, [achToast, achQueue])

  // ── Telegram Main Button management ─────────────────────────────────────

  const startGameRef = useRef<(daily?: boolean) => Promise<void>>(async () => {})

  const startGameFromMainButton = useCallback(() => {
    hapticSelection()
    startGameRef.current(dailyModeRef.current)
  }, [])

  useEffect(() => {
    if (state === 'idle') {
      showMainButton('Start Game 🎵', startGameFromMainButton)
    } else {
      hideMainButton()
    }
    return () => hideMainButton()
  }, [state, startGameFromMainButton])

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
      if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
      if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)
      if (danceTimer.current) clearInterval(danceTimer.current)
      if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
      if (arrowSpawnTimer.current) clearTimeout(arrowSpawnTimer.current)
      if (arrowTimeoutTimer.current) clearTimeout(arrowTimeoutTimer.current)
      for (const t of duoArrowTimers.current) if (t) clearTimeout(t)
      for (const t of duoSpawnTimers.current) if (t) clearTimeout(t)
      hideMainButton()
      engineRef.current?.dispose()
    }
  }, [])

  // ── Flash message ───────────────────────────────────────────────────────

  const showFlash = useCallback((msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 900)
  }, [])

  // ── Handler refs (avoid stale closures) ─────────────────────────────────

  const gameOverRef = useRef<(r: FailReason) => void>(() => {})
  const triggerFreezeRef = useRef<() => void>(() => {})
  const scheduleMusicStopRef = useRef<() => void>(() => {})
  const onAllFrozenRef = useRef<() => void>(() => {})
  const soloArrowTapRef = useRef<(dir: ArrowDirection) => void>(() => {})
  const duoArrowTapRef = useRef<(playerIdx: number, dir: ArrowDirection) => void>(() => {})
  const spawnSoloArrowRef = useRef<() => void>(() => {})
  const spawnDuoArrowRef = useRef<(i: number) => void>(() => {})
  const duoGameOverRef = useRef<() => void>(() => {})

  // ── Core timers ─────────────────────────────────────────────────────────

  const startDanceTimer = useCallback(() => {
    if (danceTimer.current) clearInterval(danceTimer.current)
    danceTimer.current = setInterval(() => {
      setDanceSeconds((s) => s + 0.1)
    }, 100)
  }, [])

  const stopDanceTimer = useCallback(() => {
    if (danceTimer.current) {
      clearInterval(danceTimer.current)
      danceTimer.current = null
    }
  }, [])

  // ── Clear all arrow timers ──────────────────────────────────────────────

  const clearAllArrowTimers = useCallback(() => {
    if (arrowSpawnTimer.current) { clearTimeout(arrowSpawnTimer.current); arrowSpawnTimer.current = null }
    if (arrowTimeoutTimer.current) { clearTimeout(arrowTimeoutTimer.current); arrowTimeoutTimer.current = null }
    for (let i = 0; i < 2; i++) {
      if (duoArrowTimers.current[i]) { clearTimeout(duoArrowTimers.current[i]!); duoArrowTimers.current[i] = null }
      if (duoSpawnTimers.current[i]) { clearTimeout(duoSpawnTimers.current[i]!); duoSpawnTimers.current[i] = null }
    }
  }, [])

  // ── Arrow spawning (solo) ───────────────────────────────────────────────

  const spawnSoloArrow = useCallback(() => {
    if (stateRef.current !== 'dancing') return
    const dir = DIRECTIONS[Math.floor(Math.random() * 4)]
    const win = getArrowHitWindow(roundRef.current)
    const arrow: ArrowEvent = { id: nextArrowId(), direction: dir, spawnedAt: performance.now(), hitWindow: win }
    setCurrentArrow(arrow)

    // Timeout: miss
    if (arrowTimeoutTimer.current) clearTimeout(arrowTimeoutTimer.current)
    arrowTimeoutTimer.current = setTimeout(() => {
      if (stateRef.current !== 'dancing') return
      const cur = currentArrowRef.current
      if (cur && cur.id === arrow.id) {
        // Missed!
        setCurrentArrow(null)
        setHitFeedback('miss')
        setCombo(0)
        setArrowsMissed(a => a + 1)
        hapticError()
        showFlash('Miss! ✗')
        setTimeout(() => setHitFeedback(null), 400)
        // Spawn next via ref to avoid circular dep
        arrowSpawnTimer.current = setTimeout(() => spawnSoloArrowRef.current(), 300)
      }
    }, win)
  }, [showFlash])

  // ── Arrow tap handler (solo) ────────────────────────────────────────────

  const handleSoloArrowTap = useCallback((dir: ArrowDirection) => {
    const s = stateRef.current

    // During freeze: any tap = game over
    if (s === 'freeze') {
      gameOverRef.current('early')
      return
    }

    if (s !== 'dancing') return

    const arrow = currentArrowRef.current
    if (!arrow) return

    hapticLight()

    // Clear timeout
    if (arrowTimeoutTimer.current) clearTimeout(arrowTimeoutTimer.current)

    const elapsed = performance.now() - arrow.spawnedAt
    const ratio = 1 - elapsed / arrow.hitWindow // 1=perfect, 0=late

    if (dir === arrow.direction) {
      // HIT!
      let feedback: HitFeedback = 'ok'
      let pts = 10
      if (ratio > 0.66) { feedback = 'perfect'; pts = 30 }
      else if (ratio > 0.33) { feedback = 'good'; pts = 20 }

      const newCombo = comboRef.current + 1
      const mult = getComboMult(newCombo)
      const totalPts = Math.floor(pts * mult)

      setCurrentArrow(null)
      setHitFeedback(feedback)
      setCombo(newCombo)
      if (newCombo > bestComboRef.current) setBestCombo(newCombo)
      setArrowsHit(a => a + 1)

      hapticSuccess()
      if (feedback === 'perfect') hapticHeavy()
      showFlash(`${feedback === 'perfect' ? 'PERFECT!' : feedback === 'good' ? 'Good!' : 'OK!'} +${totalPts}`)

      setTimeout(() => setHitFeedback(null), 400)

      // Spawn next arrow after short delay
      arrowSpawnTimer.current = setTimeout(() => spawnSoloArrowRef.current(), getArrowInterval(roundRef.current))
    } else {
      // WRONG direction
      setCurrentArrow(null)
      setHitFeedback('wrong')
      setCombo(0)
      hapticError()
      showFlash('Wrong! ✗')
      setTimeout(() => setHitFeedback(null), 400)
      // Spawn next after slightly longer delay
      arrowSpawnTimer.current = setTimeout(() => spawnSoloArrowRef.current(), 500)
    }
  }, [showFlash])

  // ── Arrow spawning (duo) ────────────────────────────────────────────────

  const spawnDuoArrow = useCallback((playerIdx: number) => {
    if (stateRef.current !== 'dancing') return
    const players = duoPlayersRef.current
    if (!players[playerIdx]?.alive) return

    const dir = DIRECTIONS[Math.floor(Math.random() * 4)]
    const win = getArrowHitWindow(roundRef.current)
    const arrow: ArrowEvent = { id: nextArrowId(), direction: dir, spawnedAt: performance.now(), hitWindow: win }

    setDuoPlayers(prev => prev.map((p, i) =>
      i === playerIdx ? { ...p, currentArrow: arrow, hitFeedback: null } : p
    ))

    // Timeout: miss
    if (duoArrowTimers.current[playerIdx]) clearTimeout(duoArrowTimers.current[playerIdx]!)
    duoArrowTimers.current[playerIdx] = setTimeout(() => {
      if (stateRef.current !== 'dancing') return
      const cur = duoPlayersRef.current[playerIdx]
      if (cur?.currentArrow?.id === arrow.id) {
        setDuoPlayers(prev => prev.map((p, i) =>
          i === playerIdx ? { ...p, currentArrow: null, hitFeedback: 'miss' as const, combo: 0, arrowsMissed: p.arrowsMissed + 1 } : p
        ))
        hapticError()
        setTimeout(() => {
          setDuoPlayers(prev => prev.map((p, i) => i === playerIdx ? { ...p, hitFeedback: null } : p))
        }, 400)
        duoSpawnTimers.current[playerIdx] = setTimeout(() => spawnDuoArrowRef.current(playerIdx), 300)
      }
    }, win)
  }, [])

  // ── Arrow tap handler (duo) ────────────────────────────────────────────

  const handleDuoArrowTap = useCallback((playerIdx: number, dir: ArrowDirection) => {
    const s = stateRef.current

    // During freeze: any tap = eliminate that player
    if (s === 'freeze') {
      const player = duoPlayersRef.current[playerIdx]
      if (!player?.alive) return
      hapticError()
      setScreenShake(true)
      setTimeout(() => setScreenShake(false), 300)
      setDuoPlayers(prev => prev.map((p, i) =>
        i === playerIdx ? { ...p, alive: false, failReason: 'early' as const, currentArrow: null } : p
      ))
      showFlash(`${player.name}: Can't stop! 💀`)
      // Check if all eliminated
      setTimeout(() => {
        const cur = duoPlayersRef.current
        if (cur.every(p => !p.alive)) duoGameOverRef.current()
      }, 100)
      return
    }

    if (s !== 'dancing') return

    const player = duoPlayersRef.current[playerIdx]
    if (!player?.alive || !player.currentArrow) return

    const arrow = player.currentArrow
    hapticLight()

    // Clear timeout
    if (duoArrowTimers.current[playerIdx]) clearTimeout(duoArrowTimers.current[playerIdx]!)

    const elapsed = performance.now() - arrow.spawnedAt
    const ratio = 1 - elapsed / arrow.hitWindow

    if (dir === arrow.direction) {
      let feedback: HitFeedback = 'ok'
      let pts = 10
      if (ratio > 0.66) { feedback = 'perfect'; pts = 30 }
      else if (ratio > 0.33) { feedback = 'good'; pts = 20 }

      const newCombo = player.combo + 1
      const mult = getComboMult(newCombo)
      const totalPts = Math.floor(pts * mult)

      setDuoPlayers(prev => prev.map((p, i) =>
        i === playerIdx ? {
          ...p,
          currentArrow: null,
          hitFeedback: feedback,
          combo: newCombo,
          bestCombo: Math.max(p.bestCombo, newCombo),
          score: p.score + totalPts,
          arrowsHit: p.arrowsHit + 1,
        } : p
      ))

      hapticSuccess()
      if (feedback === 'perfect') hapticHeavy()
      setTimeout(() => {
        setDuoPlayers(prev => prev.map((p, i) => i === playerIdx ? { ...p, hitFeedback: null } : p))
      }, 400)

      duoSpawnTimers.current[playerIdx] = setTimeout(() => spawnDuoArrowRef.current(playerIdx), getArrowInterval(roundRef.current))
    } else {
      setDuoPlayers(prev => prev.map((p, i) =>
        i === playerIdx ? { ...p, currentArrow: null, hitFeedback: 'wrong' as const, combo: 0 } : p
      ))
      hapticError()
      setTimeout(() => {
        setDuoPlayers(prev => prev.map((p, i) => i === playerIdx ? { ...p, hitFeedback: null } : p))
      }, 400)
      duoSpawnTimers.current[playerIdx] = setTimeout(() => spawnDuoArrowRef.current(playerIdx), 500)
    }
  }, [showFlash])

  // ── Game over (solo) ────────────────────────────────────────────────────

  const gameOver = useCallback(
    async (reason: FailReason) => {
      if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
      if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
      if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)
      if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
      clearAllArrowTimers()
      stopDanceTimer()
      engineRef.current?.stop()
      engineRef.current?.sting('fail')

      hapticError()
      setFailReason(reason)
      setState('gameover')
      setCurrentArrow(null)

      const currentArrowsHit = arrowsHit
      const currentArrowsMissed = arrowsMissed
      const currentCombo = combo
      const currentBestCombo = bestCombo
      const currentDanceSeconds = danceSeconds
      const currentFreezes = freezes
      const currentRound = round
      const currentPerfectFreezes = perfectFreezes

      const finalMult = Math.min(3, 1 + Math.floor(currentCombo / 3) * 0.5)
      const finalScore = Math.floor(
        currentArrowsHit * 20 * finalMult + currentFreezes * 100 * finalMult + Math.floor(currentDanceSeconds * 0.5)
      )

      if (!savedThisRun) {
        setSavedThisRun(true)

        try {
          const stored = localStorage.getItem('papaya-best-score')
          const prev = stored ? parseInt(stored, 10) : 0
          if (finalScore > prev) {
            localStorage.setItem('papaya-best-score', String(finalScore))
            setPersonalBest(finalScore)
            setIsNewBest(true)
          }
        } catch { /* ignore */ }

        try {
          const name = playerName.trim() || 'Anonymous'
          const res = await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerName: name,
              score: finalScore,
              danceSeconds: Math.floor(currentDanceSeconds),
              freezes: currentFreezes,
              rounds: currentRound - 1,
            }),
          })
          if (res.ok) {
            const data = await fetch('/api/leaderboard', { cache: 'no-store' }).then((r) => r.json())
            const scores = (data.scores as ScoreEntry[]) || []
            const idx = scores.findIndex((s) => s.score === finalScore && s.playerName === name)
            const rank = idx >= 0 ? idx + 1 : null
            setLastSavedRank(rank)
            if (rank !== null && rank <= 3) {
              setConfetti(true)
              setTimeout(() => setConfetti(false), 3200)
            }
          }
        } catch { /* ignore */ }

        checkAchievements({
          freezes: currentFreezes,
          combo: currentCombo,
          bestCombo: currentBestCombo,
          danceSeconds: Math.floor(currentDanceSeconds),
          round: currentRound,
          score: finalScore,
          perfectFreezes: currentPerfectFreezes,
        })
      }
    },
    [arrowsHit, arrowsMissed, combo, bestCombo, danceSeconds, freezes, round, perfectFreezes, savedThisRun, playerName, stopDanceTimer, clearAllArrowTimers, checkAchievements],
  )

  // ── Share score (solo) ──────────────────────────────────────────────────

  const shareScore = useCallback(() => {
    const text = `🥭 Relapa DDR: ${score} (Hits: ${arrowsHit}, Misses: ${arrowsMissed}, Freezes: ${freezes}, Combo: ${bestCombo})${lastSavedRank ? ` — #${lastSavedRank}!` : ''}`
    shareToTelegram(text)
    hapticSuccess()
    setShared(true)
    setTimeout(() => setShared(false), 2000)
  }, [score, arrowsHit, arrowsMissed, freezes, bestCombo, lastSavedRank])

  // ── Trigger freeze (music stops) ────────────────────────────────────────

  const triggerFreeze = useCallback(() => {
    setState('freeze')
    stopDanceTimer()
    clearAllArrowTimers()
    setCurrentArrow(null)
    setDuoPlayers(prev => prev.map(p => ({ ...p, currentArrow: null, hitFeedback: null })))
    engineRef.current?.stop()
    hapticHeavy()

    const win = getFreezeWindow(roundRef.current)
    freezeWindowRef.current = win
    freezeStartRef.current = performance.now()
    setFreezeProgress(1)

    setScreenShake(true)
    setTimeout(() => setScreenShake(false), 450)

    // Progress bar animation
    const animate = () => {
      const elapsed = performance.now() - freezeStartRef.current
      const remaining = Math.max(0, 1 - elapsed / win)
      setFreezeProgress(remaining)
      if (remaining > 0 && remaining < 0.3 && remaining > 0.25) hapticWarning()
      if (remaining > 0 && stateRef.current === 'freeze') {
        freezeAnimRef.current = requestAnimationFrame(animate)
      }
    }
    freezeAnimRef.current = requestAnimationFrame(animate)

    // When freeze window expires → success (survived!)
    freezeWindowTimer.current = setTimeout(() => {
      if (stateRef.current !== 'freeze') return
      if (playerModeRef.current === 'duo') {
        // Duo: eliminate anyone who didn't survive (tapped during freeze)
        // If they're still alive, they survived
        setDuoPlayers(prev => prev.map(p => {
          if (!p.alive) return p
          return { ...p, frozenThisRound: true }
        }))
        setTimeout(() => {
          const current = duoPlayersRef.current
          if (current.every(p => !p.alive)) {
            duoGameOverRef.current()
          } else {
            onAllFrozenRef.current()
          }
        }, 100)
      } else {
        // Solo: freeze success
        onAllFrozenRef.current()
      }
    }, win)
  }, [stopDanceTimer, clearAllArrowTimers])

  // ── Schedule music stop ─────────────────────────────────────────────────

  const scheduleMusicStop = useCallback(() => {
    if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
    const dur = dailyModeRef.current
      ? dailyMusicDuration(roundRef.current)
      : randMusicDuration(roundRef.current)
    musicStopTimer.current = setTimeout(() => {
      triggerFreezeRef.current()
    }, dur)
  }, [])

  // ── On freeze success (solo + duo shared) ───────────────────────────────

  const onAllFrozen = useCallback(() => {
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
    if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)

    setState('frozen')
    const newRound = roundRef.current + 1
    roundRef.current = newRound
    setRound(newRound)

    // Add freeze points
    const newCombo = comboRef.current + 1
    const mult = getComboMult(newCombo)
    const freezePoints = Math.floor(100 * mult)
    setFreezes(f => f + 1)
    setCombo(newCombo)
    if (newCombo > bestComboRef.current) setBestCombo(newCombo)

    // Duo: give freeze points to alive players
    if (playerModeRef.current === 'duo') {
      setDuoPlayers(prev => prev.map(p => {
        if (!p.alive) return p
        const pmult = getComboMult(p.combo + 1)
        return {
          ...p,
          freezes: p.freezes + 1,
          combo: p.combo + 1,
          bestCombo: Math.max(p.bestCombo, p.combo + 1),
          score: p.score + Math.floor(100 * pmult),
          frozenThisRound: false,
        }
      }))
    }

    if (soundOnRef.current) engineRef.current?.sting('success')
    hapticSuccess()
    showFlash(`FREEZE! +${freezePoints} 🔥${newCombo}`)

    // Resume after delay
    frozenResumeTimer.current = setTimeout(() => {
      if (stateRef.current !== 'frozen') return
      const pm = playerModeRef.current
      if (pm === 'duo') {
        const current = duoPlayersRef.current
        if (current.every(p => !p.alive)) { duoGameOverRef.current(); return }
      }
      setState('dancing')
      if (soundOnRef.current) engineRef.current?.start()
      startDanceTimer()
      scheduleMusicStopRef.current()

      // Resume arrow spawning
      if (pm === 'solo') {
        spawnSoloArrowRef.current()
      } else {
        const current = duoPlayersRef.current
        current.forEach((p, i) => { if (p.alive) spawnDuoArrowRef.current(i) })
      }
    }, 1300)
  }, [showFlash, startDanceTimer])

  // ── Duo game over ───────────────────────────────────────────────────────

  const duoGameOver = useCallback(async () => {
    if (stateRef.current === 'gameover') return
    if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
    clearAllArrowTimers()
    stopDanceTimer()
    engineRef.current?.stop()
    engineRef.current?.sting('fail')

    hapticHeavy()
    setState('gameover')

    const players = [...duoPlayersRef.current]
    for (const p of players) {
      try {
        const name = p.name.trim() || 'Anonymous'
        await fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: name,
            score: p.score,
            danceSeconds: Math.floor(danceSecondsRef.current),
            freezes: p.freezes,
            rounds: roundRef.current - 1,
          }),
        })
      } catch { /* ignore */ }
    }

    setConfetti(true)
    setTimeout(() => setConfetti(false), 3200)
  }, [stopDanceTimer, clearAllArrowTimers])

  // ── Sync handler refs ───────────────────────────────────────────────────

  useEffect(() => {
    gameOverRef.current = gameOver
    triggerFreezeRef.current = triggerFreeze
    scheduleMusicStopRef.current = scheduleMusicStop
    onAllFrozenRef.current = onAllFrozen
    soloArrowTapRef.current = handleSoloArrowTap
    duoArrowTapRef.current = handleDuoArrowTap
    spawnSoloArrowRef.current = spawnSoloArrow
    spawnDuoArrowRef.current = spawnDuoArrow
    duoGameOverRef.current = duoGameOver
  })

  // ── Begin dancing (after countdown) ─────────────────────────────────────

  const beginDancing = useCallback(async () => {
    setState('dancing')
    if (!engineRef.current) engineRef.current = new ChuckyEngine()
    await engineRef.current.init()
    engineRef.current.setVolume(0.5)
    await engineRef.current.start()
    startDanceTimer()
    scheduleMusicStop()

    // Start arrow spawning
    if (playerModeRef.current === 'solo') {
      setTimeout(() => spawnSoloArrowRef.current(), 500)
    } else {
      setTimeout(() => {
        duoPlayersRef.current.forEach((p, i) => { if (p.alive) spawnDuoArrowRef.current(i) })
      }, 500)
    }
  }, [startDanceTimer, scheduleMusicStop])

  // ── Start game ──────────────────────────────────────────────────────────

  const startGame = useCallback(
    async (daily = false) => {
      hapticMedium()
      setDailyMode(daily)
      _dailyRand = null
      _arrowId = 0
      setDanceSeconds(0)
      setRound(1)
      setFailReason(null)
      setSavedThisRun(false)
      setLastSavedRank(null)
      setFreezeProgress(1)
      setConfetti(false)
      setCombo(0)
      setBestCombo(0)
      setFreezes(0)
      setPerfectFreezes(0)
      setArrowsHit(0)
      setArrowsMissed(0)
      setIsNewBest(false)
      setShared(false)
      setCurrentArrow(null)
      setHitFeedback(null)

      if (playerModeRef.current === 'duo') {
        setDuoPlayers([createInitialDuoPlayer('P1'), createInitialDuoPlayer('P2')])
      }

      if (!engineRef.current) engineRef.current = new ChuckyEngine()
      await engineRef.current.init()

      setState('countdown')
      setCountdown(3)
      for (const n of [3, 2, 1]) {
        setCountdown(n)
        engineRef.current?.sting('success')
        await new Promise((r) => setTimeout(r, 750))
      }
      setCountdown(null)
      await beginDancing()
    },
    [beginDancing],
  )

  useEffect(() => { startGameRef.current = startGame }, [startGame])

  // ── Player colors ───────────────────────────────────────────────────────

  const p1Color = { main: '#fbbf24', ring: 'ring-amber-400/30', bg: 'bg-amber-500/10', text: 'text-amber-200', dim: 'text-amber-300/50', btn: 'border-amber-400' }
  const p2Color = { main: '#22d3ee', ring: 'ring-cyan-400/30', bg: 'bg-cyan-500/10', text: 'text-cyan-200', dim: 'text-cyan-300/50', btn: 'border-cyan-400' }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className={`relative flex h-dvh w-full flex-col overflow-hidden bg-[#1a1410] text-foreground ${screenShake ? 'screen-shake' : ''}`}
    >
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: "url('/relapa-stage.png')" }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#1a1410]/50 via-[#1a1410]/65 to-[#0e0a06]" />
      <div className="pointer-events-none absolute inset-0 spotlight-glow" />

      {/* Freeze flash */}
      <AnimatePresence>
        {showFreezeOverlay && (
          <motion.div key="freeze-flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0.2] }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="pointer-events-none absolute inset-0 z-30 bg-red-600/40 mix-blend-screen" />
        )}
      </AnimatePresence>

      {/* Countdown overlay */}
      <AnimatePresence>
        {isCountdown && countdown !== null && (
          <motion.div key="countdown-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <motion.div key={countdown} initial={{ scale: 0.3, opacity: 0, rotate: -180 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 2, opacity: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }} className="text-[120px] font-black text-amber-300 drop-shadow-[0_0_40px_rgba(251,191,36,0.6)]">
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confetti */}
      <AnimatePresence>{confetti && <ConfettiBurst />}</AnimatePresence>

      {/* Achievement toast */}
      <AchievementToast achId={achToast} />

      {/* ═══ TOP BAR ═══ */}
      <header className="relative z-10 safe-top flex items-center justify-between px-4 py-2.5 border-b border-amber-900/40 bg-black/40 backdrop-blur-sm">
        {playerMode === 'solo' ? (
          <>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-900/60 ring-1 ring-red-500/40">
                <Trophy className="h-4 w-4 text-red-300" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[9px] uppercase tracking-wider text-amber-300/60">Score</span>
                <span className="font-mono text-base font-black text-amber-200">{score}</span>
              </div>
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[9px] uppercase tracking-wider text-amber-300/60">Round</span>
              <span className="font-mono text-base font-black text-violet-300">{round}</span>
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[9px] uppercase tracking-wider text-amber-300/60">Combo</span>
              <div className="flex items-center gap-1">
                {combo >= 3 && <Flame className="h-3.5 w-3.5 animate-pulse text-orange-300" />}
                <span className={`font-mono text-base font-black ${combo >= 3 ? 'text-orange-200' : 'text-amber-300/70'}`}>
                  {comboMultiplier > 1 ? `×${comboMultiplier.toFixed(1)}` : '—'}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[9px] uppercase tracking-wider text-amber-300/60">Hits</span>
              <span className="font-mono text-base font-black text-emerald-300">{arrowsHit}</span>
            </div>
            {dailyMode && <Badge className="bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40 border-0 text-[9px] px-1.5 py-0"><CalendarDays className="mr-0.5 h-3 w-3" />Daily</Badge>}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[9px] uppercase tracking-wider text-amber-300/60">Round</span>
              <span className="font-mono text-base font-black text-violet-300">{round}</span>
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[9px] uppercase tracking-wider text-amber-300/60">Dance</span>
              <span className="font-mono text-base font-black text-emerald-300">{danceSeconds.toFixed(1)}s</span>
            </div>
            {dailyMode && <Badge className="bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40 border-0 text-[9px] px-1.5 py-0"><CalendarDays className="mr-0.5 h-3 w-3" />Daily</Badge>}
          </>
        )}
      </header>

      {/* ═══ CENTER ═══ */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-hidden">

        {/* Status banner */}
        <div className="relative z-10 mb-1 flex h-6 items-center justify-center">
          <AnimatePresence mode="wait">
            {dancing && (
              <motion.div key="dancing" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Music2 className="h-3.5 w-3.5 animate-pulse" />
                Tap the arrows!
              </motion.div>
            )}
            {showFreezeOverlay && (
              <motion.div key="freeze" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-1.5 text-sm font-black text-red-400">
                <AlertTriangle className="h-4 w-4 animate-ping" />
                DON&apos;T TAP!
              </motion.div>
            )}
            {state === 'frozen' && (
              <motion.div key="frozen" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="flex items-center gap-1.5 text-sm font-black text-emerald-300">
                <Zap className="h-4 w-4" />
                {playerMode === 'duo' ? 'Nice!' : 'Nice freeze!'}
              </motion.div>
            )}
            {state === 'gameover' && (
              <motion.div key="over" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-xs font-black text-red-400">
                <Skull className="h-3.5 w-3.5" />
                {failReason === 'early' ? (playerMode === 'solo' ? "Can't stop!" : 'Too early!') : 'Too slow!'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ═══ SOLO VIEW ═══ */}
        {playerMode === 'solo' && (
          <div className="relative flex h-36 w-full flex-col items-center justify-center gap-2">
            {/* Arrow display */}
            {(dancing || state === 'freeze') && (
              <ArrowDisplay arrow={showFreezeOverlay ? null : currentArrow} feedback={hitFeedback} />
            )}

            {/* Character (smaller, above buttons) */}
            <div className="relative h-20 w-20">
              <PapayaCharacter state={state} />
            </div>

            {dancing && <FloatingNotes />}

            {/* Ice effect */}
            <AnimatePresence>
              {(state === 'frozen' || state === 'gameover') && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="absolute h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ═══ DUO VIEW ═══ */}
        {playerMode === 'duo' && (
          <div className="relative flex h-36 w-full items-end justify-center gap-4 px-4">
            {dancing && <FloatingNotes />}
            {duoPlayers.map((player, i) => {
              const isP1 = i === 0
              const color = isP1 ? p1Color : p2Color
              const charState = player.alive ? state : 'gameover'

              return (
                <div key={player.name} className={`relative flex flex-1 flex-col items-center transition-opacity duration-300 ${!player.alive ? 'opacity-30' : ''}`}>
                  {!player.alive && <div className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-red-600/30" />}

                  <span className={`relative z-10 mb-0.5 text-xs font-black ${!player.alive ? 'line-through text-red-400' : color.text}`}>
                    {player.name}
                  </span>

                  <div className="relative z-10 mb-0.5 flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-amber-200">{player.score}</span>
                    {player.combo >= 3 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-300">
                        <Flame className="h-3 w-3 animate-pulse" />×{getComboMult(player.combo).toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Duo arrow display */}
                  {isPlaying && !showFreezeOverlay && (
                    <div className="relative z-10 mb-0.5">
                      <ArrowDisplay arrow={player.currentArrow} feedback={player.hitFeedback} />
                    </div>
                  )}

                  <motion.div className="relative h-16 w-16" initial={{ opacity: 0, y: 10, scale: 0.85 }} animate={{ opacity: player.alive ? 1 : 0.3, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
                    <PapayaCharacter state={charState} />
                  </motion.div>
                </div>
              )
            })}
          </div>
        )}

        {/* Flash message */}
        <div className="relative z-10 mt-1 flex h-5 items-center justify-center">
          <AnimatePresence>
            {flash && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-full bg-emerald-500/20 px-3 py-0.5 text-[11px] font-bold text-emerald-200 ring-1 ring-emerald-400/40">
                {flash}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ═══ IDLE STATE ═══ */}
        <AnimatePresence>
          {state === 'idle' && (
            <motion.div key="idle-controls" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="relative z-10 mt-2 flex w-full max-w-xs flex-col items-center gap-3 px-4">
              {/* Mode selector */}
              <div className="flex w-full rounded-lg bg-black/30 p-0.5 ring-1 ring-amber-900/40">
                <button type="button" onClick={() => { hapticSelection(); setPlayerMode('solo') }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-all ${playerMode === 'solo' ? 'bg-amber-700 text-amber-100 shadow-sm' : 'text-amber-300/50'}`}>
                  <Play className="h-3.5 w-3.5" /> Solo
                </button>
                <button type="button" onClick={() => { hapticSelection(); setPlayerMode('duo') }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-all ${playerMode === 'duo' ? 'bg-cyan-700 text-cyan-100 shadow-sm' : 'text-cyan-300/50'}`}>
                  <Users className="h-3.5 w-3.5" /> 2P Duel
                </button>
              </div>

              {playerMode === 'solo' ? (
                <>
                  <div className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-1.5 ring-1 ring-amber-900/40">
                    <span className="text-[10px] text-amber-300/60">Playing as</span>
                    <span className="text-sm font-bold text-amber-100">{playerName}</span>
                  </div>

                  <button type="button" onClick={() => { hapticSelection(); setDailyMode((v) => !v) }} className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold transition-all ${dailyMode ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40' : 'border-amber-900/40 bg-black/30 text-amber-300/60'}`}>
                    <CalendarDays className="h-4 w-4" /> Daily Challenge
                    {dailyMode && <Badge className="bg-cyan-500/30 text-cyan-100 border-0">on</Badge>}
                  </button>

                  <p className="text-center text-[11px] leading-snug text-amber-200/60">
                    Tap the matching arrow when it appears!
                    When music stops — DON&apos;T tap anything! 🎯
                  </p>

                  {personalBest !== null && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-300/50">
                      <TrendingUp className="h-3 w-3" /> Personal best: {personalBest}
                    </div>
                  )}

                  {!isTelegramApp && (
                    <Button onClick={() => startGame(dailyMode)} className={`w-full h-12 text-base font-black gap-2 ${dailyMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-amber-800 hover:bg-amber-700'}`}>
                      <Play className="h-5 w-5" /> Start Game
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <div className="flex w-full gap-2">
                    <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 ring-1 ring-amber-400/30">
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="text-xs font-bold text-amber-200">P1</span>
                    </div>
                    <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500/10 px-2 py-1.5 ring-1 ring-cyan-400/30">
                      <div className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                      <span className="text-xs font-bold text-cyan-200">P2</span>
                    </div>
                  </div>

                  <button type="button" onClick={() => { hapticSelection(); setDailyMode((v) => !v) }} className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold transition-all ${dailyMode ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40' : 'border-amber-900/40 bg-black/30 text-amber-300/60'}`}>
                    <CalendarDays className="h-4 w-4" /> Daily Challenge
                    {dailyMode && <Badge className="bg-cyan-500/30 text-cyan-100 border-0">on</Badge>}
                  </button>

                  <p className="text-center text-[11px] leading-snug text-amber-200/60">
                    Each player has their own arrows! When music stops — DON&apos;T tap! 🔥
                  </p>

                  {!isTelegramApp && (
                    <Button onClick={() => startGame(dailyMode)} className={`w-full h-12 text-base font-black gap-2 ${dailyMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-amber-800 hover:bg-amber-700'}`}>
                      <Play className="h-5 w-5" /> Start Duel
                    </Button>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ SOLO GAME OVER ═══ */}
        <AnimatePresence>
          {state === 'gameover' && playerMode === 'solo' && (
            <motion.div key="gameover-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="relative z-10 mt-1 flex w-full max-w-xs flex-col items-center gap-2.5 px-4">
              <AnimatePresence>
                {isNewBest && (
                  <motion.div initial={{ opacity: 0, scale: 0.6, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/30 to-orange-600/30 px-3 py-1 text-xs font-black text-amber-200 ring-2 ring-amber-400/60">
                    <Star className="h-3.5 w-3.5 animate-pulse fill-amber-300 text-amber-300" /> NEW PERSONAL BEST!
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid w-full grid-cols-4 gap-1.5">
                <div className="flex flex-col items-center rounded-lg bg-amber-500/10 px-2 py-1.5 ring-1 ring-amber-400/30">
                  <Trophy className="mb-0.5 h-3.5 w-3.5 text-amber-400" />
                  <span className="font-mono text-sm font-black text-amber-200">{score}</span>
                </div>
                <div className="flex flex-col items-center rounded-lg bg-emerald-500/10 px-2 py-1.5 ring-1 ring-emerald-400/30">
                  <Zap className="mb-0.5 h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-mono text-sm font-black text-emerald-200">{arrowsHit}</span>
                </div>
                <div className="flex flex-col items-center rounded-lg bg-red-500/10 px-2 py-1.5 ring-1 ring-red-400/30">
                  <X className="mb-0.5 h-3.5 w-3.5 text-red-400" />
                  <span className="font-mono text-sm font-black text-red-200">{arrowsMissed}</span>
                </div>
                <div className="flex flex-col items-center rounded-lg bg-orange-500/10 px-2 py-1.5 ring-1 ring-orange-400/30">
                  <Flame className="mb-0.5 h-3.5 w-3.5 text-orange-400" />
                  <span className="font-mono text-sm font-black text-orange-200">{bestCombo}</span>
                </div>
              </div>

              <div className="grid w-full grid-cols-2 gap-1.5">
                <div className="flex flex-col items-center rounded-lg bg-violet-500/10 px-2 py-1.5 ring-1 ring-violet-400/30">
                  <Hand className="mb-0.5 h-3.5 w-3.5 text-violet-400" />
                  <span className="font-mono text-sm font-black text-violet-200">{freezes}</span>
                  <span className="text-[8px] text-violet-300/60">freezes</span>
                </div>
                <div className="flex flex-col items-center rounded-lg bg-sky-500/10 px-2 py-1.5 ring-1 ring-sky-400/30">
                  <Timer className="mb-0.5 h-3.5 w-3.5 text-sky-400" />
                  <span className="font-mono text-sm font-black text-sky-200">{danceSeconds.toFixed(1)}s</span>
                </div>
              </div>

              {lastSavedRank && lastSavedRank <= 20 && (
                <Badge className="bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40 border-0 text-[10px]">
                  <Crown className="mr-1 h-3 w-3" />#{lastSavedRank} on leaderboard
                </Badge>
              )}
              {personalBest !== null && !isNewBest && (
                <Badge className="bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/30 border-0 text-[10px]">
                  <TrendingUp className="mr-1 h-3 w-3" />Best: {personalBest}
                </Badge>
              )}

              <div className="flex w-full gap-2">
                <Button onClick={() => startGame(dailyMode)} className={`flex-1 h-11 text-sm font-black ${dailyMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-amber-800 hover:bg-amber-700'}`}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Play Again
                </Button>
                <Button onClick={shareScore} variant="outline" className="h-11 border-amber-700/50 bg-amber-900/20 px-4 text-amber-200 hover:bg-amber-900/40 hover:text-amber-100">
                  {shared ? <Check className="h-4 w-4 text-emerald-300" /> : <Share2 className="h-4 w-4" />}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ DUO GAME OVER ═══ */}
        <AnimatePresence>
          {state === 'gameover' && playerMode === 'duo' && (
            <motion.div key="duo-gameover-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="relative z-10 mt-1 flex w-full max-w-xs flex-col items-center gap-2.5 px-4">
              {(() => {
                const p1 = duoPlayers[0], p2 = duoPlayers[1]
                const isDraw = p1.score === p2.score
                const winnerIdx = p1.score > p2.score ? 0 : 1
                return (
                  <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500/20 to-cyan-500/20 px-4 py-1.5 ring-1 ring-amber-400/40">
                    {isDraw ? (
                      <><Crown className="h-4 w-4 text-amber-300" /><span className="text-sm font-black text-amber-100">DRAW!</span></>
                    ) : (
                      <><Crown className="h-4 w-4 text-amber-300 animate-pulse" /><span className="text-sm font-black" style={{ color: winnerIdx === 0 ? '#fbbf24' : '#22d3ee' }}>{duoPlayers[winnerIdx].name} WINS!</span></>
                    )}
                  </div>
                )
              })()}

              <div className="flex w-full gap-2">
                {duoPlayers.map((player, i) => {
                  const isP1 = i === 0
                  const p1s = duoPlayers[0].score, p2s = duoPlayers[1].score
                  const isWinner = player.score > (isP1 ? p2s : p1s)
                  return (
                    <div key={player.name} className={`flex flex-1 flex-col items-center gap-1 rounded-xl p-2 ring-1 ${isP1 ? 'bg-amber-500/10 ring-amber-400/30' : 'bg-cyan-500/10 ring-cyan-400/30'}`}>
                      <div className="flex items-center gap-1">
                        {isWinner && <Crown className="h-3.5 w-3.5 text-amber-300" />}
                        <span className={`text-xs font-black ${!player.alive ? 'line-through text-red-400' : isP1 ? 'text-amber-200' : 'text-cyan-200'}`}>{player.name}</span>
                      </div>
                      {!player.alive && <span className="text-[9px] text-red-400/80">{player.failReason === 'early' ? 'Too early' : 'Too slow'}</span>}
                      <span className="font-mono text-lg font-black text-amber-200">{player.score}</span>
                      <div className="grid grid-cols-3 gap-0.5 w-full">
                        <div className="flex flex-col items-center rounded bg-black/20 px-0.5 py-0.5">
                          <Zap className="h-2.5 w-2.5 text-emerald-400" />
                          <span className="font-mono text-[10px] font-bold text-emerald-200">{player.arrowsHit}</span>
                        </div>
                        <div className="flex flex-col items-center rounded bg-black/20 px-0.5 py-0.5">
                          <Hand className="h-2.5 w-2.5 text-violet-400" />
                          <span className="font-mono text-[10px] font-bold text-violet-200">{player.freezes}</span>
                        </div>
                        <div className="flex flex-col items-center rounded bg-black/20 px-0.5 py-0.5">
                          <Flame className="h-2.5 w-2.5 text-orange-400" />
                          <span className="font-mono text-[10px] font-bold text-orange-200">{player.bestCombo}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Button onClick={() => startGame(dailyMode)} className={`w-full h-11 text-sm font-black ${dailyMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-amber-800 hover:bg-amber-700'}`}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> Play Again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ═══ BOTTOM: ARROW BUTTONS ═══ */}
      <div className="relative z-10 px-4 pb-4 pt-2 safe-bottom">
        <AnimatePresence mode="wait">
          {isPlaying && playerMode === 'solo' && (
            <motion.div key="solo-dpad-area" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex flex-col items-center gap-2">
              {/* Freeze progress bar */}
              <div className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-white/10">
                <AnimatePresence>
                  {showFreezeOverlay && (
                    <motion.div key="solo-progress-bar" initial={{ width: '100%' }} className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" style={{ width: `${freezeProgress * 100}%` }} />
                  )}
                </AnimatePresence>
              </div>

              {/* D-Pad */}
              <div className="grid grid-cols-3 grid-rows-3 gap-1">
                <DPadButton dir="up" onTap={() => soloArrowTapRef.current('up')} disabled={state === 'frozen' || state === 'countdown'} danger={showFreezeOverlay} />
                <DPadButton dir="left" onTap={() => soloArrowTapRef.current('left')} disabled={state === 'frozen' || state === 'countdown'} danger={showFreezeOverlay} />
                <DPadButton dir="right" onTap={() => soloArrowTapRef.current('right')} disabled={state === 'frozen' || state === 'countdown'} danger={showFreezeOverlay} />
                <DPadButton dir="down" onTap={() => soloArrowTapRef.current('down')} disabled={state === 'frozen' || state === 'countdown'} danger={showFreezeOverlay} />
              </div>

              {showFreezeOverlay && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-red-400 animate-pulse">
                  ⚠️ DON&apos;T TAP!
                </motion.div>
              )}
              {state === 'frozen' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-emerald-300">
                  ✓ Nice freeze! Get ready...
                </motion.div>
              )}
            </motion.div>
          )}

          {isPlaying && playerMode === 'duo' && (
            <motion.div key="duo-dpad-area" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex flex-col items-center gap-2">
              {/* Freeze progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <AnimatePresence>
                  {showFreezeOverlay && (
                    <motion.div key="duo-progress-bar" initial={{ width: '100%' }} className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" style={{ width: `${freezeProgress * 100}%` }} />
                  )}
                </AnimatePresence>
              </div>

              {/* Two side-by-side D-Pads */}
              <div className="flex w-full gap-3 justify-center">
                {duoPlayers.map((player, i) => {
                  const isP1 = i === 0
                  const isAlive = player.alive
                  const disabled = !isAlive || state === 'frozen' || state === 'countdown'

                  return (
                    <div key={player.name} className="flex flex-col items-center gap-1">
                      <span className={`text-[10px] font-bold ${isAlive ? (isP1 ? 'text-amber-300' : 'text-cyan-300') : 'text-gray-500 line-through'}`}>
                        {player.name}
                      </span>
                      <div className={`grid grid-cols-3 grid-rows-3 gap-1 ${!isAlive ? 'opacity-30' : ''}`}>
                        <DPadButton dir="up" size={44} onTap={() => duoArrowTapRef.current(i, 'up')} disabled={disabled} danger={showFreezeOverlay && isAlive} />
                        <DPadButton dir="left" size={44} onTap={() => duoArrowTapRef.current(i, 'left')} disabled={disabled} danger={showFreezeOverlay && isAlive} />
                        <DPadButton dir="right" size={44} onTap={() => duoArrowTapRef.current(i, 'right')} disabled={disabled} danger={showFreezeOverlay && isAlive} />
                        <DPadButton dir="down" size={44} onTap={() => duoArrowTapRef.current(i, 'down')} disabled={disabled} danger={showFreezeOverlay && isAlive} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {showFreezeOverlay && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-red-400 animate-pulse">
                  ⚠️ DON&apos;T TAP!
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function DPadButton({ dir, onTap, size = 48, disabled = false, danger = false }: {
  dir: ArrowDirection
  onTap: () => void
  size?: number
  disabled?: boolean
  danger?: boolean
}) {
  const Icon = DIR_ICON[dir]
  const posClass = {
    up: 'col-start-2 row-start-1',
    down: 'col-start-2 row-start-3',
    left: 'col-start-1 row-start-2',
    right: 'col-start-3 row-start-2',
  }[dir]

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); onTap() }}
      className={`${posClass} flex items-center justify-center rounded-xl border-2 transition-all active:scale-90 select-none ${
        danger
          ? 'border-red-500/50 bg-red-900/30 text-red-300/60'
          : disabled
            ? 'border-white/10 bg-white/5 text-white/20'
            : 'border-white/20 bg-white/10 text-white/80 active:border-white/40 active:bg-white/20'
      }`}
      style={{ width: size, height: size }}
      aria-label={dir}
    >
      <Icon className="w-5 h-5" />
    </button>
  )
}

function ArrowDisplay({ arrow, feedback, label }: {
  arrow: ArrowEvent | null
  feedback: HitFeedback
  label?: string
}) {
  if (!arrow) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-white/10">
        {label && <span className="text-[9px] text-white/20">{label}</span>}
      </div>
    )
  }

  const Icon = DIR_ICON[arrow.direction]
  const colorClass = DIR_COLOR[arrow.direction]

  const feedbackColor = {
    perfect: 'ring-emerald-400 bg-emerald-500/30 border-emerald-400',
    good: 'border-emerald-400 bg-emerald-500/15',
    ok: 'border-amber-400 bg-amber-500/15',
    miss: 'ring-red-400 bg-red-500/20 border-red-400',
    wrong: 'ring-orange-400 bg-orange-500/20 border-orange-400',
  }[feedback] || ''

  return (
    <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-all ${feedback ? feedbackColor : colorClass}`}>
      <Icon className="h-8 w-8" />
      {feedback === 'perfect' && <span className="absolute -top-2 -right-2 text-[10px] font-black text-emerald-300">PERFECT!</span>}
      {feedback === 'good' && <span className="absolute -top-2 -right-2 text-[10px] font-bold text-emerald-300">Good</span>}
      {feedback === 'miss' && <span className="absolute -top-2 -right-2 text-[10px] font-bold text-red-400">MISS</span>}
      {feedback === 'wrong' && <span className="absolute -top-2 -right-2 text-[10px] font-bold text-orange-400">WRONG</span>}
      {!feedback && <ArrowTimerRing arrow={arrow} />}
    </div>
  )
}

function ArrowTimerRing({ arrow }: { arrow: ArrowEvent }) {
  const [progress, setProgress] = useState(1)

  useEffect(() => {
    const startTime = performance.now()
    let raf: number
    const tick = () => {
      const elapsed = performance.now() - startTime
      setProgress(Math.max(0, 1 - elapsed / arrow.hitWindow))
      if (progress > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [arrow.id, arrow.hitWindow])

  const circumference = 2 * Math.PI * 28
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
      <circle cx="32" cy="32" r="28" fill="none" strokeWidth="2.5" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className={`transition-colors ${progress > 0.5 ? 'text-emerald-400' : progress > 0.25 ? 'text-amber-400' : 'text-red-400'}`} style={{ strokeDashoffset }} />
    </svg>
  )
}

function FloatingNotes() {
  const notes = ['♪', '♫', '♩', '♬', '🥭']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => {
        const left = 10 + ((i * 17 + 5) % 80)
        const delay = (i * 0.4) % 2
        const dur = 2.5 + (i * 0.3)
        return (
          <motion.span key={i} className="absolute bottom-10 text-sm text-amber-300/40" style={{ left: `${left}%` }} initial={{ y: 0, opacity: 0 }} animate={{ y: -120, opacity: [0, 1, 0] }} transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeOut' }}>
            {notes[i % notes.length]}
          </motion.span>
        )
      })}
    </div>
  )
}

function ConfettiBurst() {
  const colors = ['#fbbf24', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#22d3ee', '#4ade80']
  const pieces = Array.from({ length: 50 })
  return (
    <motion.div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <motion.div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-amber-500/20 px-4 py-1.5 text-base font-black text-amber-200 ring-2 ring-amber-400/50 backdrop-blur-sm" initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 14 }}>
        <PartyPopper className="mr-1.5 inline h-4 w-4" /> AWESOME!
      </motion.div>
      {pieces.map((_, i) => {
        const left = (i * 2.1 + Math.sin(i) * 15) % 100
        const color = colors[i % colors.length]
        const delay = (i * 0.008) % 0.4
        const dur = 1.8 + (i % 7) * 0.2
        const drift = Math.sin(i * 1.3) * 60
        const size = 5 + (i % 5) * 2
        const isCircle = i % 3 === 0
        return (
          <motion.span key={i} className="absolute top-0" style={{ left: `${left}%`, width: size, height: isCircle ? size : size * 0.5, backgroundColor: color, borderRadius: isCircle ? '50%' : '2px' }} initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }} animate={{ y: '110vh', x: drift, rotate: 720, opacity: [1, 1, 0.8, 0] }} transition={{ duration: dur, delay, ease: 'easeIn' }} />
        )
      })}
    </motion.div>
  )
}

function AchievementToast({ achId }: { achId: string | null }) {
  const ach = achId ? getAchievement(achId) : null
  if (!ach) return null
  return (
    <AnimatePresence>
      {ach && (
        <motion.div key={ach.id} initial={{ opacity: 0, y: -40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -40, scale: 0.9 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="pointer-events-none fixed left-1/2 top-12 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-900/90 to-orange-900/90 px-3.5 py-2 shadow-[0_0_30px_-5px_rgba(251,191,36,0.6)] backdrop-blur-sm">
            <motion.span className="text-xl" animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>{ach.icon}</motion.span>
            <div className="flex flex-col leading-tight">
              <span className="text-[8px] uppercase tracking-wider text-amber-300/70">Achievement!</span>
              <span className="text-xs font-black text-amber-100">{ach.title}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}