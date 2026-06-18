import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') // 'today' or null
    const where =
      filter === 'today'
        ? {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          }
        : {}
    const scores = await db.score.findMany({
      where,
      orderBy: [{ score: 'desc' }, { danceSeconds: 'desc' }],
      take: 20,
    })
    return NextResponse.json({ scores })
  } catch (error) {
    console.error('Failed to fetch leaderboard:', error)
    return NextResponse.json({ scores: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { playerName, score, danceSeconds, freezes, rounds } = body as {
      playerName?: string
      score?: number
      danceSeconds?: number
      freezes?: number
      rounds?: number
    }

    if (!playerName || typeof playerName !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (typeof score !== 'number' || score < 0) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
    }

    const created = await db.score.create({
      data: {
        playerName: playerName.trim().slice(0, 24) || 'Anonymous',
        score: Math.floor(score),
        danceSeconds: Math.floor(danceSeconds ?? 0),
        freezes: Math.floor(freezes ?? 0),
        rounds: Math.floor(rounds ?? 0),
      },
    })

    return NextResponse.json({ ok: true, score: created })
  } catch (error) {
    console.error('Failed to save score:', error)
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 })
  }
}
