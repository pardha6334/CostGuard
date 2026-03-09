// src/app/api/logs/error-count/route.ts
// CostGuard — Count ERROR logs in last hour (for sidebar badge)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const since = new Date(Date.now() - 60 * 60 * 1000)
  const userPlatformIds = await prisma.platform.findMany({
    where: { userId: user.id },
    select: { id: true },
  }).then((r) => r.map((p) => p.id))

  const count = await prisma.log.count({
    where: {
      level: 'ERROR',
      createdAt: { gte: since },
      platformId: { in: userPlatformIds },
    },
  })

  return NextResponse.json({ count })
}
