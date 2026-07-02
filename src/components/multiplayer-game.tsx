'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChuckyEngine } from '@/lib/music'
import { PapayaCharacter } from '@/components/papaya-character'
import {
  Music2,
  Hand,
  Trophy,
  Play,
  RotateCcw,
  Skull,
  Timer,
  Sparkles,
  Zap,
  AlertTriangle,
  Volume2,
  VolumeX,
  PartyPopper,
  Flame,
  Star,
  Pause,
  CalendarDays,
  Crown,
  Users,
  X,
  ChevronLeft,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GameState =
  | 'idle'
  | 'countdown'
  | 'dancing'
  | 'freeze'
  | 'frozen'
  | 'gameover'
  | 'paused'

type PlayerSlot = {
  name: string
  key: string // e.code
  keyLabel: string // "SPACE", "F", "J", "L"
  color: string // tailwind text/bg color class
  colorHex: string // for inline styles
  alive: boolean
  eliminatedReason: 'early' | 'late' | null
  score: number
  freezes: number
  combo: number
  bestCombo: number
  perfectFreezes: number
  bestFreezeTiming: number
  roundHistory: { timing: 'perfect' | 'good' | 'normal'; round: number }[]
  frozeThisRound: boolean
  flash: string | null
}

type RankedPlayer = {
  rank: number
  name: string
  score: number
  freezes: number
  bestCombo: number
  color: string
  colorHex: string
  eliminatedRound: number
}

// ---------------------------------------------------------------------------
// Constants — player definitions
// ---------------------------------------------------------------------------

const PLAYER_DEFS = [
  { key: 'Space', keyLabel: 'SPACE', color: 'text-amber-300', colorHex: '#fbbf24', bgClass: 'bg-amber-500', borderClass: 'border-amber-400/60', ringClass: 'ring-amber-400/50', badgeBg: 'bg-amber-500/20', badgeRing: 'ring-amber-400/40', name: 'Player 1' },
  { key: 'KeyF', keyLabel: 'F', color: 'text-cyan-300', colorHex: '#22d3ee', bgClass: 'bg-cyan-500', borderClass: 'border-cyan-400/60', ringClass: 'ring-cyan-400/50', badgeBg: 'bg-cyan-500/20', badgeRing: 'ring-cyan-400/40', name: 'Player 2' },
  { key: 'KeyJ', keyLabel: 'J', color: 'text-emerald-300', colorHex: '#4ade80', bgClass: 'bg-emerald-500', borderClass: 'border-emerald-400/60', ringClass: 'ring-emerald-400/50', badgeBg: 'bg-emerald-500/20', badgeRing: 'ring-emerald-400/40', name: 'Player 3' },
  { key: 'KeyL', keyLabel: 'L', color: 'text-rose-300', colorHex: '#fb7185', bgClass: 'bg-rose-500', borderClass: 'border-rose-400/60', ringClass: 'ring-rose-400/50', badgeBg: 'bg-rose-500/20', badgeRing: 'ring-rose-400/40', name: 'Player 4' },
]

// ---------------------------------------------------------------------------
// Difficulty — same formulas as solo
// ---------------------------------------------------------------------------

const BASE_WINDOW = 1800
const MIN_WINDOW = 500
const WINDOW_SHRINK = 120

function getFreezeWindow(round: number) {
  return Math.max(MIN_WINDOW, BASE_WINDOW - (round - 1) * WINDOW_SHRINK)
}

function randMusicDuration(round: number) {
  const shrink = Math.min(1500, (round - 1) * 120)
  const musicMin = Math.max(2500, 4000 - shrink)
  const musicMax = Math.max(4500, 7500 - shrink)
  return musicMin + Math.random() * (musicMax - musicMin)
}

// Daily challenge seeded RNG
function getTodaySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function mulberry32(seed: number) {
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

let _dailyRand: (() => number) | null = null
function dailyRand(): number {
  if (!_dailyRand) _dailyRand = mulberry32(getTodaySeed())
  return _dailyRand()
}

function dailyMusicDuration(round: number): number {
  const shrink = Math.min(1500, (round - 1) * 120)
  const musicMin = Math.max(2500, 4000 - shrink)
  const musicMax = Math.max(4500, 7500 - shrink)
  return musicMin + dailyRand() * (musicMax - musicMin)
}

// ---------------------------------------------------------------------------
// Helper: create initial player slot
// ---------------------------------------------------------------------------

function makeInitialPlayer(defIdx: number, nameOverride?: string): PlayerSlot {
  const def = PLAYER_DEFS[defIdx]
  return {
    name: nameOverride || def.name,
    key: def.key,
    keyLabel: def.keyLabel,
    color: def.color,
    colorHex: def.colorHex,
    alive: true,
    eliminatedReason: null,
    score: 0,
    freezes: 0,
    combo: 0,
    bestCombo: 0,
    perfectFreezes: 0,
    bestFreezeTiming: 0,
    roundHistory: [],
    frozeThisRound: false,
    flash: null,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MultiplayerGame({ onBack }: { onBack?: () => void } = {}) {
  // ---- setup state ----
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
  const [setupNames, setSetupNames] = useState<string[]>(['', ''])
  const [dailyMode, setDailyMode] = useState(false)

  // ---- game state ----
  const [state, setState] = useState<GameState>('idle')
  const [round, setRound] = useState(1)
  const [danceSeconds, setDanceSeconds] = useState(0)
  const [players, setPlayers] = useState<PlayerSlot[]>([])
  const [freezeProgress, setFreezeProgress] = useState(1) // 1 → 0
  const [screenShake, setScreenShake] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [pausedFrom, setPausedFrom] = useState<GameState | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [volume, setVolume] = useState(0.5)
  const [saved, setSaved] = useState(false)
  const [rankings, setRankings] = useState<RankedPlayer[]>([])

  // ---- refs (to avoid stale closures) ----
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
  const soundOnRef = useRef(true)
  const playersRef = useRef<PlayerSlot[]>([])
  const danceSecondsRef = useRef(0)
  const dailyModeRef = useRef(false)
  const volumeRef = useRef(0.5)

  // keep refs in sync
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { roundRef.current = round }, [round])
  useEffect(() => { soundOnRef.current = soundOn }, [soundOn])
  useEffect(() => { playersRef.current = players }, [players])
  useEffect(() => { danceSecondsRef.current = danceSeconds }, [danceSeconds])
  useEffect(() => { dailyModeRef.current = dailyMode }, [dailyMode])
  useEffect(() => { volumeRef.current = volume }, [volume])

  // load sound/volume prefs
  useEffect(() => {
    try {
      const s = localStorage.getItem('papaya-sound')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s === '0') setSoundOn(false)
      const v = localStorage.getItem('papaya-volume')
      if (v) { const n = parseFloat(v); if (!Number.isNaN(n)) setVolume(n) }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { try { localStorage.setItem('papaya-sound', soundOn ? '1' : '0') } catch { /* */ } }, [soundOn])
  useEffect(() => { try { localStorage.setItem('papaya-volume', String(volume)) } catch { /* */ } }, [volume])

  // ---- handler refs ----
  const triggerFreezeRef = useRef<() => void>(() => {})
  const scheduleMusicStopRef = useRef<() => void>(() => {})
  const endRoundRef = useRef<() => void>(() => {})
  const allEliminatedRef = useRef<() => void>(() => {})

  // ---- core timers ----
  const startDanceTimer = useCallback(() => {
    if (danceTimer.current) clearInterval(danceTimer.current)
    danceTimer.current = setInterval(() => {
      setDanceSeconds((s) => s + 0.1)
    }, 100)
  }, [])

  const stopDanceTimer = useCallback(() => {
    if (danceTimer.current) { clearInterval(danceTimer.current); danceTimer.current = null }
  }, [])

  // ---- blip helper ----
  const playBlip = (type: 'click' | 'toggle' = 'click') => {
    if (!soundOnRef.current) return
    if (!engineRef.current) { engineRef.current = new ChuckyEngine(); engineRef.current.init().catch(() => {}) }
    engineRef.current?.blip(type)
  }

  // ---- show flash on a player ----
  const showPlayerFlash = (idx: number, msg: string) => {
    setPlayers((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], flash: msg }
      return next
    })
    setTimeout(() => {
      setPlayers((prev) => {
        const next = [...prev]
        if (next[idx]) next[idx] = { ...next[idx], flash: null }
        return next
      })
    }, 1000)
  }

  // ---- eliminate a player ----
  const eliminatePlayer = useCallback((idx: number, reason: 'early' | 'late') => {
    setPlayers((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], alive: false, eliminatedReason: reason }
      return next
    })
  }, [])

  // ---- handle a player pressing their freeze key ----
  const handlePlayerFreeze = useCallback((playerIdx: number) => {
    const s = stateRef.current
    const ps = playersRef.current
    if (!ps[playerIdx] || !ps[playerIdx].alive) return

    if (s === 'dancing') {
      // too early — eliminate immediately
      eliminatePlayer(playerIdx, 'early')
      if (soundOnRef.current) engineRef.current?.sting('fail')
      // check if all eliminated
      const allDead = playersRef.current.every((p, i) => i === playerIdx ? false : !p.alive)
      if (allDead) {
        // short delay then game over
        setTimeout(() => allEliminatedRef.current(), 600)
      }
      return
    }

    if (s === 'freeze') {
      // successful freeze — record timing
      const elapsed = performance.now() - freezeStartRef.current
      const progress = Math.max(0, 1 - elapsed / freezeWindowRef.current)
      const isPerfect = progress > 0.66
      const isGood = progress > 0.33 && !isPerfect
      const bonusMult = isPerfect ? 1.5 : isGood ? 1.2 : 1

      setPlayers((prev) => {
        const next = [...prev]
        const p = { ...next[playerIdx] }
        p.frozeThisRound = true
        p.freezes += 1
        p.combo += 1
        p.bestCombo = Math.max(p.bestCombo, p.combo)
        if (isPerfect) p.perfectFreezes += 1
        if (progress > p.bestFreezeTiming) p.bestFreezeTiming = progress
        const mult = Math.min(3, 1 + Math.floor(p.combo / 3) * 0.5)
        const roundScore = Math.floor(100 * mult * bonusMult)
        p.score += roundScore
        p.roundHistory = [
          ...p.roundHistory,
          { timing: isPerfect ? 'perfect' : isGood ? 'good' : 'normal', round: roundRef.current },
        ]
        next[playerIdx] = p

        // show flash
        const timingLabel = isPerfect ? ' PERFECT!' : isGood ? ' Good!' : ''
        const multLabel = mult > 1 ? ` ×${mult.toFixed(1)}` : ''
        showPlayerFlash(playerIdx, `Freeze! +${roundScore}${multLabel} 🔥${p.combo}${timingLabel}`)

        return next
      })

      // check if all alive players have frozen
      setTimeout(() => {
        const currentPlayers = playersRef.current
        const alivePlayers = currentPlayers.filter((p) => p.alive)
        const allFrozen = alivePlayers.every((p) => p.frozeThisRound)
        if (allFrozen && stateRef.current === 'freeze') {
          endRoundRef.current()
        }
      }, 50)
    }
    // ignore in other states
  }, [eliminatePlayer])

  const handlePlayerFreezeRef = useRef(handlePlayerFreeze)
  useEffect(() => { handlePlayerFreezeRef.current = handlePlayerFreeze }, [handlePlayerFreeze])

  // ---- start game with countdown ----
  const beginDancing = useCallback(async () => {
    setState('dancing')
    if (soundOnRef.current) {
      if (!engineRef.current) engineRef.current = new ChuckyEngine()
      await engineRef.current.init()
      engineRef.current.setVolume(volumeRef.current)
      await engineRef.current.start()
    }
    startDanceTimer()
    scheduleMusicStopRef.current()
  }, [startDanceTimer])

  const startGame = useCallback(async (daily = false) => {
    setDailyMode(daily)
    // init audio
    if (!engineRef.current) engineRef.current = new ChuckyEngine()
    await engineRef.current.init()

    // build players
    const ps: PlayerSlot[] = []
    for (let i = 0; i < playerCount; i++) {
      ps.push(makeInitialPlayer(i, setupNames[i] || undefined))
    }
    setPlayers(ps)
    playersRef.current = ps

    // reset state
    setRound(1)
    setDanceSeconds(0)
    setFreezeProgress(1)
    setConfetti(false)
    setSaved(false)
    setRankings([])
    setPausedFrom(null)

    // countdown
    setState('countdown')
    setCountdown(3)
    for (const n of [3, 2, 1]) {
      setCountdown(n)
      if (soundOnRef.current) engineRef.current?.sting('success')
      await new Promise((r) => setTimeout(r, 750))
    }
    setCountdown(null)
    await beginDancing()
  }, [playerCount, setupNames, beginDancing])

  const startGameRef = useRef(startGame)
  useEffect(() => { startGameRef.current = startGame }, [startGame])

  // ---- trigger freeze: music stops, window starts ----
  const triggerFreeze = useCallback(() => {
    const currentPlayers = playersRef.current
    if (!currentPlayers.some((p) => p.alive)) return

    setState('freeze')
    stopDanceTimer()
    engineRef.current?.stop()
    const win = getFreezeWindow(roundRef.current)
    freezeWindowRef.current = win
    freezeStartRef.current = performance.now()
    setFreezeProgress(1)
    setScreenShake(true)
    setTimeout(() => setScreenShake(false), 450)

    // reset per-round flags
    setPlayers((prev) => prev.map((p) => ({ ...p, frozeThisRound: false })))

    const animate = () => {
      const elapsed = performance.now() - freezeStartRef.current
      const remaining = Math.max(0, 1 - elapsed / win)
      setFreezeProgress(remaining)
      if (remaining > 0 && stateRef.current === 'freeze') {
        freezeAnimRef.current = requestAnimationFrame(animate)
      }
    }
    freezeAnimRef.current = requestAnimationFrame(animate)

    // window expires — eliminate anyone who didn't freeze
    freezeWindowTimer.current = setTimeout(() => {
      if (stateRef.current !== 'freeze') return
      const current = playersRef.current
      let anyAlive = false
      let eliminated = false
      current.forEach((p, i) => {
        if (p.alive && !p.frozeThisRound) {
          eliminated = true
          eliminatePlayer(i, 'late')
          showPlayerFlash(i, 'Too slow!')
        }
        if (current[i]?.alive) anyAlive = true // re-check after elimination
      })
      if (eliminated && soundOnRef.current) engineRef.current?.sting('fail')

      // check again after state updates propagate
      setTimeout(() => {
        const updated = playersRef.current
        const stillAlive = updated.some((p) => p.alive)
        if (!stillAlive) {
          allEliminatedRef.current()
        } else if (stateRef.current === 'freeze') {
          // some survived — end the round
          endRoundRef.current()
        }
      }, 100)
    }, win)
  }, [stopDanceTimer, eliminatePlayer])

  // ---- end round: brief frozen state then resume ----
  const endRound = useCallback(() => {
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)

    // reset combos for eliminated players
    setPlayers((prev) =>
      prev.map((p) => {
        if (!p.alive && !p.frozeThisRound) {
          // was just eliminated this round, reset combo
          return { ...p, combo: 0 }
        }
        return p
      })
    )

    // check if anyone is alive
    const alive = playersRef.current.filter((p) => p.alive)
    if (alive.length === 0) {
      allEliminatedRef.current()
      return
    }

    // play success sting
    if (soundOnRef.current) engineRef.current?.sting('success')

    // check milestone confetti (every 5 freezes by any player)
    let triggerConfetti = false
    setPlayers((prev) => {
      const next = prev.map((p) => {
        if (p.alive && p.frozeThisRound && p.freezes > 0 && p.freezes % 5 === 0) {
          triggerConfetti = true
        }
        return p
      })
      return next
    })
    if (triggerConfetti) {
      setConfetti(true)
      setTimeout(() => setConfetti(false), 2600)
    }

    setState('frozen')
    setRound((r) => r + 1)

    frozenResumeTimer.current = setTimeout(() => {
      // double-check still alive
      const stillAlive = playersRef.current.some((p) => p.alive)
      if (!stillAlive) {
        allEliminatedRef.current()
        return
      }
      setState('dancing')
      if (soundOnRef.current) engineRef.current?.start()
      startDanceTimer()
      scheduleMusicStopRef.current()
    }, 1300)
  }, [startDanceTimer])

  // ---- schedule next music stop ----
  const scheduleMusicStop = useCallback(() => {
    if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
    const dur = dailyModeRef.current
      ? dailyMusicDuration(roundRef.current)
      : randMusicDuration(roundRef.current)
    musicStopTimer.current = setTimeout(() => {
      triggerFreezeRef.current()
    }, dur)
  }, [])

  // ---- all eliminated → game over ----
  const allEliminated = useCallback(async () => {
    if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
    stopDanceTimer()
    engineRef.current?.stop()

    setState('gameover')

    // compute final scores (with combo multiplier + dance seconds)
    const finalPlayers = playersRef.current.map((p) => {
      const mult = Math.min(3, 1 + Math.floor(p.combo / 3) * 0.5)
      const ds = Math.floor(danceSecondsRef.current)
      // add dance seconds to each player's final score
      return { ...p, score: p.score + ds }
    })

    // build rankings sorted by score desc
    const ranked: RankedPlayer[] = finalPlayers
      .map((p, i) => ({
        rank: 0,
        name: p.name || PLAYER_DEFS[i].name,
        score: p.score,
        freezes: p.freezes,
        bestCombo: p.bestCombo,
        color: PLAYER_DEFS[i].color,
        colorHex: PLAYER_DEFS[i].colorHex,
        eliminatedRound: p.eliminatedReason ? roundRef.current - 1 : roundRef.current,
      }))
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 }))

    setRankings(ranked)
    setConfetti(true)
    setTimeout(() => setConfetti(false), 3200)

    // save all scores to leaderboard
    if (!saved) {
      setSaved(true)
      for (const p of ranked) {
        try {
          await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerName: p.name,
              score: p.score,
              danceSeconds: Math.floor(danceSecondsRef.current),
              freezes: p.freezes,
              rounds: roundRef.current - 1,
            }),
          })
        } catch { /* ignore */ }
      }
    }
  }, [stopDanceTimer, saved])

  // keep handler refs in sync
  useEffect(() => {
    triggerFreezeRef.current = triggerFreeze
    scheduleMusicStopRef.current = scheduleMusicStop
    endRoundRef.current = endRound
    allEliminatedRef.current = allEliminated
  })

  // ---- pause / resume ----
  const togglePause = () => {
    const s = stateRef.current
    if (s === 'dancing' || s === 'freeze' || s === 'frozen') {
      setPausedFrom(s)
      setState('paused')
      stopDanceTimer()
      if (musicStopTimer.current) { clearTimeout(musicStopTimer.current); musicStopTimer.current = null }
      if (freezeWindowTimer.current) { clearTimeout(freezeWindowTimer.current); freezeWindowTimer.current = null }
      if (frozenResumeTimer.current) { clearTimeout(frozenResumeTimer.current); frozenResumeTimer.current = null }
      if (freezeAnimRef.current) { cancelAnimationFrame(freezeAnimRef.current); freezeAnimRef.current = null }
      engineRef.current?.stop()
    } else if (s === 'paused' && pausedFrom) {
      const from = pausedFrom
      setState(from)
      setPausedFrom(null)
      if (from === 'dancing') {
        if (soundOnRef.current) { engineRef.current?.setVolume(volumeRef.current); engineRef.current?.start() }
        startDanceTimer()
        scheduleMusicStop()
      }
      if (from === 'freeze' || from === 'frozen') {
        setState('dancing')
        if (soundOnRef.current) engineRef.current?.start()
        startDanceTimer()
        scheduleMusicStop()
      }
    }
  }
  const togglePauseRef = useRef(togglePause)
  useEffect(() => { togglePauseRef.current = togglePause })

  // ---- toggle sound ----
  const toggleSound = async () => {
    const next = !soundOn
    setSoundOn(next)
    if (!next) { engineRef.current?.stop() }
    else if (state === 'dancing') {
      if (!engineRef.current) engineRef.current = new ChuckyEngine()
      await engineRef.current.init()
      engineRef.current.setVolume(volume)
      await engineRef.current.start()
    }
  }

  const changeVolume = (v: number) => {
    setVolume(v)
    engineRef.current?.setVolume(v)
  }

  // ---- key handler ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Pause / resume
      if (e.code === 'KeyP' || e.code === 'Escape') {
        const s = stateRef.current
        if (['dancing', 'freeze', 'frozen', 'paused'].includes(s)) {
          e.preventDefault()
          togglePauseRef.current()
          return
        }
      }
      // Idle shortcuts
      if (stateRef.current === 'idle') {
        if (e.code === 'KeyD') {
          setDailyMode((v) => !v)
          playBlip('toggle')
          return
        }
        if (e.code === 'Enter') {
          startGameRef.current(dailyModeRef.current)
          return
        }
      }
      // Player freeze keys
      const playerKeys = ['Space', 'KeyF', 'KeyJ', 'KeyL']
      const idx = playerKeys.indexOf(e.code)
      if (idx === -1) return
      e.preventDefault()
      handlePlayerFreezeRef.current(idx)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- cleanup on unmount ----
  useEffect(() => {
    return () => {
      if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
      if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
      if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)
      if (danceTimer.current) clearInterval(danceTimer.current)
      if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
      engineRef.current?.dispose()
    }
  }, [])

  // ---- derived state ----
  const isPlaying = state === 'dancing' || state === 'freeze' || state === 'frozen'
  const dancing = state === 'dancing'
  const showFreezeOverlay = state === 'freeze'
  const isPaused = state === 'paused'
  const isCountdown = state === 'countdown'
  const isGameOver = state === 'gameover'
  const aliveCount = players.filter((p) => p.alive).length

  // character state per player
  function charState(p: PlayerSlot): 'idle' | 'dancing' | 'freeze' | 'frozen' | 'gameover' {
    if (isGameOver) return 'gameover'
    if (!p.alive) return 'frozen'
    if (state === 'freeze') return 'freeze'
    if (state === 'frozen' && p.frozeThisRound) return 'frozen'
    if (state === 'dancing') return 'dancing'
    if (state === 'countdown') return 'idle'
    return 'idle'
  }

  // ---- back to menu ----
  const backToMenu = () => {
    if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)
    if (danceTimer.current) clearInterval(danceTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
    engineRef.current?.stop()
    if (onBack) {
      onBack()
      return
    }
    setState('idle')
    setPlayers([])
    setRankings([])
    setSaved(false)
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#1a1410] text-foreground ${
        screenShake ? 'screen-shake' : ''
      }`}
    >
      {/* atmospheric background */}
      <div className="pointer-events-none fixed inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: "url('/relapa-stage.png')" }} />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#1a1410]/50 via-[#1a1410]/65 to-[#0e0a06]" />
      <div className="pointer-events-none fixed inset-0 spotlight-glow" />

      {/* freeze vignette */}
      <AnimatePresence>
        {showFreezeOverlay && (
          <div className="pointer-events-none fixed inset-0 z-30 freeze-vignette" />
        )}
      </AnimatePresence>

      {/* red flash on freeze */}
      <AnimatePresence>
        {showFreezeOverlay && (
          <motion.div
            key="freeze-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0.2] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none fixed inset-0 z-30 bg-red-600/40 mix-blend-screen"
          />
        )}
      </AnimatePresence>

      {/* countdown overlay */}
      <AnimatePresence>
        {isCountdown && countdown !== null && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.3, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 2, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="text-[140px] font-black text-amber-300 drop-shadow-[0_0_40px_rgba(251,191,36,0.6)]"
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* confetti */}
      <AnimatePresence>
        {confetti && <ConfettiBurst />}
      </AnimatePresence>

      {/* pause overlay */}
      <AnimatePresence>
        {isPaused && (
          <motion.div
            key="pause-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 10 }}
              className="flex flex-col items-center gap-4 rounded-2xl border border-amber-900/50 bg-[#1a1410] px-10 py-8 text-center shadow-2xl"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-900/50 ring-2 ring-red-500/40">
                <Pause className="h-7 w-7 text-red-300" />
              </div>
              <h2 className="text-xl font-black text-amber-200">PAUSED</h2>
              <p className="max-w-xs text-xs text-amber-300/70">
                Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-amber-200">P</kbd> or{' '}
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-amber-200">Esc</kbd> to resume.
              </p>
              <Button onClick={togglePause} className="bg-amber-800 hover:bg-amber-700">
                <Play className="mr-1 h-4 w-4" /> Resume
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== HEADER ===== */}
      <header className="relative z-10 border-b border-amber-900/40 bg-black/30 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {state !== 'idle' ? (
              <button
                type="button"
                onClick={backToMenu}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-900/50 bg-black/30 text-amber-200 transition-colors hover:bg-amber-900/40"
                title="Back to menu"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/60 ring-2 ring-red-500/40">
              <Skull className="h-5 w-5 text-red-300" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-amber-200 sm:text-xl">
                RELAPA
              </h1>
              <p className="text-[11px] text-amber-300/70">Multiplayer Freeze Dance</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPlaying && (
              <>
                <StatChip icon={<Timer className="h-4 w-4" />} label="Danced" value={danceSeconds.toFixed(1) + 's'} tone="amber" />
                <StatChip icon={<Sparkles className="h-4 w-4" />} label="Round" value={String(round)} tone="violet" />
                <StatChip icon={<Users className="h-4 w-4" />} label="Alive" value={`${aliveCount}/${playerCount}`} tone="emerald" />
                <AnimatePresence>
                  {dailyMode && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-cyan-500/30 to-blue-700/20 px-3 py-1.5 ring-1 ring-cyan-400/50"
                    >
                      <CalendarDays className="h-4 w-4 text-cyan-300" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-cyan-200">Challenge</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute' : 'Unmute'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-900/50 bg-black/30 text-amber-200 transition-colors hover:bg-amber-900/40 hover:text-white"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-red-400/60" />}
            </button>
            {soundOn && (
              <input
                type="range" min={0} max={1} step={0.05} value={volume}
                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                aria-label="Volume"
                className="vol-slider h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-amber-900/50 sm:w-20"
              />
            )}
            {isPlaying && (
              <button
                type="button"
                onClick={togglePause}
                aria-label="Pause"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-900/50 bg-black/30 text-amber-200 transition-colors hover:bg-amber-900/40 hover:text-white"
              >
                <Pause className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        {/* ===== SETUP SCREEN ===== */}
        {state === 'idle' && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex max-w-lg flex-col items-center gap-6"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-900/60 ring-2 ring-red-500/40">
              <Users className="h-8 w-8 text-amber-300" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-black text-amber-200">Multiplayer Setup</h2>
              <p className="mt-1 text-sm text-amber-300/70">2–4 players on the same keyboard</p>
            </div>

            {/* player count selector */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300/60">Players</span>
              <div className="flex gap-2">
                {([2, 3, 4] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setPlayerCount(n)
                      setSetupNames((prev) => {
                        const next = [...prev]
                        while (next.length < n) next.push('')
                        return next.slice(0, n)
                      })
                      playBlip('click')
                    }}
                    className={`flex h-12 w-14 items-center justify-center rounded-xl border-2 text-lg font-black transition-all ${
                      playerCount === n
                        ? 'border-amber-400 bg-amber-600/30 text-amber-200 ring-2 ring-amber-400/40'
                        : 'border-amber-900/50 bg-black/30 text-amber-300/50 hover:border-amber-700/60 hover:bg-amber-900/20'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* player name inputs */}
            <div className="flex w-full flex-col gap-3">
              {Array.from({ length: playerCount }).map((_, i) => {
                const def = PLAYER_DEFS[i]
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-3 rounded-xl border border-amber-900/40 bg-black/30 px-4 py-3"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black"
                      style={{ backgroundColor: def.colorHex + '25', color: def.colorHex, border: `1px solid ${def.colorHex}50` }}
                    >
                      {def.keyLabel}
                    </div>
                    <Input
                      value={setupNames[i] || ''}
                      onChange={(e) => {
                        const next = [...setupNames]
                        next[i] = e.target.value
                        setSetupNames(next)
                      }}
                      placeholder={def.name}
                      maxLength={16}
                      className="border-amber-900/50 bg-black/30 text-amber-100 placeholder:text-amber-300/40"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') startGame(dailyMode)
                      }}
                    />
                    <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: def.colorHex }}
                    />
                  </motion.div>
                )
              })}
            </div>

            {/* daily challenge toggle */}
            <button
              type="button"
              onClick={() => { setDailyMode((v) => !v); playBlip('toggle') }}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                dailyMode
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                  : 'border-amber-900/40 bg-black/30 text-amber-300/60 hover:bg-amber-900/20'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Daily Challenge
              {dailyMode && <Badge className="bg-cyan-500/30 text-cyan-100">on</Badge>}
            </button>

            {/* start button */}
            <Button
              onClick={() => startGame(dailyMode)}
              className={`h-14 w-full text-base font-bold ${dailyMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-amber-800 hover:bg-amber-700'}`}
            >
              <Play className="mr-2 h-5 w-5" /> Start Game
            </Button>

            <p className="max-w-sm text-center text-xs text-amber-300/50">
              Each player presses their own key when the music stops. Press too early and you&apos;re out!
            </p>
          </motion.div>
        )}

        {/* ===== GAME STAGE ===== */}
        {state !== 'idle' && !isGameOver && (
          <section className="relative mx-auto flex min-h-[520px] max-w-5xl flex-col items-center overflow-hidden rounded-2xl border border-amber-900/40 bg-gradient-to-b from-[#3a2820]/70 to-[#2a1a12]/80 p-4 pt-5 shadow-[0_0_60px_-15px_rgba(217,160,23,0.4)]">
            {/* stage curtains */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-red-900/70 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-50" style={{
              backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent 16px, rgba(127,29,29,0.7) 16px, rgba(127,29,29,0.7) 20px)',
            }} />
            <div className="pointer-events-none absolute -left-10 top-0 h-full w-40 rotate-12 bg-gradient-to-r from-amber-400/15 to-transparent blur-2xl" />
            <div className="pointer-events-none absolute -right-10 top-0 h-full w-40 -rotate-12 bg-gradient-to-l from-amber-400/15 to-transparent blur-2xl" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-24 rounded-t-full bg-gradient-to-t from-amber-400/15 to-transparent blur-xl" />

            {/* dust motes */}
            <DustMotes />

            {/* equalizer */}
            <AnimatePresence>
              {(dancing || (soundOn && isPlaying)) && (
                <motion.div
                  key="eq"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="absolute right-4 top-4 z-10"
                >
                  <Equalizer active={dancing} muted={!soundOn} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* status banner */}
            <div className="relative z-10 mb-3 flex h-7 items-center justify-center">
              <AnimatePresence mode="wait">
                {dancing && (
                  <motion.div
                    key="dancing"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-2 text-sm font-semibold text-amber-300"
                  >
                    <Music2 className="h-4 w-4 animate-pulse" />
                    Relapa is conducting — get ready!
                  </motion.div>
                )}
                {showFreezeOverlay && (
                  <motion.div
                    key="freeze"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2 text-base font-black text-red-400"
                  >
                    <AlertTriangle className="h-5 w-5 animate-ping" />
                    FREEZE! Press your key!
                  </motion.div>
                )}
                {state === 'frozen' && (
                  <motion.div
                    key="frozen"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    className="flex items-center gap-2 text-base font-black text-emerald-300"
                  >
                    <Zap className="h-5 w-5" />
                    {aliveCount === playerCount ? 'Everyone froze!' : `${aliveCount} still standing!`}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* freeze progress bar (shared) */}
            <div className="relative z-10 mb-4 h-2 w-48 overflow-hidden rounded-full bg-white/10">
              <AnimatePresence>
                {showFreezeOverlay && (
                  <motion.div
                    key="bar"
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"
                    style={{ width: `${freezeProgress * 100}%` }}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* floating notes while dancing */}
            {dancing && <FloatingNotes />}

            {/* ===== PLAYERS ROW ===== */}
            <div className="relative z-10 flex w-full flex-1 items-end justify-center gap-3 sm:gap-6">
              {players.map((p, i) => {
                const def = PLAYER_DEFS[i]
                const cs = charState(p)
                const isElim = !p.alive
                const mult = Math.min(3, 1 + Math.floor(p.combo / 3) * 0.5)

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{
                      opacity: isElim ? 0.3 : 1,
                      y: 0,
                      scale: 1,
                    }}
                    transition={{ type: 'spring', stiffness: 200, damping: 18, delay: i * 0.1 }}
                    className="flex w-[120px] flex-col items-center gap-1 sm:w-[160px]"
                  >
                    {/* Player name + key label */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold ${isElim ? 'line-through opacity-60' : p.color}`}
                        style={isElim ? undefined : { color: def.colorHex }}
                      >
                        {p.name || def.name}
                      </span>
                      <kbd
                        className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200/80"
                        style={{ borderColor: def.colorHex + '40', borderWidth: 1 }}
                      >
                        {def.keyLabel}
                      </kbd>
                    </div>

                    {/* score + combo */}
                    <div className="flex items-center gap-2 text-center">
                      <span className="font-mono text-sm font-black text-amber-200">{p.score}</span>
                      {p.combo >= 3 && (
                        <span className="flex items-center gap-0.5 rounded-md bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-300">
                          <Flame className="h-2.5 w-2.5" />×{mult.toFixed(1)}
                        </span>
                      )}
                    </div>

                    {/* Character */}
                    <div className="relative h-[160px] w-[130px] sm:h-[200px] sm:w-[160px]">
                      {/* shadow */}
                      <motion.div
                        className="absolute bottom-2 left-1/2 h-3 w-20 -translate-x-1/2 rounded-[50%] bg-black/30 blur-md"
                        animate={
                          dancing && p.alive
                            ? { scaleX: [1, 1.3, 0.8, 1.1, 1], opacity: [0.5, 0.35, 0.6, 0.4, 0.5] }
                            : { scaleX: 1, opacity: isElim ? 0.2 : 0.5 }
                        }
                        transition={dancing && p.alive ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                      />

                      {/* glow when combo >= 5 */}
                      {p.combo >= 5 && p.alive && (
                        <div
                          className="absolute inset-0 rounded-full blur-xl"
                          style={{ backgroundColor: def.colorHex + '15' }}
                        />
                      )}

                      <PapayaCharacter state={cs} className={isElim ? 'opacity-30' : ''} />

                      {/* Eliminated X overlay */}
                      {isElim && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <X
                            className="h-16 w-16 text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                            strokeWidth={4}
                          />
                        </motion.div>
                      )}

                      {/* Ice effect for frozen (successfully) */}
                      <AnimatePresence>
                        {(cs === 'frozen' || cs === 'gameover') && !isElim && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="pointer-events-none absolute inset-0 flex items-center justify-center"
                          >
                            <div className="absolute bottom-4 h-[160px] w-[160px] rounded-full bg-cyan-300/10 blur-2xl" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Per-player freeze flash */}
                    <div className="flex h-6 items-center justify-center">
                      <AnimatePresence>
                        {p.flash && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold ring-1"
                            style={{
                              backgroundColor: def.colorHex + '20',
                              color: def.colorHex,
                              borderColor: def.colorHex + '40',
                            }}
                          >
                            {p.flash}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* elimination reason */}
                    {isElim && p.eliminatedReason && (
                      <span className="text-[10px] font-semibold text-red-400/70">
                        {p.eliminatedReason === 'early' ? '⚠ Too early!' : '⏰ Too slow!'}
                      </span>
                    )}

                    {/* Stats line for alive players */}
                    {p.alive && (
                      <div className="flex items-center gap-2 text-[10px] text-amber-300/50">
                        <span>🥶 {p.freezes}</span>
                        {p.bestCombo > 1 && <span>🔥{p.bestCombo}</span>}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </section>
        )}

        {/* ===== MOBILE TOUCH BUTTONS ===== */}
        {isPlaying && (
          <div className="mx-auto mt-4 grid max-w-5xl gap-2 sm:hidden"
            style={{ gridTemplateColumns: `repeat(${playerCount}, 1fr)` }}
          >
            {players.map((p, i) => {
              const def = PLAYER_DEFS[i]
              if (!p.alive) return null
              return (
                <button
                  key={i}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    handlePlayerFreezeRef.current(i)
                  }}
                  className={`flex h-16 select-none items-center justify-center gap-2 rounded-xl border-2 text-sm font-black transition-all active:scale-95 ${
                    showFreezeOverlay
                      ? 'animate-pulse border-white/50 text-white shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                      : dancing
                        ? 'border-amber-800/50 bg-black/30 text-amber-200 hover:border-red-500/60'
                        : 'border-slate-600/50 bg-black/30 text-slate-300'
                  }`}
                  style={{
                    backgroundColor: showFreezeOverlay ? def.colorHex + '30' : undefined,
                    borderColor: showFreezeOverlay ? def.colorHex + '80' : undefined,
                  }}
                >
                  <Hand className="h-5 w-5" />
                  <span style={{ color: def.colorHex }}>{def.keyLabel}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ===== GAME OVER SCREEN ===== */}
        {isGameOver && rankings.length > 0 && (
          <motion.div
            key="gameover"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex max-w-xl flex-col items-center gap-5"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-900/60 ring-2 ring-red-500/40"
              >
                <Crown className="h-8 w-8 text-amber-300" />
              </motion.div>
              <h2 className="text-2xl font-black text-amber-200">GAME OVER</h2>
              <p className="mt-1 text-sm text-amber-300/70">
                Round {round - 1} · {Math.floor(danceSeconds)}s danced
              </p>
            </div>

            {/* Rankings */}
            <Card className="w-full border-amber-900/40 bg-black/30 backdrop-blur-sm">
              <div className="border-b border-amber-900/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-200">FINAL RANKINGS</h3>
                </div>
              </div>
              <div className="p-3">
                <ul className="flex flex-col gap-2">
                  {rankings.map((r) => {
                    const isWinner = r.rank === 1
                    return (
                      <motion.li
                        key={r.name}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (r.rank - 1) * 0.15 }}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                          isWinner
                            ? 'bg-amber-500/15 ring-1 ring-amber-400/30'
                            : 'bg-white/5'
                        }`}
                      >
                        {/* rank badge */}
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                            r.rank === 1
                              ? 'bg-amber-400 text-amber-950'
                              : r.rank === 2
                                ? 'bg-slate-300 text-slate-900'
                                : r.rank === 3
                                  ? 'bg-orange-600 text-orange-50'
                                  : 'bg-white/10 text-amber-200/70'
                          }`}
                        >
                          {r.rank}
                        </span>
                        {/* player info */}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold" style={{ color: r.colorHex }}>
                              {r.name}
                            </span>
                            {isWinner && <Crown className="h-4 w-4 shrink-0 fill-amber-300 text-amber-300" />}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-amber-300/60">
                            <span>🥶 {r.freezes} freezes</span>
                            <span>·</span>
                            <span>🔥 Best combo: {r.bestCombo}</span>
                          </div>
                        </div>
                        {/* score */}
                        <span className="shrink-0 font-mono text-lg font-black text-amber-200">
                          {r.score}
                        </span>
                      </motion.li>
                    )
                  })}
                </ul>
              </div>
            </Card>

            {/* Actions */}
            <div className="flex w-full gap-2">
              <Button
                onClick={() => startGame(dailyMode)}
                className={`flex-1 ${dailyMode ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-amber-800 hover:bg-amber-700'}`}
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Play Again
              </Button>
              <Button
                onClick={backToMenu}
                variant="outline"
                className="border-amber-700/50 bg-amber-900/20 text-amber-200 hover:bg-amber-900/40 hover:text-amber-100"
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Menu
              </Button>
            </div>
          </motion.div>
        )}
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 mt-auto border-t border-amber-900/40 bg-black/30 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3 text-xs text-amber-300/60">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row sm:text-left">
            <span>🥭 Relapa multiplayer — local freeze dance battle!</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Music2 className="h-3 w-3" /> Shared music</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-amber-900/20 pt-2 text-center text-[10px] text-amber-300/40">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-amber-200">SPACE</kbd> P1
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-amber-200">F</kbd> P2
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-amber-200">J</kbd> P3
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-amber-200">L</kbd> P4
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-amber-200">P</kbd>/
              <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-amber-200">Esc</kbd> pause
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-amber-200">D</kbd> challenge
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ===========================================================================
// Sub-components (reused from solo, adapted for multiplayer)
// ===========================================================================

function StatChip({
  icon, label, value, tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'amber' | 'emerald' | 'violet' | 'rose'
}) {
  const tones: Record<string, string> = {
    amber: 'from-amber-500/20 to-amber-700/10 text-amber-200 ring-amber-400/30',
    emerald: 'from-emerald-500/20 to-emerald-700/10 text-emerald-200 ring-emerald-400/30',
    violet: 'from-violet-500/20 to-violet-700/10 text-violet-200 ring-violet-400/30',
    rose: 'from-rose-500/20 to-rose-700/10 text-rose-200 ring-rose-400/30',
  }
  return (
    <div className={`flex items-center gap-2 rounded-xl bg-gradient-to-b ${tones[tone]} px-3 py-1.5 ring-1 backdrop-blur-sm`}>
      <span className="h-4 w-4">{icon}</span>
      <div className="flex flex-col leading-none">
        <span className="text-[9px] uppercase tracking-wider opacity-70">{label}</span>
        <span className="font-mono text-sm font-bold">{value}</span>
      </div>
    </div>
  )
}

function FloatingNotes() {
  const notes = ['♪', '♫', '♩', '♬', '🥭']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => {
        const left = 10 + Math.random() * 80
        const delay = Math.random() * 2
        const dur = 2.5 + Math.random() * 2
        const sym = notes[i % notes.length]
        return (
          <motion.span
            key={i}
            className="absolute bottom-16 text-lg text-amber-300/50"
            style={{ left: `${left}%` }}
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: -160, opacity: [0, 1, 0] }}
            transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeOut' }}
          >
            {sym}
          </motion.span>
        )
      })}
    </div>
  )
}

function ConfettiBurst() {
  const colors = ['#fbbf24', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#22d3ee', '#4ade80']
  const pieces = Array.from({ length: 60 })
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-amber-500/20 px-5 py-2 text-lg font-black text-amber-200 ring-2 ring-amber-400/50 backdrop-blur-sm"
        initial={{ scale: 0, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 14 }}
      >
        <PartyPopper className="mr-2 inline h-5 w-5" />
        BATTLE OVER!
      </motion.div>
      {pieces.map((_, i) => {
        const left = Math.random() * 100
        const color = colors[i % colors.length]
        const delay = Math.random() * 0.4
        const dur = 1.8 + Math.random() * 1.4
        const drift = (Math.random() - 0.5) * 120
        const size = 6 + Math.random() * 8
        const isCircle = i % 3 === 0
        return (
          <motion.span
            key={i}
            className="absolute top-0"
            style={{
              left: `${left}%`,
              width: size,
              height: isCircle ? size : size * 0.5,
              backgroundColor: color,
              borderRadius: isCircle ? '50%' : '2px',
            }}
            initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: '110vh', x: drift, rotate: 720, opacity: [1, 1, 0.8, 0] }}
            transition={{ duration: dur, delay, ease: 'easeIn' }}
          />
        )
      })}
    </motion.div>
  )
}

function Equalizer({ active, muted }: { active: boolean; muted: boolean }) {
  const bars = [0, 1, 2, 3, 4]
  return (
    <div
      className={`flex h-8 items-end gap-0.5 rounded-md bg-black/30 px-1.5 py-1 ring-1 ring-amber-900/40 ${muted ? 'opacity-50' : ''}`}
      aria-hidden="true"
    >
      {bars.map((b) => (
        <motion.span
          key={b}
          className="w-1 rounded-full bg-gradient-to-t from-amber-600 to-amber-300"
          animate={active ? { height: [6, 20, 10, 24, 8] } : { height: 4 }}
          transition={{ duration: 0.5 + b * 0.08, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay: b * 0.05 }}
          style={{ height: 4 }}
        />
      ))}
    </div>
  )
}

function DustMotes() {
  const motes = Array.from({ length: 14 })
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {motes.map((_, i) => {
        const left = Math.random() * 100
        const top = 10 + Math.random() * 80
        const size = 1 + Math.random() * 2.5
        const dur = 6 + Math.random() * 6
        const delay = Math.random() * 6
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-amber-200/30"
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
            animate={{ y: [0, -24, 0], x: [0, 8, 0], opacity: [0, 0.6, 0] }}
            transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        )
      })}
    </div>
  )
}