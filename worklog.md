# Worklog

## 2026-07-02 — Multiplayer Freeze Dance Component

### What was created

1. **`/home/z/my-project/src/components/multiplayer-game.tsx`** (~1560 lines)
   - Complete multiplayer freeze-dance game for 2–4 players on the same device
   - Local shared-keyboard multiplayer with per-player key bindings:
     - P1: `Space` (amber #fbbf24)
     - P2: `KeyF` (cyan #22d3ee)
     - P3: `KeyJ` (emerald #4ade80)
     - P4: `KeyL` (rose #fb7185)
   - Setup screen with player count selector (2/3/4 toggle), per-player name inputs with key indicators, daily challenge toggle, and start button
   - 3-2-1 countdown before game begins
   - Shared music engine (ChuckyEngine) — all players hear the same music, same freeze moment
   - Per-player state tracking: score, freezes, combo, bestCombo, perfectFreezes, bestFreezeTiming, roundHistory, alive/dead
   - Scoring: same formula as solo (`freezes × 100 × comboMultiplier + danceSeconds`), with PERFECT (>66%) ×1.5 and GOOD (>33%) ×1.2 timing bonuses
   - Elimination: pressing during dancing = immediate elimination ("too early"), not pressing in freeze window = elimination ("too slow")
   - Eliminated players: opacity-30, red X overlay, strikethrough name, elimination reason shown
   - Game over when all players eliminated — ranked results, confetti burst, all scores saved to leaderboard API
   - Mobile: per-player touch FREEZE buttons at bottom (colored with player color), hidden on desktop (sm:hidden)
   - Same visual effects as solo: screen shake, freeze vignette, red flash, floating music notes, equalizer, dust motes, confetti
   - Pause/resume with P or Esc
   - Volume control and mute toggle (persisted to localStorage)
   - Daily challenge mode with seeded RNG (same sequence for everyone)
   - Uses `useRef` pattern for all handlers to avoid stale closures (consistent with solo game)
   - All sub-components inlined: StatChip, FloatingNotes, ConfettiBurst, Equalizer, DustMotes

2. **`/home/z/my-project/src/app/page.tsx`** — Mode selector
   - Shows RELAPA title with skull icon on the dark amber stage background
   - Two buttons: "Solo" (amber, User icon) and "Multiplayer (2-4)" (cyan, Users icon)
   - Selecting a mode renders the corresponding game component
   - Description text explains the difference

### Key design decisions

- **Ref-based handler pattern**: All game-critical handlers (handlePlayerFreeze, triggerFreeze, scheduleMusicStop, endRound, allEliminated, startGame, togglePause) are assigned to `useRef` and kept in sync via effects. This prevents stale closures in timers and keyboard event listeners.
- **Single `players` state array**: Instead of separate useState per player, a single array of `PlayerSlot` objects is managed. This allows atomic updates and consistent state.
- **Elimination timing**: When a player presses during dancing, they're eliminated immediately. When the freeze window expires, any player who didn't press is eliminated. A 100ms timeout after window expiry allows React state updates to propagate before checking if anyone remains alive.
- **Score includes dance seconds**: At game over, `Math.floor(danceSeconds)` is added to each player's accumulated score (same formula as solo).
- **All eliminated → game over**: Uses a ref-based `allEliminated` handler with async score saving for each player to the leaderboard API.
- **Daily mode**: Uses the same `mulberry32` seeded RNG and `getTodaySeed()` as solo, so daily challenges are consistent across modes.
- **Back-to-menu button**: Added to header during active game for easy return to the mode selector.---
Task ID: 1
Agent: main (Z.ai Code)
Task: Add multiplayer mode (up to 4 players) to Relapa Freeze Dance game

Work Log:
- Cloned the relapa-freeze-dance repo from GitHub (public, user selfwaisted-max)
- Copied game files (papaya-game.tsx, papaya-character.tsx, music.ts, achievements.ts, globals.css, API route, prisma schema, public images) to /home/z/my-project
- Pushed Prisma schema and verified DB
- Created /src/components/multiplayer-game.tsx (~1570 lines) — complete multiplayer freeze-dance component
- Updated /src/app/page.tsx with mode selector (Solo / Multiplayer)
- Added onBack prop to both PapayaGame and MultiplayerGame for navigation
- Player keys: P1=Space (amber), P2=F (cyan), P3=J (emerald), P4=L (rose)
- Verified via Agent Browser: mode selector, 4-player setup, game over rankings, solo mode, leaderboard API

Stage Summary:
- Multiplayer mode fully functional: 2-4 players, per-player scoring, elimination system, shared music
- Both Solo and Multiplayer modes accessible from main menu
- All scores saved to leaderboard API
- No lint errors, no runtime errors
