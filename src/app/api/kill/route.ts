// src/app/api/kill/route.ts
// CostGuard — Manual kill switch endpoint
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeKill } from '@/modules/kill-switch/executor'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const Schema = z.object({ platformId: z.string().min(1) })

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = Schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const platform = await prisma.platform.findUnique({ where: { id: body.data.platformId } })
  if (!platform || platform.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (platform.breakerState === 'OPEN') {
    return NextResponse.json({ error: 'Already killed' }, { status: 409 })
  }

  const result = await executeKill({
    platformId: platform.id,
    userId: user.id,
    burnRate: 0,
    threshold: platform.hourlyLimit,
    triggerType: 'MANUAL',
  })

  return NextResponse.json({ success: result.success, method: result.method })
}
