'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ChuckyEngine } from '@/lib/music'
import { PapayaCharacter, SKINS, type Skin } from '@/components/papaya-character'
import {
  ACHIEVEMENTS,
  loadUnlocked,
  saveUnlocked,
  checkNewlyUnlocked,
  getAchievement,
  type AchievementStats,
} from '@/lib/achievements'
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
  Crown,
  Volume2,
  VolumeX,
  PartyPopper,
  Flame,
  Star,
  TrendingUp,
  Pause,
  Medal,
  X,
  Share2,
  Check,
} from 'lucide-react'

type GameState =
  | 'idle'
  | 'countdown'
  | 'dancing'
  | 'freeze'
  | 'frozen'
  | 'gameover'
  | 'paused'

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
type Difficulty = 'easy' | 'normal' | 'hard'

// Difficulty presets: freeze reaction window (ms) per round-tier + music duration range.
const DIFFICULTY_PRESETS: Record<
  Difficulty,
  { baseWindow: number; minWindow: number; musicMin: number; musicMax: number; label: string }
> = {
  easy: { baseWindow: 1900, minWindow: 1200, musicMin: 4000, musicMax: 7500, label: 'Лёгкий' },
  normal: { baseWindow: 1500, minWindow: 850, musicMin: 3000, musicMax: 6500, label: 'Обычный' },
  hard: { baseWindow: 1100, minWindow: 600, musicMin: 2500, musicMax: 5500, label: 'Сложный' },
}

// Reaction window shrinks with rounds, clamped to the difficulty's min.
function getFreezeWindow(round: number, diff: Difficulty) {
  const { baseWindow, minWindow } = DIFFICULTY_PRESETS[diff]
  const shrink = Math.floor((round - 1) / 2) * 150
  return Math.max(minWindow, baseWindow - shrink)
}

function randMusicDuration(diff: Difficulty) {
  const { musicMin, musicMax } = DIFFICULTY_PRESETS[diff]
  return musicMin + Math.random() * (musicMax - musicMin)
}

export default function PapayaGame() {
  const [state, setState] = useState<GameState>('idle')
  const [playerName, setPlayerName] = useState('')
  const [danceSeconds, setDanceSeconds] = useState(0)
  const [freezes, setFreezes] = useState(0)
  const [round, setRound] = useState(1)
  const [failReason, setFailReason] = useState<FailReason>(null)
  const [freezeProgress, setFreezeProgress] = useState(1) // 1 -> 0
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([])
  const [lastSavedRank, setLastSavedRank] = useState<number | null>(null)
  const [savedThisRun, setSavedThisRun] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [volume, setVolume] = useState(0.5)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [skin, setSkin] = useState<Skin>('papaya')
  const [confetti, setConfetti] = useState(false)
  const [combo, setCombo] = useState(0) // consecutive freezes (resets on miss/early)
  const [bestCombo, setBestCombo] = useState(0) // best combo this run
  const [perfectFreezes, setPerfectFreezes] = useState(0) // ideal-timing freezes this run
  const [triedSkins, setTriedSkins] = useState<Set<Skin>>(new Set(['papaya']))
  const [personalBest, setPersonalBest] = useState<number | null>(null)
  const [isNewBest, setIsNewBest] = useState(false)
  const [unlockedAch, setUnlockedAch] = useState<Set<string>>(new Set())
  const [achToast, setAchToast] = useState<string | null>(null) // currently shown achievement toast
  const [achQueue, setAchQueue] = useState<string[]>([]) // queue of achievement ids to show
  const [showAchPanel, setShowAchPanel] = useState(false) // achievements modal
  const [pausedFrom, setPausedFrom] = useState<GameState | null>(null) // state before pause
  const [showTutorial, setShowTutorial] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null) // 3,2,1 or null
  const [screenShake, setScreenShake] = useState(false)
  const [sessionStats, setSessionStats] = useState({
    games: 0,
    totalFreezes: 0,
    totalDanceSeconds: 0,
  })
  const [shared, setShared] = useState(false) // share feedback

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
  const difficultyRef = useRef<Difficulty>('normal')
  const soundOnRef = useRef<boolean>(true)
  const comboRef = useRef(0)

  // keep refs in sync for use inside timers / listeners
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    roundRef.current = round
  }, [round])
  useEffect(() => {
    difficultyRef.current = difficulty
  }, [difficulty])
  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])
  useEffect(() => {
    comboRef.current = combo
  }, [combo])

  // Load personal best + achievements + tutorial-seen + session stats from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('papaya-best-score')
      if (stored) {
        const n = parseInt(stored, 10)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!Number.isNaN(n)) setPersonalBest(n)
      }
      setUnlockedAch(loadUnlocked())
      const seen = localStorage.getItem('papaya-tutorial-seen')
      if (!seen) {
        setShowTutorial(true)
      }
      const stats = localStorage.getItem('papaya-session-stats')
      if (stats) {
        const parsed = JSON.parse(stats)
        if (parsed && typeof parsed === 'object') setSessionStats(parsed)
      }
      const savedSkin = localStorage.getItem('papaya-skin')
      if (savedSkin) {
        setSkin(savedSkin as Skin)
      }
      const triedRaw = localStorage.getItem('papaya-tried-skins')
      if (triedRaw) {
        const arr = JSON.parse(triedRaw) as string[]
        if (Array.isArray(arr)) setTriedSkins(new Set(arr as Skin[]))
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Persist skin choice + track tried skins for achievement
  const changeSkin = (s: Skin) => {
    setSkin(s)
    setTriedSkins((prev) => {
      if (prev.has(s)) return prev
      const next = new Set(prev)
      next.add(s)
      try {
        localStorage.setItem('papaya-tried-skins', JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
    try {
      localStorage.setItem('papaya-skin', s)
    } catch {
      /* ignore */
    }
  }

  // Combo multiplier: every 3 consecutive freezes adds +0.5x (capped at 3x)
  const comboMultiplier = Math.min(3, 1 + Math.floor(combo / 3) * 0.5)
  const score = Math.floor(
    freezes * 100 * comboMultiplier + Math.floor(danceSeconds)
  )

  // ----- Achievements: check after every stat change, queue newly unlocked -----
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

  // Process the achievement toast queue: show one at a time for 3s
  useEffect(() => {
    if (achToast || achQueue.length === 0) return
    const [first, ...rest] = achQueue
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAchQueue(rest)
    setAchToast(first)
    const t = setTimeout(() => setAchToast(null), 3200)
    return () => clearTimeout(t)
  }, [achToast, achQueue])

  // ----- Leaderboard -----
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard', { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data.scores)) setLeaderboard(data.scores)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    // initial leaderboard load on mount (legitimate one-time data fetch)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeaderboard()
  }, [fetchLeaderboard])

  // ----- cleanup on unmount -----
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

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 900)
  }

  // ----- refs holding the latest handler versions (avoids stale closures
  // and declaration-order issues inside timers / listeners) -----
  const gameOverRef = useRef<(r: FailReason) => void>(() => {})
  const triggerFreezeRef = useRef<() => void>(() => {})
  const scheduleMusicStopRef = useRef<() => void>(() => {})
  const onSuccessRef = useRef<() => void>(() => {})

  // ----- core timers (stable, no deps) -----
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

  // ----- handlers (plain functions, recreated each render with fresh state) -----
  const gameOver = async (reason: FailReason) => {
    if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (frozenResumeTimer.current) clearTimeout(frozenResumeTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
    stopDanceTimer()
    engineRef.current?.stop()
    if (soundOnRef.current) engineRef.current?.sting('fail')
    setFailReason(reason)
    setState('gameover')

    // compute final score with combo multiplier (combo frozen at moment of fail)
    const finalMult = Math.min(3, 1 + Math.floor(combo / 3) * 0.5)
    const finalScore = Math.floor(freezes * 100 * finalMult + Math.floor(danceSeconds))

    // save score once
    if (!savedThisRun) {
      setSavedThisRun(true)
      const name = playerName.trim() || 'Аноним'
      // Check + persist personal best (localStorage)
      try {
        const stored = localStorage.getItem('papaya-best-score')
        const prev = stored ? parseInt(stored, 10) : 0
        if (finalScore > prev) {
          localStorage.setItem('papaya-best-score', String(finalScore))
          setPersonalBest(finalScore)
          setIsNewBest(true)
        }
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: name,
            score: finalScore,
            danceSeconds: Math.floor(danceSeconds),
            freezes,
            rounds: round - 1,
          }),
        })
        if (res.ok) {
          await fetchLeaderboard()
          // figure out rank
          const data = await fetch('/api/leaderboard', {
            cache: 'no-store',
          }).then((r) => r.json())
          const idx = (data.scores as ScoreEntry[]).findIndex(
            (s) => s.score === finalScore && s.playerName === name
          )
          const rank = idx >= 0 ? idx + 1 : null
          setLastSavedRank(rank)
          // Top-3 finish triggers a celebratory confetti burst
          if (rank !== null && rank <= 3) {
            setConfetti(true)
            setTimeout(() => setConfetti(false), 3200)
          }
        }
      } catch {
        /* ignore */
      }
      // Final achievement check with end-of-run stats
      checkAchievements({
        freezes,
        combo,
        bestCombo,
        danceSeconds: Math.floor(danceSeconds),
        round,
        score: finalScore,
      })
      // Update + persist lifetime session stats
      setSessionStats((prev) => {
        const next = {
          games: prev.games + 1,
          totalFreezes: prev.totalFreezes + freezes,
          totalDanceSeconds:
            prev.totalDanceSeconds + Math.floor(danceSeconds),
        }
        try {
          localStorage.setItem('papaya-session-stats', JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    }
  }

  // ----- share score -----
  const shareScore = async () => {
    const text = `🥭 Замри, Папайа! Счёт: ${score} (Замри: ${freezes}, В танце: ${danceSeconds.toFixed(1)}с, Макс. комбо: ${bestCombo})${lastSavedRank ? ` — #${lastSavedRank} в таблице!` : ''}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Замри, Папайа!', text })
      } else {
        await navigator.clipboard.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      }
    } catch {
      /* ignore (user cancelled share) */
    }
  }

  // Shared "freeze action" — used by both the SPACE key handler and the
  // mobile tap-to-freeze button so behaviour is identical.
  const handleFreezeAction = () => {
    const s = stateRef.current
    if (s === 'dancing') {
      // pressed while music still playing => too early
      gameOverRef.current('early')
    } else if (s === 'freeze') {
      onSuccessRef.current()
    }
    // ignore in other states
  }

  const triggerFreeze = () => {
    setState('freeze')
    stopDanceTimer()
    engineRef.current?.stop()
    const win = getFreezeWindow(roundRef.current, difficultyRef.current)
    freezeWindowRef.current = win
    freezeStartRef.current = performance.now()
    setFreezeProgress(1)
    // Screen shake on the freeze moment for impact
    setScreenShake(true)
    setTimeout(() => setScreenShake(false), 450)

    const animate = () => {
      const elapsed = performance.now() - freezeStartRef.current
      const remaining = Math.max(0, 1 - elapsed / win)
      setFreezeProgress(remaining)
      if (remaining > 0 && stateRef.current === 'freeze') {
        freezeAnimRef.current = requestAnimationFrame(animate)
      }
    }
    freezeAnimRef.current = requestAnimationFrame(animate)

    freezeWindowTimer.current = setTimeout(() => {
      // missed the window
      if (stateRef.current === 'freeze') {
        gameOverRef.current('late')
      }
    }, win)
  }

  const scheduleMusicStop = () => {
    if (musicStopTimer.current) clearTimeout(musicStopTimer.current)
    musicStopTimer.current = setTimeout(() => {
      triggerFreezeRef.current()
    }, randMusicDuration(difficultyRef.current))
  }

  const onSuccess = () => {
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
    setState('frozen')
    // Timing bonus: freezeProgress still > 0.66 means a "perfect" early freeze
    const timing = freezeProgress
    const isPerfect = timing > 0.66
    const isGood = timing > 0.33 && !isPerfect
    const bonusMult = isPerfect ? 1.5 : isGood ? 1.2 : 1
    const newFreezes = freezes + 1
    const newRound = round + 1
    const newCombo = combo + 1
    const newMult = Math.min(3, 1 + Math.floor(newCombo / 3) * 0.5)
    const newBestCombo = Math.max(bestCombo, newCombo)
    setFreezes(newFreezes)
    setRound(newRound)
    setCombo(newCombo)
    if (newCombo > bestCombo) setBestCombo(newCombo)
    if (isPerfect) setPerfectFreezes((p) => p + 1)
    if (soundOnRef.current) engineRef.current?.sting('success')
    const timingLabel = isPerfect ? ' ИДЕАЛ!' : isGood ? ' Хорошо!' : ''
    const multLabel = newMult > 1 ? ` ×${newMult.toFixed(1)}` : ''
    showFlash(
      `Замри! +${newRound - 1}${multLabel} 🔥${newCombo}${timingLabel}`
    )

    // Check achievements with the updated stats (include timing bonus in score)
    const newPerfectFreezes = perfectFreezes + (isPerfect ? 1 : 0)
    const runScore = Math.floor(
      newFreezes * 100 * newMult * bonusMult + Math.floor(danceSeconds)
    )
    checkAchievements({
      freezes: newFreezes,
      combo: newCombo,
      bestCombo: newBestCombo,
      danceSeconds: Math.floor(danceSeconds),
      round: newRound,
      score: runScore,
      perfectFreezes: newPerfectFreezes,
      skinsUnlocked: triedSkins.size,
    })

    // Celebrate milestones: every 5 freezes triggers confetti
    if (newFreezes > 0 && newFreezes % 5 === 0) {
      setConfetti(true)
      setTimeout(() => setConfetti(false), 2600)
    }

    frozenResumeTimer.current = setTimeout(() => {
      setState('dancing')
      if (soundOnRef.current) engineRef.current?.start()
      startDanceTimer()
      scheduleMusicStopRef.current()
    }, 1300)
  }

  // keep handler refs in sync with the latest closures (assignment happens in
  // an effect so we never mutate refs during render)
  useEffect(() => {
    gameOverRef.current = gameOver
    triggerFreezeRef.current = triggerFreeze
    scheduleMusicStopRef.current = scheduleMusicStop
    onSuccessRef.current = onSuccess
  })

  // keep the freeze-action ref in sync too
  const handleFreezeActionRef = useRef(handleFreezeAction)
  useEffect(() => {
    handleFreezeActionRef.current = handleFreezeAction
  })

  // ----- pause / resume (defined before the key handler so its ref exists) -----
  const togglePause = () => {
    const s = stateRef.current
    if (s === 'dancing' || s === 'freeze' || s === 'frozen') {
      // pause: stop music + freeze timers
      setPausedFrom(s)
      setState('paused')
      stopDanceTimer()
      if (musicStopTimer.current) {
        clearTimeout(musicStopTimer.current)
        musicStopTimer.current = null
      }
      if (freezeWindowTimer.current) {
        clearTimeout(freezeWindowTimer.current)
        freezeWindowTimer.current = null
      }
      if (frozenResumeTimer.current) {
        clearTimeout(frozenResumeTimer.current)
        frozenResumeTimer.current = null
      }
      if (freezeAnimRef.current) {
        cancelAnimationFrame(freezeAnimRef.current)
        freezeAnimRef.current = null
      }
      engineRef.current?.stop()
    } else if (s === 'paused' && pausedFrom) {
      // resume: restart music + timers depending on where we paused
      const from = pausedFrom
      setState(from)
      setPausedFrom(null)
      if (from === 'dancing') {
        if (soundOnRef.current) {
          engineRef.current?.setVolume(volume)
          engineRef.current?.start()
        }
        startDanceTimer()
        scheduleMusicStop()
      }
      // If paused during 'freeze' or 'frozen', the freeze window is lost —
      // simply resume dancing fresh (simpler + fairer than partial timing).
      if (from === 'freeze' || from === 'frozen') {
        setState('dancing')
        if (soundOnRef.current) engineRef.current?.start()
        startDanceTimer()
        scheduleMusicStop()
      }
    }
  }
  const togglePauseRef = useRef(togglePause)
  useEffect(() => {
    togglePauseRef.current = togglePause
  })

  // ----- key handler (mounted once) -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Pause / resume with P or Escape (only meaningful mid-game)
      if (e.code === 'KeyP' || e.code === 'Escape') {
        const s = stateRef.current
        if (s === 'dancing' || s === 'freeze' || s === 'frozen') {
          e.preventDefault()
          togglePauseRef.current()
          return
        }
        if (s === 'paused') {
          e.preventDefault()
          togglePauseRef.current()
          return
        }
      }
      if (e.code !== 'Space') return
      e.preventDefault()
      handleFreezeActionRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ----- start / restart (with 3-2-1 countdown) -----
  const beginDancing = async () => {
    setState('dancing')
    if (soundOnRef.current) {
      if (!engineRef.current) engineRef.current = new ChuckyEngine()
      await engineRef.current.init()
      engineRef.current.setVolume(volume)
      await engineRef.current.start()
    }
    startDanceTimer()
    scheduleMusicStop()
  }

  const startGame = async () => {
    // reset run state
    setDanceSeconds(0)
    setFreezes(0)
    setRound(1)
    setFailReason(null)
    setSavedThisRun(false)
    setLastSavedRank(null)
    setFreezeProgress(1)
    setConfetti(false)
    setCombo(0)
    setBestCombo(0)
    setIsNewBest(false)
    setPausedFrom(null)
    setShared(false)
    // init audio engine on the user gesture (required by browsers)
    if (!engineRef.current) engineRef.current = new ChuckyEngine()
    await engineRef.current.init()
    // run 3-2-1 countdown, then begin dancing
    setState('countdown')
    setCountdown(3)
    for (const n of [3, 2, 1]) {
      setCountdown(n)
      if (soundOnRef.current) engineRef.current?.sting('success')
      await new Promise((r) => setTimeout(r, 750))
    }
    setCountdown(null)
    await beginDancing()
  }

  // ----- dismiss tutorial (persist seen flag) -----
  const dismissTutorial = () => {
    setShowTutorial(false)
    try {
      localStorage.setItem('papaya-tutorial-seen', '1')
    } catch {
      /* ignore */
    }
  }

  // ----- toggle sound (live) -----
  const toggleSound = async () => {
    const next = !soundOn
    setSoundOn(next)
    if (!next) {
      // turning sound off -> stop current music immediately
      engineRef.current?.stop()
    } else if (state === 'dancing') {
      // turning sound back on mid-dance -> resume music
      if (!engineRef.current) engineRef.current = new ChuckyEngine()
      await engineRef.current.init()
      engineRef.current.setVolume(volume)
      await engineRef.current.start()
    }
  }

  // ----- change volume (live) -----
  const changeVolume = (v: number) => {
    setVolume(v)
    engineRef.current?.setVolume(v)
  }

  const isPlaying = state === 'dancing' || state === 'freeze' || state === 'frozen'
  const dancing = state === 'dancing'
  const showFreezeOverlay = state === 'freeze'
  const isPaused = state === 'paused'
  const isCountdown = state === 'countdown'

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#1a0608] text-foreground ${
        screenShake ? 'screen-shake' : ''
      }`}
    >
      {/* atmospheric background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40 bg-cover bg-center"
        style={{ backgroundImage: "url('/stage-bg.png')" }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#1a0608]/70 via-[#1a0608]/85 to-[#0a0203]" />
      {/* spotlight */}
      <div className="pointer-events-none fixed inset-0 spotlight-glow" />

      {/* countdown overlay (3-2-1 before dancing starts) */}
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

      {/* confetti celebration overlay */}
      <AnimatePresence>
        {confetti && <ConfettiBurst />}
      </AnimatePresence>

      {/* achievement toast (top-center) */}
      <AchievementToast achId={achToast} />

      {/* achievements panel modal */}
      <AnimatePresence>
        {showAchPanel && (
          <AchievementsPanel
            unlocked={unlockedAch}
            onClose={() => setShowAchPanel(false)}
          />
        )}
      </AnimatePresence>

      {/* first-play tutorial overlay */}
      <AnimatePresence>
        {showTutorial && <TutorialOverlay onClose={dismissTutorial} />}
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
              className="flex flex-col items-center gap-4 rounded-2xl border border-red-900/50 bg-[#1a0608] px-10 py-8 text-center shadow-2xl"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-900/50 ring-2 ring-red-500/40">
                <Pause className="h-7 w-7 text-red-300" />
              </div>
              <h2 className="text-xl font-black text-red-200">ПАУЗА</h2>
              <p className="max-w-xs text-xs text-red-300/70">
                Музыка и таймер остановлены. Нажми «Продолжить», клавишу{' '}
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                  P
                </kbd>{' '}
                или{' '}
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                  Esc
                </kbd>
                , чтобы вернуться к танцам.
              </p>
              <Button
                onClick={togglePause}
                className="bg-red-700 hover:bg-red-600"
              >
                <Play className="mr-1 h-4 w-4" /> Продолжить
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== HEADER ===== */}
      <header className="relative z-10 border-b border-red-900/40 bg-black/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/60 ring-2 ring-red-500/40">
              <Skull className="h-5 w-5 text-red-300" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-red-200 sm:text-xl">
                ЗАМРИ, ПАПАЙА!
              </h1>
              <p className="text-[11px] text-red-300/70">
                Танцуй под музыку Чакки — замри, когда музыка стихнет
              </p>
            </div>
          </div>

          {/* stat cluster */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <StatChip
              icon={<Timer className="h-4 w-4" />}
              label="Секунд в танце"
              value={danceSeconds.toFixed(1)}
              tone="amber"
              big
            />
            <StatChip
              icon={<Hand className="h-4 w-4" />}
              label="Замри"
              value={String(freezes)}
              tone="emerald"
            />
            <StatChip
              icon={<Sparkles className="h-4 w-4" />}
              label="Раунд"
              value={String(round)}
              tone="violet"
            />
            <StatChip
              icon={<Trophy className="h-4 w-4" />}
              label="Счёт"
              value={String(score)}
              tone="rose"
            />
            {/* Combo indicator — only shows when combo >= 3 (multiplier active) */}
            <AnimatePresence>
              {combo >= 3 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.6, x: -10 }}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-orange-500/30 to-red-700/20 px-3 py-1.5 ring-1 ring-orange-400/50"
                >
                  <Flame className="h-4 w-4 animate-pulse text-orange-300" />
                  <div className="flex flex-col leading-none">
                    <span className="text-[9px] uppercase tracking-wider text-orange-200/70">
                      Комбо
                    </span>
                    <span className="font-mono text-sm font-black text-orange-200">
                      ×{comboMultiplier.toFixed(1)} · {combo}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
              title={soundOn ? 'Выключить звук' : 'Включить звук'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-900/50 bg-black/40 text-red-200 transition-colors hover:bg-red-900/40 hover:text-white"
            >
              {soundOn ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4 text-red-400/60" />
              )}
            </button>
            {/* Volume slider — shown only when sound is on */}
            {soundOn && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                aria-label="Громкость"
                title={`Громкость: ${Math.round(volume * 100)}%`}
                className="vol-slider h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-red-900/50 sm:w-20"
              />
            )}
            {/* Pause button — shown only while playing */}
            {isPlaying && (
              <button
                type="button"
                onClick={togglePause}
                aria-label="Пауза"
                title="Пауза (P)"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-900/50 bg-black/40 text-red-200 transition-colors hover:bg-red-900/40 hover:text-white"
              >
                <Pause className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 px-4 py-5 lg:grid-cols-[1fr_340px]">
        {/* STAGE */}
        <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden rounded-2xl border border-red-900/40 bg-gradient-to-b from-[#2a0a0e]/80 to-[#150406]/90 p-4 shadow-[0_0_60px_-15px_rgba(220,38,38,0.5)]">
          {/* stage curtains top */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-red-950/80 to-transparent" />
          {/* decorative curtain folds */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-50" style={{
            backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent 16px, rgba(127,29,29,0.7) 16px, rgba(127,29,29,0.7) 20px)',
          }} />
          {/* side spotlights (left + right beams) */}
          <div className="pointer-events-none absolute -left-10 top-0 h-full w-40 rotate-12 bg-gradient-to-r from-amber-500/10 to-transparent blur-2xl" />
          <div className="pointer-events-none absolute -right-10 top-0 h-full w-40 -rotate-12 bg-gradient-to-l from-amber-500/10 to-transparent blur-2xl" />
          {/* stage floor reflection */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-8 bottom-0 h-24 rounded-t-full bg-gradient-to-t from-amber-500/10 to-transparent blur-xl" />

          {/* floating dust motes for atmosphere */}
          <DustMotes />

          {/* music equalizer (top-right of stage, shown while music plays) */}
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
          <div className="relative z-10 mb-2 flex h-7 items-center justify-center">
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
                  Музыка играет — Папайа танцует!
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
                  ЗАМРИ! Жми ПРОБЕЛ!
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
                  Отлично! Папайа замер!
                </motion.div>
              )}
              {state === 'gameover' && (
                <motion.div
                  key="over"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-base font-black text-red-400"
                >
                  <Skull className="h-5 w-5" />
                  {failReason === 'early'
                    ? 'Слишком рано! Музыка ещё играла.'
                    : 'Слишком поздно! Папайа не успел замереть.'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* freeze reaction bar */}
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

          {/* CHARACTER */}
          <div className="relative flex h-[300px] w-full items-end justify-center sm:h-[360px]">
            {/* shadow */}
            <motion.div
              className="absolute bottom-6 h-4 w-28 rounded-[50%] bg-black/50 blur-md"
              animate={
                dancing
                  ? { scaleX: [1, 1.3, 0.8, 1.1, 1], opacity: [0.5, 0.35, 0.6, 0.4, 0.5] }
                  : { scaleX: 1, opacity: 0.5 }
              }
              transition={
                dancing
                  ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.2 }
              }
            />

            {/* the papaya — animated SVG floss dance */}
            <motion.div
              key="papaya-svg"
              className="relative h-[300px] w-[270px] sm:h-[360px] sm:w-[320px]"
              initial={{ opacity: 0, y: 20, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            >
              <PapayaCharacter state={state} skin={skin} />
            </motion.div>

            {/* floating notes while dancing */}
            {dancing && (
              <FloatingNotes />
            )}

            {/* ice effect when frozen */}
            <AnimatePresence>
              {(state === 'frozen' || state === 'gameover') && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <div className="absolute bottom-8 h-[260px] w-[260px] rounded-full bg-cyan-300/10 blur-2xl" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* flash message */}
          <div className="relative z-10 mt-3 flex h-6 items-center justify-center">
            <AnimatePresence>
              {flash && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200 ring-1 ring-emerald-400/40"
                >
                  {flash}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* control panel */}
          <div className="relative z-10 mt-4 flex w-full max-w-md flex-col items-center gap-3">
            <AnimatePresence mode="wait">
              {state === 'idle' && (
                <motion.div
                  key="idle-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex w-full flex-col items-center gap-3"
                >
                  <p className="text-center text-xs text-red-200/80">
                    Когда музыка резко стихнет — жми{' '}
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                      ПРОБЕЛ
                    </kbd>{' '}
                    или кнопку ЗАМРИ. Не жми слишком рано! 🔥 Серия из 3+ замри
                    даёт множитель очков.
                  </p>
                  {/* difficulty selector */}
                  <div className="flex w-full flex-col gap-1.5">
                    <span className="text-center text-[10px] uppercase tracking-wider text-red-300/60">
                      Сложность
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map(
                        (d) => {
                          const active = difficulty === d
                          const tone =
                            d === 'easy'
                              ? 'emerald'
                              : d === 'hard'
                                ? 'rose'
                                : 'amber'
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setDifficulty(d)}
                              className={`rounded-lg border px-2 py-1.5 text-xs font-bold transition-all ${
                                active
                                  ? tone === 'emerald'
                                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                                    : tone === 'rose'
                                      ? 'border-rose-400/60 bg-rose-500/20 text-rose-200'
                                      : 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                                  : 'border-red-900/40 bg-black/30 text-red-300/60 hover:bg-red-900/20'
                              }`}
                            >
                              {DIFFICULTY_PRESETS[d].label}
                            </button>
                          )
                        }
                      )}
                    </div>
                  </div>
                  {/* skin selector */}
                  <div className="flex w-full flex-col gap-1.5">
                    <span className="text-center text-[10px] uppercase tracking-wider text-red-300/60">
                      Персонаж
                    </span>
                    <div className="flex w-full justify-center gap-1.5">
                      {SKINS.map((s) => {
                        const active = skin === s.id
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => changeSkin(s.id)}
                            title={s.label}
                            aria-label={s.label}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-all ${
                              active
                                ? 'border-amber-400/60 bg-amber-500/20 ring-1 ring-amber-400/40'
                                : 'border-red-900/40 bg-black/30 opacity-60 hover:opacity-100'
                            }`}
                          >
                            {s.emoji}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex w-full gap-2">
                    <Input
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Имя танцора"
                      maxLength={24}
                      className="border-red-900/50 bg-black/40 text-red-100 placeholder:text-red-300/40"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') startGame()
                      }}
                    />
                    <Button
                      onClick={startGame}
                      className="bg-red-700 hover:bg-red-600"
                    >
                      <Play className="mr-1 h-4 w-4" /> Старт
                    </Button>
                  </div>
                  {/* re-open tutorial link */}
                  <button
                    type="button"
                    onClick={() => setShowTutorial(true)}
                    className="text-[11px] text-red-300/50 underline-offset-2 transition-colors hover:text-red-200 hover:underline"
                  >
                    Как играть?
                  </button>
                </motion.div>
              )}

              {isPlaying && (
                <motion.div
                  key="playing-panel"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex w-full flex-col items-center gap-3"
                >
                  <div className="flex items-center gap-2 text-center text-xs text-red-200/70">
                    <kbd className="rounded bg-white/10 px-2 py-1 font-mono text-red-100">
                      ПРОБЕЛ
                    </kbd>
                    = замереть, когда музыка стихнет
                  </div>
                  {/* big tap-to-freeze button — primary control on touch devices */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      handleFreezeAction()
                    }}
                    className={`flex h-16 w-full select-none items-center justify-center gap-2 rounded-xl border-2 text-base font-black tracking-wide transition-all active:scale-95 ${
                      showFreezeOverlay
                        ? 'animate-pulse border-red-400 bg-red-600/40 text-white shadow-[0_0_30px_-5px_rgba(248,113,113,0.7)]'
                        : dancing
                          ? 'border-red-800/50 bg-black/40 text-red-200 hover:border-red-500/60 hover:bg-red-900/30'
                          : 'border-slate-600/50 bg-black/40 text-slate-300'
                    }`}
                    aria-label="Замереть"
                  >
                    <Hand className="h-5 w-5" />
                    ЗАМРИ
                  </button>
                </motion.div>
              )}

              {state === 'gameover' && (
                <motion.div
                  key="over-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex w-full flex-col items-center gap-3"
                >
                  {/* New personal best callout */}
                  <AnimatePresence>
                    {isNewBest && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500/30 to-orange-600/30 px-4 py-1.5 text-sm font-black text-amber-200 ring-2 ring-amber-400/60"
                      >
                        <Star className="h-4 w-4 animate-pulse fill-amber-300 text-amber-300" />
                        НОВЫЙ ЛИЧНЫЙ РЕКОРД!
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Stats breakdown grid */}
                  <div className="grid w-full grid-cols-2 gap-2">
                    <div className="flex flex-col items-center rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-400/30">
                      <Trophy className="mb-1 h-4 w-4 text-amber-400" />
                      <span className="text-[9px] uppercase tracking-wider text-amber-200/60">
                        Счёт
                      </span>
                      <span className="font-mono text-lg font-black text-amber-200">
                        {score}
                      </span>
                    </div>
                    <div className="flex flex-col items-center rounded-lg bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-400/30">
                      <Hand className="mb-1 h-4 w-4 text-emerald-400" />
                      <span className="text-[9px] uppercase tracking-wider text-emerald-200/60">
                        Замри
                      </span>
                      <span className="font-mono text-lg font-black text-emerald-200">
                        {freezes}
                      </span>
                    </div>
                    <div className="flex flex-col items-center rounded-lg bg-violet-500/10 px-3 py-2 ring-1 ring-violet-400/30">
                      <Timer className="mb-1 h-4 w-4 text-violet-400" />
                      <span className="text-[9px] uppercase tracking-wider text-violet-200/60">
                        В танце
                      </span>
                      <span className="font-mono text-lg font-black text-violet-200">
                        {danceSeconds.toFixed(1)}с
                      </span>
                    </div>
                    <div className="flex flex-col items-center rounded-lg bg-orange-500/10 px-3 py-2 ring-1 ring-orange-400/30">
                      <Flame className="mb-1 h-4 w-4 text-orange-400" />
                      <span className="text-[9px] uppercase tracking-wider text-orange-200/60">
                        Макс. комбо
                      </span>
                      <span className="font-mono text-lg font-black text-orange-200">
                        {bestCombo}
                      </span>
                    </div>
                  </div>

                  {/* Rank + personal best row */}
                  <div className="flex flex-wrap items-center justify-center gap-2 text-center">
                    {lastSavedRank && lastSavedRank <= 20 && (
                      <Badge className="bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40">
                        <Crown className="mr-1 h-3 w-3" />#{lastSavedRank} в таблице
                      </Badge>
                    )}
                    {personalBest !== null && (
                      <Badge
                        className={`ring-1 ${
                          isNewBest
                            ? 'bg-amber-500/20 text-amber-200 ring-amber-400/40'
                            : 'bg-slate-500/15 text-slate-300 ring-slate-400/30'
                        }`}
                      >
                        <TrendingUp className="mr-1 h-3 w-3" />
                        {isNewBest ? 'Рекорд побит!' : `Лучший: ${personalBest}`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex w-full gap-2">
                    <Button
                      onClick={startGame}
                      className="flex-1 bg-red-700 hover:bg-red-600"
                    >
                      <RotateCcw className="mr-1 h-4 w-4" /> Ещё раз
                    </Button>
                    <Button
                      onClick={shareScore}
                      variant="outline"
                      className="border-amber-700/50 bg-amber-900/20 text-amber-200 hover:bg-amber-900/40 hover:text-amber-100"
                      title="Поделиться результатом"
                    >
                      {shared ? (
                        <>
                          <Check className="mr-1 h-4 w-4" /> Скопировано!
                        </>
                      ) : (
                        <>
                          <Share2 className="mr-1 h-4 w-4" /> Поделиться
                        </>
                      )}
                    </Button>
                  </div>
                  {/* Lifetime session stats */}
                  {sessionStats.games > 0 && (
                    <div className="flex w-full items-center justify-center gap-3 rounded-lg bg-black/30 px-3 py-2 text-[10px] text-red-300/50">
                      <span>🎮 {sessionStats.games} игр</span>
                      <span>·</span>
                      <span>🥭 {sessionStats.totalFreezes} замри</span>
                      <span>·</span>
                      <span>⏱ {sessionStats.totalDanceSeconds}с</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ===== LEADERBOARD ===== */}
        <aside className="relative flex flex-col gap-3">
          <Card className="flex flex-1 flex-col border-red-900/40 bg-black/50 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-red-900/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                <h2 className="text-sm font-bold tracking-wide text-amber-200">
                  ЛИДЕРБОРД
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAchPanel(true)}
                  className="h-7 gap-1 px-2 text-xs text-red-300/70 hover:text-red-200"
                  title="Достижения"
                >
                  <Medal className="h-3 w-3" />
                  <span className="hidden sm:inline">
                    {unlockedAch.size}/{ACHIEVEMENTS.length}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchLeaderboard}
                  className="h-7 px-2 text-xs text-red-300/70 hover:text-red-200"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-2 py-2">
                {leaderboard.length === 0 ? (
                  <div className="px-3 py-10 text-center text-xs text-red-300/50">
                    Пока нет рекордов.
                    <br />
                    Стань первым!
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {leaderboard.map((s, i) => {
                      const isMyBest =
                        personalBest !== null && s.score === personalBest
                      return (
                        <li
                          key={s.id}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                            i === 0
                              ? 'bg-amber-500/15 ring-1 ring-amber-400/30'
                              : i === 1
                                ? 'bg-slate-300/10'
                                : i === 2
                                  ? 'bg-orange-700/15'
                                  : 'hover:bg-white/5'
                          } ${isMyBest ? 'ring-1 ring-cyan-400/50' : ''}`}
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                              i === 0
                                ? 'bg-amber-400 text-amber-950'
                                : i === 1
                                  ? 'bg-slate-300 text-slate-900'
                                  : i === 2
                                    ? 'bg-orange-600 text-orange-50'
                                    : 'bg-white/10 text-red-200/70'
                            }`}
                          >
                            {i + 1}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="flex items-center gap-1 truncate font-semibold text-red-100">
                              {s.playerName}
                              {isMyBest && (
                                <Star className="h-3 w-3 shrink-0 fill-cyan-300 text-cyan-300" />
                              )}
                            </span>
                            <span className="text-[10px] text-red-300/60">
                              {s.freezes} замри · {s.danceSeconds}с
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-bold text-amber-300">
                            {s.score}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </ScrollArea>
            <Separator className="bg-red-900/30" />
            <div className="px-4 py-2 text-center text-[10px] text-red-300/50">
              Очки = замри × 100 × множитель + секунды
            </div>
          </Card>
          {/* Lifetime session stats card */}
          {sessionStats.games > 0 && (
            <Card className="border-amber-900/30 bg-black/40 p-3 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">
                  За всё время
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col">
                  <span className="font-mono text-base font-black text-amber-200">
                    {sessionStats.games}
                  </span>
                  <span className="text-[9px] text-red-300/50">игр</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-base font-black text-emerald-200">
                    {sessionStats.totalFreezes}
                  </span>
                  <span className="text-[9px] text-red-300/50">замри</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-base font-black text-violet-200">
                    {sessionStats.totalDanceSeconds}с
                  </span>
                  <span className="text-[9px] text-red-300/50">в танце</span>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 mt-auto border-t border-red-900/40 bg-black/50 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3 text-xs text-red-300/60">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row sm:text-left">
            <span>
              🥭 Папайа танцует под жуткую мелодию. Успей замереть, когда музыка
              стихнет!
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <Music2 className="h-3 w-3" /> Музыка в реальном времени
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                · Сложность: {DIFFICULTY_PRESETS[difficulty].label}
              </span>
            </span>
          </div>
          {/* keyboard shortcuts row */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-red-900/20 pt-2 text-center text-[10px] text-red-300/40">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                ПРОБЕЛ
              </kbd>
              замри
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                P
              </kbd>
              /
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                Esc
              </kbd>
              пауза
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                Enter
              </kbd>
              старт
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ---------- sub components ---------- */

function StatChip({
  icon,
  label,
  value,
  tone,
  big,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'amber' | 'emerald' | 'violet' | 'rose'
  big?: boolean
}) {
  const tones: Record<string, string> = {
    amber: 'from-amber-500/20 to-amber-700/10 text-amber-200 ring-amber-400/30',
    emerald:
      'from-emerald-500/20 to-emerald-700/10 text-emerald-200 ring-emerald-400/30',
    violet:
      'from-violet-500/20 to-violet-700/10 text-violet-200 ring-violet-400/30',
    rose: 'from-rose-500/20 to-rose-700/10 text-rose-200 ring-rose-400/30',
  }
  return (
    <div
      className={`flex items-center gap-2 rounded-xl bg-gradient-to-b ${tones[tone]} px-3 py-1.5 ring-1 backdrop-blur-sm`}
    >
      <span className={big ? 'h-5 w-5' : 'h-4 w-4'}>{icon}</span>
      <div className="flex flex-col leading-none">
        <span className="text-[9px] uppercase tracking-wider opacity-70">
          {label}
        </span>
        <span
          className={`font-mono font-bold ${big ? 'text-base' : 'text-sm'}`}
        >
          {value}
        </span>
      </div>
    </div>
  )
}

function FloatingNotes() {
  const notes = ['♪', '♫', '♩', '♬', '🥭']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => {
        const left = 15 + Math.random() * 70
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
            transition={{
              duration: dur,
              delay,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          >
            {sym}
          </motion.span>
        )
      })}
    </div>
  )
}

function ConfettiBurst() {
  const colors = [
    '#fbbf24',
    '#f97316',
    '#ef4444',
    '#ec4899',
    '#a855f7',
    '#22d3ee',
    '#4ade80',
  ]
  const pieces = Array.from({ length: 60 })
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* celebratory banner */}
      <motion.div
        className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-amber-500/20 px-5 py-2 text-lg font-black text-amber-200 ring-2 ring-amber-400/50 backdrop-blur-sm"
        initial={{ scale: 0, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 14 }}
      >
        <PartyPopper className="mr-2 inline h-5 w-5" />
        ОТЛИЧНО!
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
            transition={{
              duration: dur,
              delay,
              ease: 'easeIn',
            }}
          />
        )
      })}
    </motion.div>
  )
}

/* Animated music equalizer — visual feedback that music is playing.
   Bars pulse via CSS; when `active` is false they sit low. */
function Equalizer({ active, muted }: { active: boolean; muted: boolean }) {
  const bars = [0, 1, 2, 3, 4]
  return (
    <div
      className={`flex h-8 items-end gap-0.5 rounded-md bg-black/40 px-1.5 py-1 ring-1 ring-red-900/40 ${
        muted ? 'opacity-50' : ''
      }`}
      title={muted ? 'Звук выключен' : 'Музыка играет'}
      aria-hidden="true"
    >
      {bars.map((b) => (
        <motion.span
          key={b}
          className="w-1 rounded-full bg-gradient-to-t from-amber-600 to-amber-300"
          animate={
            active
              ? { height: [6, 20, 10, 24, 8] }
              : { height: 4 }
          }
          transition={{
            duration: 0.5 + b * 0.08,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
            delay: b * 0.05,
          }}
          style={{ height: 4 }}
        />
      ))}
    </div>
  )
}

/* Floating dust motes for atmospheric depth in the stage. */
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

/* Achievement toast — slides in from the top when an achievement unlocks. */
function AchievementToast({ achId }: { achId: string | null }) {
  const ach = achId ? getAchievement(achId) : null
  return (
    <AnimatePresence>
      {ach && (
        <motion.div
          key={ach.id}
          initial={{ opacity: 0, y: -40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-3 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-900/80 to-orange-900/80 px-4 py-2.5 shadow-[0_0_30px_-5px_rgba(251,191,36,0.6)] backdrop-blur-sm">
            <motion.span
              className="text-2xl"
              animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              {ach.icon}
            </motion.span>
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-amber-300/70">
                Достижение!
              </span>
              <span className="text-sm font-black text-amber-100">
                {ach.title}
              </span>
              <span className="text-[10px] text-amber-200/60">{ach.desc}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* Achievements panel — modal showing all achievements (locked/unlocked). */
function AchievementsPanel({
  unlocked,
  onClose,
}: {
  unlocked: Set<string>
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-amber-900/50 bg-[#1a0608] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-amber-900/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-black text-amber-200">
              ДОСТИЖЕНИЯ
            </h2>
            <Badge className="bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40">
              {unlocked.size}/{ACHIEVEMENTS.length}
            </Badge>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-red-300/70 transition-colors hover:bg-red-900/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-1 gap-2 p-4">
            {ACHIEVEMENTS.map((a) => {
              const isUnlocked = unlocked.has(a.id)
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    isUnlocked
                      ? 'border-amber-400/40 bg-amber-500/10'
                      : 'border-red-900/30 bg-black/30 opacity-60'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${
                      isUnlocked
                        ? 'bg-amber-500/20 ring-1 ring-amber-400/40'
                        : 'bg-black/40 grayscale'
                    }`}
                  >
                    {isUnlocked ? a.icon : '🔒'}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`text-sm font-bold ${
                        isUnlocked ? 'text-amber-100' : 'text-red-200/50'
                      }`}
                    >
                      {a.title}
                    </span>
                    <span className="text-[11px] text-red-300/50">
                      {a.desc}
                    </span>
                  </div>
                  {isUnlocked && (
                    <Star className="h-4 w-4 shrink-0 fill-amber-300 text-amber-300" />
                  )}
                </motion.div>
              )
            })}
          </div>
        </ScrollArea>
        <div className="border-t border-amber-900/40 px-5 py-2 text-center text-[10px] text-amber-300/50">
          Достижения открываются автоматически по ходу игры
        </div>
      </motion.div>
    </motion.div>
  )
}

/* First-play tutorial overlay — explains the game with 3 steps. */
function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      icon: '🎵',
      title: 'Папайа танцует',
      desc: 'Под жуткую музыку Чакки Папайа делает фосс-танец. Следи за таймером вверху!',
    },
    {
      icon: '🛑',
      title: 'Музыка стихнет',
      desc: 'Внезапно музыка остановится — появится красный сигнал «ЗАМРИ!». Это твой момент!',
    },
    {
      icon: '⌨️',
      title: 'Жми ПРОБЕЛ',
      desc: 'Нажми ПРОБЕЛ или кнопку ЗАМРИ, пока папайа не успел замереть сам. Не жми слишком рано!',
    },
    {
      icon: '🔥',
      title: 'Серии и множитель',
      desc: 'Каждые 3 замри подряд дают множитель очков (до ×3). Открывай достижения и побей рекорд!',
    },
  ]
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="w-full max-w-lg rounded-2xl border border-red-900/50 bg-[#1a0608] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center">
          <motion.div
            className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-red-900/50 ring-2 ring-red-500/40"
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Skull className="h-8 w-8 text-red-300" />
          </motion.div>
          <h2 className="text-xl font-black text-red-200">
            КАК ИГРАТЬ
          </h2>
          <p className="text-xs text-red-300/60">
            Замри, Папайа! — танцевальная игра на реакцию
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {steps.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="flex items-start gap-3 rounded-lg border border-red-900/30 bg-black/30 p-3"
            >
              <span className="text-2xl">{s.icon}</span>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-red-100">
                  {s.title}
                </span>
                <span className="text-[11px] leading-snug text-red-300/60">
                  {s.desc}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
        <Button
          onClick={onClose}
          className="mt-5 w-full bg-red-700 hover:bg-red-600"
        >
          <Play className="mr-1 h-4 w-4" /> Понятно, играть!
        </Button>
      </motion.div>
    </motion.div>
  )
}
