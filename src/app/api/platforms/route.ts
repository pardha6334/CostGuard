// src/app/api/platforms/route.ts
// CostGuard — List and add platforms
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { getAdapter } from '@/modules/polling/adapter-factory'
import { z } from 'zod'

const AddSchema = z.object({
  provider: z.enum(['OPENAI', 'ANTHROPIC', 'AWS', 'VERCEL', 'SUPABASE']),
  credentials: z.record(z.string(), z.string()),
  hourlyLimit: z.number().min(1),
  dailyBudget: z.number().min(1),
  displayName: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const platforms = await prisma.platform.findMany({
    where: { userId: user.id, isActive: true },
    select: {
      id: true, provider: true, displayName: true, environment: true,
      hourlyLimit: true, dailyBudget: true, monthlyBudget: true,
      breakerState: true, isActive: true, autoKill: true,
      anomalyDetect: true, alertEmail: true, alertSlack: true, alertWebhook: true,
      lastPolledAt: true,
      // encryptedCreds is NEVER returned
    },
    orderBy: { lastPolledAt: 'desc' },
  })

  return NextResponse.json({ platforms })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = AddSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { provider, credentials, hourlyLimit, dailyBudget, displayName } = parsed.data

  // Test connection before saving anything
  try {
    const adapter = getAdapter(provider, credentials)
    const ok = await adapter.testConnection()
    if (!ok) return NextResponse.json({ error: 'Connection test failed. Check your credentials.' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: `Adapter error: ${String(err)}` }, { status: 400 })
  }

  const platform = await prisma.platform.create({
    data: {
      userId: user.id,
      provider,
      encryptedCreds: encrypt(JSON.stringify(credentials)),
      hourlyLimit,
      dailyBudget,
      monthlyBudget: dailyBudget * 30,
      displayName: displayName ?? provider,
    },
    select: { id: true, provider: true, displayName: true, breakerState: true },
  })

  return NextResponse.json({ platform }, { status: 201 })
}
