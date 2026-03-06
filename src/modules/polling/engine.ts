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
  console.log(`[ENGINE] 🔍 Fetching active platforms from DB...`)
  const platforms = await prisma.platform.findMany({
    where: {
      isActive: true,
      breakerState: { in: ['CLOSED', 'HALF_OPEN'] },
    },
    include: {
      user: { select: { id: true, email: true, slackWebhook: true } },
    },
  })

  console.log(`[ENGINE] 📋 Found ${platforms.length} active platform(s) to poll: [${platforms.map((p: { displayName?: string | null; provider: string; id: string }) => `${p.displayName ?? p.provider}(${p.id.slice(-6)})`).join(', ')}]`)

  let killed = 0
  const errors: string[] = []

  await Promise.allSettled(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platforms.map(async (platform: any) => {
      try {
        await pollSinglePlatform(platform)
        const wasKilled = await evaluateAndAct(platform)
        if (wasKilled) killed++
      } catch (err) {
        const msg = `${platform.provider}:${platform.id} — ${String(err)}`
        errors.push(msg)
        console.error(`[ENGINE] ❌ Platform poll failed: ${msg}`)
      }
    })
  )

  return { polled: platforms.length, killed, errors }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollSinglePlatform(platform: any): Promise<void> {
  const tag = `[ENGINE:${platform.provider.toUpperCase()}:${platform.id.slice(-6)}]`
  // Distributed lock — prevents two workers polling same platform simultaneously
  const lockKey = `lock:poll:${platform.id}`
  const locked = await redis.set(lockKey, '1', { nx: true, ex: 90 })
  if (!locked) {
    console.log(`${tag} ⏭️  Skipped — another worker holds the lock`)
    return
  }

  try {
    console.log(`${tag} ⚡ Starting poll for "${platform.displayName ?? platform.provider}"`)
    const creds = JSON.parse(decrypt(platform.encryptedCreds))
    const adapter = getAdapter(platform.provider, creds)

    console.log(`${tag} 📡 Calling adapter.getSpend()...`)
    const t0 = Date.now()
    const spendData = await adapter.getSpend()
    const apiMs = Date.now() - t0
    console.log(`${tag} 💰 getSpend() returned in ${apiMs}ms — amount: $${spendData.amount.toFixed(6)} ${spendData.currency ?? 'usd'} (period: ${spendData.period})`)

    // Update sliding window in Redis (fast path — no DB write per poll)
    const windowKey = `window:${platform.id}`
    const raw = await redis.get<number[]>(windowKey)
    const window: number[] = Array.isArray(raw) ? raw : []
    const prevWindowSize = window.length
    window.push(spendData.amount)
    if (window.length > 60) window.shift()
    await redis.set(windowKey, window, { ex: 7200 })
    console.log(`${tag} 📊 Sliding window updated — size: ${prevWindowSize} → ${window.length}/60`)

    // Calculate burn rate from window
    const calc = new SlidingWindowBurnRate()
    window.forEach((amt, i) =>
      calc.push(amt, Date.now() - (window.length - 1 - i) * 60_000)
    )
    const burnRate = calc.getBurnRatePerHour()
    console.log(`${tag} 🔥 Burn rate: $${burnRate.toFixed(6)}/hr (hourly limit: $${platform.hourlyLimit}/hr, daily limit: $${platform.dailyLimit})`)

    const now = Date.now()
    // Cache latest reading for dashboard (15 min TTL — longer than cron interval so UI never drops to 0)
    await redis.set(
      `spend:${platform.id}:latest`,
      { amount: spendData.amount, burnRate, ts: now },
      { ex: 900 }
    )
    // Store lastPolledAt in Redis so UI updates even when DB update times out (e.g. serverless statement timeout)
    await redis.set(`lastPolled:${platform.id}`, String(now), { ex: 86400 })
    console.log(`${tag} ✅ Redis updated — spend:latest & lastPolled written (TTL 15min / 24h)`)

    // On Vercel/serverless, skip optional DB writes to avoid exhausting Supabase connection pool.
    // Dashboard uses Redis for lastPolledAt and latest spend; only the initial findMany needs DB.
    if (process.env.VERCEL !== '1') {
      console.log(`${tag} 💾 Writing SpendReading & lastPolledAt to DB (local mode)...`)
      prisma.spendReading
        .create({ data: { platformId: platform.id, amount: spendData.amount, burnRate } })
        .catch((e: Error) => console.error(`${tag} ❌ SpendReading write failed:`, e.message))
      prisma.platform
        .update({ where: { id: platform.id }, data: { lastPolledAt: new Date(now) } })
        .catch((e: Error) => console.error(`${tag} ❌ lastPolledAt update failed:`, e.message))
    } else {
      console.log(`${tag} ⏭️  Skipping DB writes on Vercel (Redis is source of truth for UI)`)
    }
  } finally {
    await redis.del(lockKey)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function evaluateAndAct(platform: any): Promise<boolean> {
  const tag = `[ENGINE:CB:${platform.id.slice(-6)}]`
  const cached = await redis.get<{ amount: number; burnRate: number; ts: number }>(
    `spend:${platform.id}:latest`
  )
  if (!cached) {
    console.warn(`${tag} ⚠️  No cached spend found in Redis — skipping circuit breaker evaluation`)
    return false
  }

  const { burnRate, amount } = cached
  const window = await redis.get<number[]>(`window:${platform.id}`) ?? []

  const cb = new CircuitBreaker(platform.breakerState)
  const anomaly = detectAnomaly(window, burnRate)

  // Kill condition: burn rate exceeded AND (anomaly detected OR rate is 150%+ of limit)
  const isOverLimit = burnRate > platform.hourlyLimit
  const isDefiniteSpike = burnRate > platform.hourlyLimit * 1.5
  const shouldKill = isOverLimit && (anomaly.isAnomaly || isDefiniteSpike) && platform.autoKill

  const action = cb.evaluate(burnRate, platform.hourlyLimit)

  console.log(
    `${tag} 🔌 Circuit breaker — state: ${platform.breakerState} | action: ${action} | ` +
    `spend: $${amount.toFixed(6)} | burnRate: $${burnRate.toFixed(6)}/hr | ` +
    `limit: $${platform.hourlyLimit}/hr | overLimit: ${isOverLimit} | anomaly: ${anomaly.isAnomaly} | shouldKill: ${shouldKill}`
  )

  if (action === 'KILL' && shouldKill) {
    console.log(`${tag} 🔴 KILL triggered! Executing kill switch...`)
    await executeKill({
      platformId: platform.id,
      userId: platform.userId,
      burnRate,
      threshold: platform.hourlyLimit,
      triggerType: anomaly.isAnomaly ? 'SPIKE_DETECTED' : 'HOURLY_LIMIT',
    })
    console.log(`${tag} 📣 Sending kill alert...`)
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
    }).catch((err: Error) => console.error(`${tag} ❌ Alert dispatch failed:`, err.message))
    return true
  }

  // HALF_OPEN: if stable for full window, finalize restore
  if (action === 'CLOSE') {
    console.log(`${tag} 🟢 Burn rate stable — finalizing restore (HALF_OPEN → CLOSED)`)
    await finalizeRestore(platform.id)
  }

  return false
}
