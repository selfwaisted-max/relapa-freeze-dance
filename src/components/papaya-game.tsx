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
} from 'lucide-react'

type GameState = 'idle' | 'dancing' | 'freeze' | 'frozen' | 'gameover'

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

const FREEZE_WINDOW_BY_ROUND: Record<number, number> = {}
for (let r = 1; r <= 2; r++) FREEZE_WINDOW_BY_ROUND[r] = 1500
for (let r = 3; r <= 4; r++) FREEZE_WINDOW_BY_ROUND[r] = 1350
for (let r = 5; r <= 6; r++) FREEZE_WINDOW_BY_ROUND[r] = 1150
for (let r = 7; r <= 9; r++) FREEZE_WINDOW_BY_ROUND[r] = 950
const getFreezeWindow = (round: number) =>
  FREEZE_WINDOW_BY_ROUND[round] ?? 850

function randMusicDuration() {
  // music plays between 3.0s and 6.5s before stopping
  return 3000 + Math.random() * 3500
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

  // keep state ref in sync for the key handler
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    roundRef.current = round
  }, [round])

  const score = freezes * 100 + Math.floor(danceSeconds)

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
    engineRef.current?.sting('fail')
    setFailReason(reason)
    setState('gameover')

    // save score once
    if (!savedThisRun) {
      setSavedThisRun(true)
      const name = playerName.trim() || 'Аноним'
      const finalScore = freezes * 100 + Math.floor(danceSeconds)
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
          setLastSavedRank(idx >= 0 ? idx + 1 : null)
        }
      } catch {
        /* ignore */
      }
    }
  }

  const triggerFreeze = () => {
    setState('freeze')
    stopDanceTimer()
    engineRef.current?.stop()
    const win = getFreezeWindow(roundRef.current)
    freezeWindowRef.current = win
    freezeStartRef.current = performance.now()
    setFreezeProgress(1)

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
    }, randMusicDuration())
  }

  const onSuccess = () => {
    if (freezeWindowTimer.current) clearTimeout(freezeWindowTimer.current)
    if (freezeAnimRef.current) cancelAnimationFrame(freezeAnimRef.current)
    setState('frozen')
    const newFreezes = freezes + 1
    const newRound = round + 1
    setFreezes(newFreezes)
    setRound(newRound)
    engineRef.current?.sting('success')
    showFlash(`Замри! +${newRound - 1} 👍`)

    frozenResumeTimer.current = setTimeout(() => {
      setState('dancing')
      engineRef.current?.start()
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

  // ----- key handler (mounted once) -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      const s = stateRef.current
      if (s === 'dancing') {
        // pressed space while music still playing => too early
        gameOverRef.current('early')
      } else if (s === 'freeze') {
        onSuccessRef.current()
      }
      // ignore in other states
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ----- start / restart -----
  const startGame = async () => {
    if (!engineRef.current) engineRef.current = new ChuckyEngine()
    await engineRef.current.init()
    setDanceSeconds(0)
    setFreezes(0)
    setRound(1)
    setFailReason(null)
    setSavedThisRun(false)
    setLastSavedRank(null)
    setFreezeProgress(1)
    setState('dancing')
    await engineRef.current.start()
    startDanceTimer()
    scheduleMusicStop()
  }

  const isPlaying = state === 'dancing' || state === 'freeze' || state === 'frozen'
  const dancing = state === 'dancing'
  const showFreezeOverlay = state === 'freeze'

  return (
    <div className="min-h-screen flex flex-col bg-[#1a0608] text-foreground">
      {/* atmospheric background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40 bg-cover bg-center"
        style={{ backgroundImage: "url('/stage-bg.png')" }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#1a0608]/70 via-[#1a0608]/85 to-[#0a0203]" />
      {/* spotlight */}
      <div className="pointer-events-none fixed inset-0 spotlight-glow" />

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
          <div className="flex items-center gap-2 sm:gap-3">
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
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 px-4 py-5 lg:grid-cols-[1fr_340px]">
        {/* STAGE */}
        <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden rounded-2xl border border-red-900/40 bg-gradient-to-b from-[#2a0a0e]/80 to-[#150406]/90 p-4 shadow-[0_0_60px_-15px_rgba(220,38,38,0.5)]">
          {/* stage curtains top */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-red-950/80 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />

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

            {/* the papaya */}
            <AnimatePresence mode="wait">
              {state === 'idle' ? (
                <motion.img
                  key="idle"
                  src="/papaya-dance.png"
                  alt="Папайа"
                  className="h-[280px] w-auto drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)] sm:h-[320px]"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, rotate: [0, -3, 3, -3, 0] }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ rotate: { duration: 2.4, repeat: Infinity } }}
                />
              ) : (
                <motion.img
                  key="active"
                  src={dancing || showFreezeOverlay ? '/papaya-dance.png' : '/papaya-frozen.png'}
                  alt="Папайа"
                  className="h-[280px] w-auto select-none drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)] sm:h-[320px]"
                  animate={
                    dancing
                      ? {
                          y: [0, -22, 0, -14, 0],
                          rotate: [-4, 5, -6, 4, -4],
                          scaleX: [1, 0.94, 1.06, 0.96, 1],
                        }
                      : showFreezeOverlay
                        ? {
                            y: [0, -10, 0],
                            rotate: [-2, 2, -2],
                            transition: { duration: 0.3, repeat: Infinity },
                          }
                        : state === 'frozen'
                          ? { rotate: -2, scale: 1.02 }
                          : { rotate: 0, scale: 1 }
                  }
                  transition={
                    dancing
                      ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.2 }
                  }
                />
              )}
            </AnimatePresence>

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
                    Введи имя и начинай. Когда музыка резко стихнет — жми{' '}
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-red-200">
                      ПРОБЕЛ
                    </kbd>
                    , чтобы замереть. Не жми слишком рано!
                  </p>
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
                </motion.div>
              )}

              {isPlaying && (
                <motion.div
                  key="playing-panel"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-center text-xs text-red-200/70"
                >
                  <kbd className="rounded bg-white/10 px-2 py-1 font-mono text-red-100">
                    ПРОБЕЛ
                  </kbd>
                  = замереть, когда музыка стихнет
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
                  <div className="flex flex-wrap items-center justify-center gap-2 text-center">
                    <Badge className="bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40">
                      Счёт: {score}
                    </Badge>
                    <Badge className="bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40">
                      Замри: {freezes}
                    </Badge>
                    <Badge className="bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40">
                      В танце: {danceSeconds.toFixed(1)}с
                    </Badge>
                    {lastSavedRank && lastSavedRank <= 20 && (
                      <Badge className="bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40">
                        <Crown className="mr-1 h-3 w-3" />#{lastSavedRank} в таблице
                      </Badge>
                    )}
                  </div>
                  <Button
                    onClick={startGame}
                    className="bg-red-700 hover:bg-red-600"
                  >
                    <RotateCcw className="mr-1 h-4 w-4" /> Ещё раз
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ===== LEADERBOARD ===== */}
        <aside className="relative">
          <Card className="flex h-full max-h-[80vh] flex-col border-red-900/40 bg-black/50 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-red-900/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                <h2 className="text-sm font-bold tracking-wide text-amber-200">
                  ЛИДЕРБОРД
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchLeaderboard}
                className="h-7 px-2 text-xs text-red-300/70 hover:text-red-200"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
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
                    {leaderboard.map((s, i) => (
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
                        }`}
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
                          <span className="truncate font-semibold text-red-100">
                            {s.playerName}
                          </span>
                          <span className="text-[10px] text-red-300/60">
                            {s.freezes} замри · {s.danceSeconds}с
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-sm font-bold text-amber-300">
                          {s.score}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </ScrollArea>
            <Separator className="bg-red-900/30" />
            <div className="px-4 py-2 text-center text-[10px] text-red-300/50">
              Очки = замри × 100 + секунды в танце
            </div>
          </Card>
        </aside>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 mt-auto border-t border-red-900/40 bg-black/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-3 text-center text-xs text-red-300/60 sm:flex-row sm:text-left">
          <span>
            🥭 Папайа танцует под жуткую мелодию. Успей замереть, когда музыка
            стихнет!
          </span>
          <span className="flex items-center gap-2">
            <Music2 className="h-3 w-3" /> Музыка генерируется в реальном времени
          </span>
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
