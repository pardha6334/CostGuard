// src/app/api/dev/breach/route.ts
// CostGuard — Simulates a spend breach for testing kill switch UI
// NEVER available in production
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { z } from 'zod'

const Schema = z.object({
  platformId: z.string(),
  burnRate: z.number().min(1).max(10000),
})

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const { platformId, burnRate } = parsed.data

  const platform = await prisma.platform.findUnique({ where: { id: platformId } })
  if (!platform || platform.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Inject fake high burn rate into Redis cache (bypasses real API poll)
  await redis.set(
    `spend:${platformId}:latest`,
    JSON.stringify({ amount: burnRate * 2, burnRate, ts: Date.now() }),
    { ex: 300 }
  )

  // Inject a window that will trigger anomaly detection on next poll
  const fakeWindow = [
    ...Array.from({ length: 15 }, () => 10 + Math.random() * 5), // normal history
    burnRate * 2, // spike at end
  ]
  await redis.set(`window:${platformId}`, JSON.stringify(fakeWindow), { ex: 7200 })

  return NextResponse.json({
    ok: true,
    injected: { platformId, burnRate, message: 'Next poll cycle will trigger kill switch' },
  })
}
