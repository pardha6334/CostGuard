// src/modules/polling/engine.ts
// CostGuard — Main poll cycle: fetches spend, evaluates circuit breakers, fires kills
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { decrypt } from '@/lib/crypto'
import { SlidingWindowBurnRate } from '@/modules/circuit-breaker/burn-rate'
import { CircuitBreaker } from '@/modules/circuit-breaker/state-machine'
import { detectAnomaly } from '@/modules/circuit-breaker/anomaly'
import { executeKill, finalizeRestore } from '@/modules/kill-switch/executor'
import { sendAlert } from '@/modules/alerts/dispatcher'
import { getAdapter } from './adapter-factory'

export async function runPollCycle(): Promise<{ polled: number; killed: number; errors: string[] }> {
  const platforms = await prisma.platform.findMany({
    where: {
      isActive: true,
      breakerState: { in: ['CLOSED', 'HALF_OPEN'] },
    },
    include: {
      user: { select: { id: true, email: true, slackWebhook: true } },
    },
  })

  let killed = 0
  const errors: string[] = []

  await Promise.allSettled(
    platforms.map(async (platform) => {
      try {
        await pollSinglePlatform(platform)
        const wasKilled = await evaluateAndAct(platform)
        if (wasKilled) killed++
      } catch (err) {
        errors.push(`${platform.provider}:${platform.id} — ${String(err)}`)
      }
    })
  )

  return { polled: platforms.length, killed, errors }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollSinglePlatform(platform: any): Promise<void> {
  // Distributed lock — prevents two workers polling same platform simultaneously
  const lockKey = `lock:poll:${platform.id}`
  const locked = await redis.set(lockKey, '1', { nx: true, ex: 90 })
  if (!locked) return // Another worker has the lock

  try {
    const creds = JSON.parse(decrypt(platform.encryptedCreds))
    const adapter = getAdapter(platform.provider, creds)
    const spendData = await adapter.getSpend()

    // Update sliding window in Redis (fast path — no DB write per poll)
    const windowKey = `window:${platform.id}`
    const raw = await redis.get<number[]>(windowKey)
    const window: number[] = Array.isArray(raw) ? raw : []
    window.push(spendData.amount)
    if (window.length > 60) window.shift()
    await redis.set(windowKey, window, { ex: 7200 })

    // Calculate burn rate from window
    const calc = new SlidingWindowBurnRate()
    window.forEach((amt, i) =>
      calc.push(amt, Date.now() - (window.length - 1 - i) * 60_000)
    )
    const burnRate = calc.getBurnRatePerHour()

    const now = Date.now()
    // Cache latest reading for dashboard (5 min TTL)
    await redis.set(
      `spend:${platform.id}:latest`,
      { amount: spendData.amount, burnRate, ts: now },
      { ex: 300 }
    )
    // Store lastPolledAt in Redis so UI updates even when DB update times out (e.g. serverless statement timeout)
    await redis.set(`lastPolled:${platform.id}`, String(now), { ex: 86400 })

    // On Vercel/serverless, skip optional DB writes to avoid exhausting Supabase connection pool.
    // Dashboard uses Redis for lastPolledAt and latest spend; only the initial findMany needs DB.
    if (process.env.VERCEL !== '1') {
      prisma.spendReading
        .create({ data: { platformId: platform.id, amount: spendData.amount, burnRate } })
        .catch((e: Error) => console.error('SpendReading write failed:', e.message))
      prisma.platform
        .update({ where: { id: platform.id }, data: { lastPolledAt: new Date(now) } })
        .catch((e: Error) => console.error('lastPolledAt update failed:', e.message))
    }
  } finally {
    await redis.del(lockKey)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function evaluateAndAct(platform: any): Promise<boolean> {
  const cached = await redis.get<{ amount: number; burnRate: number; ts: number }>(
    `spend:${platform.id}:latest`
  )
  if (!cached) return false

  const { burnRate } = cached
  const window = await redis.get<number[]>(`window:${platform.id}`) ?? []

  const cb = new CircuitBreaker(platform.breakerState)
  const anomaly = detectAnomaly(window, burnRate)

  // Kill condition: burn rate exceeded AND (anomaly detected OR rate is 150%+ of limit)
  const isOverLimit = burnRate > platform.hourlyLimit
  const isDefiniteSpike = burnRate > platform.hourlyLimit * 1.5
  const shouldKill = isOverLimit && (anomaly.isAnomaly || isDefiniteSpike) && platform.autoKill

  const action = cb.evaluate(burnRate, platform.hourlyLimit)

  if (action === 'KILL' && shouldKill) {
    await executeKill({
      platformId: platform.id,
      userId: platform.userId,
      burnRate,
      threshold: platform.hourlyLimit,
      triggerType: anomaly.isAnomaly ? 'SPIKE_DETECTED' : 'HOURLY_LIMIT',
    })
    await sendAlert({
      type: 'kill',
      platform: platform.displayName ?? platform.provider,
      provider: platform.provider,
      burnRate,
      threshold: platform.hourlyLimit,
      projectedSaved: burnRate * 24,
      triggerType: anomaly.isAnomaly ? 'SPIKE_DETECTED' : 'HOURLY_LIMIT',
      user: {
        email: platform.user.email,
        slackWebhook: platform.user.slackWebhook,
        alertEmail: platform.alertEmail,
        alertSlack: platform.alertSlack,
      },
    }).catch((err: Error) => console.error('Alert dispatch failed:', err.message))
    return true
  }

  // HALF_OPEN: if stable for full window, finalize restore
  if (action === 'CLOSE') {
    await finalizeRestore(platform.id)
  }

  return false
}
