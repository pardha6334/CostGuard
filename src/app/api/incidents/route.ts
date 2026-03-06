// src/app/api/incidents/route.ts
// CostGuard — List incidents with optional filters
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const platformId = searchParams.get('platformId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  const incidents = await prisma.incident.findMany({
    where: {
      userId: user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(status ? { status: status as any } : {}),
      ...(platformId ? { platformId } : {}),
    },
    include: {
      platform: { select: { provider: true, displayName: true } },
    },
    orderBy: { killedAt: 'desc' },
    take: limit,
  })

  const totalSaved = incidents.reduce((s, i) => s + i.estimatedSaved, 0)

  return NextResponse.json({ incidents, totalSaved, count: incidents.length })
}
