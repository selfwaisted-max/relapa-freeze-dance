'use client'
import { useState } from 'react'
import PapayaGame from '@/components/papaya-game'
import MultiplayerGame from '@/components/multiplayer-game'
import { Button } from '@/components/ui/button'
import { Skull, Users, User } from 'lucide-react'

type GameMode = 'solo' | 'multiplayer' | null

export default function Home() {
  const [mode, setMode] = useState<GameMode>(null)

  if (mode === 'solo') return <PapayaGame onBack={() => setMode(null)} />
  if (mode === 'multiplayer') return <MultiplayerGame onBack={() => setMode(null)} />

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#1a1410] text-foreground">
      <div className="pointer-events-none fixed inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: "url('/relapa-stage.png')" }} />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#1a1410]/50 via-[#1a1410]/65 to-[#0e0a06]" />
      <div className="pointer-events-none fixed inset-0 spotlight-glow" />
      
      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-900/60 ring-2 ring-red-500/40">
          <Skull className="h-10 w-10 text-red-300" />
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-amber-200">RELAPA</h1>
          <p className="mt-1 text-sm text-amber-300/70">Freeze Dance Game</p>
        </div>
        <div className="flex flex-col gap-3 w-64">
          <Button
            onClick={() => setMode('solo')}
            className="h-14 bg-amber-800 hover:bg-amber-700 text-base font-bold gap-2"
          >
            <User className="h-5 w-5" /> Solo
          </Button>
          <Button
            onClick={() => setMode('multiplayer')}
            className="h-14 bg-cyan-800 hover:bg-cyan-700 text-base font-bold gap-2"
          >
            <Users className="h-5 w-5" /> Multiplayer (2-4)
          </Button>
        </div>
        <p className="max-w-sm text-center text-xs text-amber-300/50">
          Solo: one player, one keyboard. Multiplayer: up to 4 players on the same device — each has their own key!
        </p>
      </div>
    </div>
  )
}