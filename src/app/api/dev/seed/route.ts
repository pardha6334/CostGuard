// src/app/api/dev/seed/route.ts
// CostGuard — Seeds fake platform + incident data for local testing
// NEVER available in production
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  let user: { id: string; email?: string } | null = null
  try {
    const supabase = createClient()
    const { data: { user: u } } = await supabase.auth.getUser()
    user = u ?? null
  } catch (e) {
    return NextResponse.json({ error: 'Auth failed', detail: String(e) }, { status: 500 })
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Ensure Prisma User row exists (Supabase Auth does not create it). Platform has FK to User.
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email ?? `dev-${user.id.slice(0, 8)}@local`,
        plan: 'TRIAL',
      },
    })

    const fakeCreds = encrypt(JSON.stringify({
      adminKey: 'sk-dev-fake-key-for-testing-only',
      projectId: 'proj_devtest',
    }))

    const platforms = await Promise.all([
    prisma.platform.upsert({
      where: { id: 'dev-openai-1' },
      update: {},
      create: {
        id: 'dev-openai-1',
        userId: user.id,
        provider: 'OPENAI',
        encryptedCreds: fakeCreds,
        displayName: 'OpenAI (dev)',
        environment: 'development',
        hourlyLimit: 50,
        dailyBudget: 200,
        monthlyBudget: 3000,
        breakerState: 'CLOSED',
        isActive: true,
        autoKill: true,
      },
    }),
    prisma.platform.upsert({
      where: { id: 'dev-anthropic-1' },
      update: {},
      create: {
        id: 'dev-anthropic-1',
        userId: user.id,
        provider: 'ANTHROPIC',
        encryptedCreds: fakeCreds,
        displayName: 'Anthropic (dev)',
        environment: 'development',
        hourlyLimit: 30,
        dailyBudget: 150,
        monthlyBudget: 2000,
        breakerState: 'CLOSED',
        isActive: true,
        autoKill: true,
      },
    }),
    prisma.platform.upsert({
      where: { id: 'dev-aws-1' },
      update: {},
      create: {
        id: 'dev-aws-1',
        userId: user.id,
        provider: 'AWS',
        encryptedCreds: fakeCreds,
        displayName: 'AWS (dev)',
        environment: 'us-east-1',
        hourlyLimit: 100,
        dailyBudget: 500,
        monthlyBudget: 8000,
        breakerState: 'CLOSED',
        isActive: true,
        autoKill: true,
      },
    }),
    ])

    // Seed fake spend readings (60 minutes of history, 3-min intervals)
    const now = Date.now()
    for (const platform of platforms) {
      const readings = Array.from({ length: 20 }, (_, i) => ({
        platformId: platform.id,
        amount: 10 + i * 2 + Math.random() * 3,
        burnRate: 15 + Math.random() * 10,
        recordedAt: new Date(now - (20 - i) * 180_000),
      }))
      await prisma.spendReading.createMany({ data: readings, skipDuplicates: true })
    }

    // Seed 2 fake resolved incidents
    await prisma.incident.createMany({
      skipDuplicates: true,
      data: [
      {
        id: 'dev-inc-001',
        userId: user.id,
        platformId: 'dev-openai-1',
        triggerType: 'SPIKE_DETECTED',
        spendAtTrigger: 45.20,
        burnRateAtKill: 312.50,
        thresholdLimit: 50,
        estimatedSaved: 7500,
        status: 'RESOLVED',
        killedAt: new Date(now - 3 * 3600_000),
        resolvedAt: new Date(now - 2.5 * 3600_000),
        durationSecs: 1800,
        resolvedByUserId: user.id,
      },
      {
        id: 'dev-inc-002',
        userId: user.id,
        platformId: 'dev-aws-1',
        triggerType: 'HOURLY_LIMIT',
        spendAtTrigger: 102.80,
        burnRateAtKill: 450.00,
        thresholdLimit: 100,
        estimatedSaved: 10800,
        status: 'RESOLVED',
        killedAt: new Date(now - 26 * 3600_000),
        resolvedAt: new Date(now - 25 * 3600_000),
        durationSecs: 3600,
        resolvedByUserId: user.id,
      },
      ],
    })

    return NextResponse.json({
      ok: true,
      seeded: {
        platforms: platforms.length,
        incidents: 2,
        readings: platforms.length * 20,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Seed failed', detail: String(e) }, { status: 500 })
  }
}
