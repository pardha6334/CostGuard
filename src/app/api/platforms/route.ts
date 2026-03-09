// src/app/api/platforms/route.ts
// CostGuard — List and add platforms
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
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

  const where: { userId: string; isActive: boolean; id?: { not: { startsWith: string } } } = {
    userId: user.id,
    isActive: true,
  }
  // In production, hide dev-seeded platforms (id starts with dev-)
  if (process.env.NODE_ENV === 'production') {
    where.id = { not: { startsWith: 'dev-' } }
  }
  const platformsFromDb = await prisma.platform.findMany({
    where,
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

  // Enrich with live data from Redis (burn rate, spend, lastPolledAt) so UI updates without DB dependency
  // If Redis is down, fall back to DB-only so the dashboard still loads
  // Normalize spend:latest — Redis REST can return JSON as string in some runtimes, so parse if needed
  type SpendLatest = { amount: number; burnRate: number; ts: number } | null
  function normalizeSpendLatest(raw: unknown): SpendLatest {
    if (raw == null) return null
    if (typeof raw === 'object' && 'amount' in (raw as object) && 'burnRate' in (raw as object)) return raw as SpendLatest
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as SpendLatest
        return parsed && typeof parsed.amount === 'number' ? parsed : null
      } catch {
        return null
      }
    }
    return null
  }

  let platforms
  try {
    platforms = await Promise.all(
      platformsFromDb.map(async (p) => {
        const [rawLatest, lastPolledTs] = await Promise.all([
          redis.get(`spend:${p.id}:latest`),
          redis.get<string>(`lastPolled:${p.id}`),
        ])
        const latest = normalizeSpendLatest(rawLatest)
        const ts = lastPolledTs != null ? Number(lastPolledTs) : NaN
        const lastPolledAt = !Number.isNaN(ts)
          ? new Date(ts).toISOString()
          : (p.lastPolledAt?.toISOString() ?? null)
        return {
          ...p,
          lastPolledAt,
          burnRate: latest?.burnRate ?? 0,
          spendToday: latest?.amount ?? 0,
        }
      })
    )
  } catch {
    platforms = platformsFromDb.map((p) => ({
      ...p,
      lastPolledAt: p.lastPolledAt?.toISOString() ?? null,
      burnRate: 0,
      spendToday: 0,
    }))
  }

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
