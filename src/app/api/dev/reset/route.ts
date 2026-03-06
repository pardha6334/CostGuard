// src/app/api/dev/reset/route.ts
// CostGuard — Wipes dev seed data and Redis cache for clean re-test
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const devPlatformIds = ['dev-openai-1', 'dev-anthropic-1', 'dev-aws-1']

  // Clear DB in dependency order (incidents → readings → platforms)
  await prisma.incident.deleteMany({
    where: { userId: user.id, platformId: { in: devPlatformIds } },
  })
  await prisma.spendReading.deleteMany({
    where: { platformId: { in: devPlatformIds } },
  })
  await prisma.platform.deleteMany({
    where: { id: { in: devPlatformIds }, userId: user.id },
  })

  // Clear Redis keys (including lastPolled so UI does not show stale poll time after re-seed)
  for (const id of devPlatformIds) {
    await redis.del(`spend:${id}:latest`)
    await redis.del(`lastPolled:${id}`)
    await redis.del(`window:${id}`)
    await redis.del(`lock:poll:${id}`)
  }

  // Restore any remaining user platforms to CLOSED state
  await prisma.platform.updateMany({
    where: { userId: user.id },
    data: { breakerState: 'CLOSED' },
  })

  return NextResponse.json({ ok: true, cleared: devPlatformIds })
}
