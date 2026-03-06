// src/app/api/incidents/route.ts
// CostGuard — List incidents with optional filters
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { IncidentStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const platformId = searchParams.get('platformId')
  const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Number.isNaN(limitRaw) ? 50 : Math.min(Math.max(1, limitRaw), 200)

  const validStatuses: IncidentStatus[] = ['ACTIVE', 'RESTORING', 'RESOLVED']
  const status = statusParam && validStatuses.includes(statusParam as IncidentStatus)
    ? (statusParam as IncidentStatus)
    : undefined

  const where: Prisma.IncidentWhereInput = {
    userId: user.id,
    ...(status ? { status } : {}),
    ...(platformId ? { platformId } : {}),
  }
  // In production, hide dev-seeded incidents (id starts with dev-inc-)
  if (process.env.NODE_ENV === 'production') {
    where.id = { not: { startsWith: 'dev-inc-' } }
  }
  const incidents = await prisma.incident.findMany({
    where,
    include: {
      platform: { select: { provider: true, displayName: true } },
    },
    orderBy: { killedAt: 'desc' },
    take: limit,
  })

  const totalSaved = incidents.reduce((s, i) => s + i.estimatedSaved, 0)

  return NextResponse.json({ incidents, totalSaved, count: incidents.length })
}
