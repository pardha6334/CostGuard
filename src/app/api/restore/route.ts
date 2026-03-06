// src/app/api/restore/route.ts
// CostGuard — Manual restore endpoint, moves breaker to HALF_OPEN
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeRestore } from '@/modules/kill-switch/executor'
import { z } from 'zod'

const Schema = z.object({ platformId: z.string().min(1) })

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = Schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const result = await executeRestore(body.data.platformId, user.id)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'Forbidden' ? 403 : 400 })
  }

  return NextResponse.json({ success: true, method: result.method })
}
