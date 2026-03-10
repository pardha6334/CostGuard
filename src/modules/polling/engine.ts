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
import { log } from '@/lib/logger'
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
    const displayName = platform.displayName ?? platform.provider
    console.log(`${tag} ⚡ Starting poll for "${displayName}"`)
    log.info(`Poll triggered for "${displayName}"`, { platformId: platform.id, provider: platform.provider }, platform.id, 'POLL')

    const creds = JSON.parse(decrypt(platform.encryptedCreds)) as Record<string, unknown>
    if (platform.provider === 'ANTHROPIC' && platform.workspaceId != null) {
      creds.workspaceId = platform.workspaceId
    }
    const adapter = getAdapter(platform.provider, creds)

    console.log(`${tag} 📡 Calling adapter.getSpend()...`)
    const t0 = Date.now()
    const spendData = await adapter.getSpend()
    const apiMs = Date.now() - t0
    console.log(`${tag} 💰 getSpend() returned in ${apiMs}ms — amount: $${spendData.amount.toFixed(6)} ${spendData.currency ?? 'usd'} (period: ${spendData.period})`)
    log.info(
      platform.provider === 'ANTHROPIC'
        ? `Spend fetched (Anthropic): $${spendData.amount.toFixed(6)}`
        : `Spend fetched: $${spendData.amount.toFixed(6)} ${spendData.currency ?? 'usd'} (${apiMs}ms)`,
      platform.provider === 'ANTHROPIC'
        ? { amount: spendData.amount, workspaceId: platform.workspaceId, durationMs: apiMs }
        : { amount: spendData.amount, currency: spendData.currency ?? 'usd', period: spendData.period, durationMs: apiMs },
      platform.id,
      'SPEND'
    )

    // Update sliding window in Redis (fast path — no DB write per poll)
    const windowKey = `window:${platform.id}`
    const raw = await redis.get<number[]>(windowKey)
    const window: number[] = Array.isArray(raw) ? raw : []
    const prevWindowSize = window.length
    window.push(spendData.amount)
    // Detect month rollover: new spend < previous by 50%+ means billing reset
    const prevAmount = window[window.length - 2]
    if (prevAmount !== undefined && spendData.amount < prevAmount * 0.5) {
      console.info(`[WINDOW RESET] ${platform.id} — month rollover detected (${prevAmount} → ${spendData.amount})`)
      window.length = 0
      window.push(spendData.amount)
    }
    if (window.length > 60) window.shift()
    await redis.set(windowKey, window, { ex: 7200 })
    console.log(`${tag} 📊 Sliding window updated — size: ${prevWindowSize} → ${window.length}/60`)

    // Calculate burn rate from window
    const calc = new SlidingWindowBurnRate()
    window.forEach((amt, i) =>
      calc.push(amt, Date.now() - (window.length - 1 - i) * 60_000)
    )
    const burnRate = calc.getBurnRatePerHour()
    const overLimit = platform.hourlyLimit > 0 && burnRate > platform.hourlyLimit
    console.log(`${tag} 🔥 Burn rate: $${burnRate.toFixed(6)}/hr (hourly limit: $${platform.hourlyLimit}/hr, daily budget: $${platform.dailyBudget})`)
    log.info(
      `Burn rate: $${burnRate.toFixed(6)}/hr | limit: $${platform.hourlyLimit}/hr | ${overLimit ? 'OVER ⚠️' : 'OK ✅'}`,
      { burnRate, hourlyLimit: platform.hourlyLimit, overLimit, windowSize: window.length },
      platform.id,
      'ENGINE'
    )

    const now = Date.now()
    const previousAmount = window.length >= 2 ? window[window.length - 2] : undefined
    // Cache latest reading for dashboard (15 min TTL — longer than cron interval so UI never drops to 0)
    await redis.set(
      `spend:${platform.id}:latest`,
      { amount: spendData.amount, burnRate, ts: now, previousAmount },
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

async function estimateTodaySpend(window: number[]): Promise<number> {
  const w = window.length >= 24 ? window.slice(-24) : window
  return w.length >= 2 ? Math.max(0, w[w.length - 1] - w[0]) : 0
}

async function resetSlidingWindow(platformId: string): Promise<void> {
  const windowKey = `window:${platformId}`
  const raw = await redis.get<number[]>(windowKey)
  const window: number[] = Array.isArray(raw) ? raw : []
  if (window.length > 0) {
    await redis.set(windowKey, [window[window.length - 1]], { ex: 7200 })
    console.info(`[WINDOW RESET] ${platformId} — month rollover, window reset to single point`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function evaluateAndAct(platform: any): Promise<boolean> {
  const cached = await redis.get<{ amount: number; burnRate: number; ts: number; previousAmount?: number }>(
    `spend:${platform.id}:latest`
  )
  if (!cached) return false

  const { burnRate } = cached
  const window = await redis.get<number[]>(`window:${platform.id}`) ?? []
  const hourlyLimit = platform.hourlyLimit
  const dailyBudget = platform.dailyBudget
  const monthlyBudget = platform.monthlyBudget

  // CHECK A: Hourly burn rate — remove spike requirement for small limits (≤ $10/hr)
  const isOverHourly = burnRate > hourlyLimit
  const requiresSpike = hourlyLimit > 10
  const anomaly = detectAnomaly(window, burnRate)
  const isDefiniteSpike = burnRate > hourlyLimit * 1.5 || anomaly.isAnomaly
  const shouldKillHourly = isOverHourly && (!requiresSpike || isDefiniteSpike)

  // CHECK B: Daily budget
  const todaySpend = await estimateTodaySpend(window)
  const isDailyBreached = Boolean(dailyBudget && todaySpend > dailyBudget)

  // CHECK C: Monthly budget
  const isMonthlyBreached = Boolean(monthlyBudget && cached.amount > monthlyBudget)

  // WARNING alerts (do not kill, just alert)
  const hourlyPct = hourlyLimit > 0 ? burnRate / hourlyLimit : 0
  if (hourlyPct >= 0.9) {
    await sendAlert({
      type: 'warning',
      platform: platform.displayName ?? platform.provider,
      provider: platform.provider,
      burnRate,
      threshold: hourlyLimit,
      projectedSaved: burnRate * 24,
      triggerType: 'WARNING_90PCT',
      user: {
        email: platform.user.email,
        slackWebhook: platform.user.slackWebhook,
        alertEmail: platform.alertEmail,
        alertSlack: platform.alertSlack,
      },
    }).catch((err: Error) => console.error('Warning alert failed:', err.message))
  } else if (hourlyPct >= 0.7 && platform.user.slackWebhook && platform.alertSlack !== false) {
    await sendAlert({
      type: 'warning',
      platform: platform.displayName ?? platform.provider,
      provider: platform.provider,
      burnRate,
      threshold: hourlyLimit,
      projectedSaved: burnRate * 24,
      triggerType: 'WARNING_70PCT',
      user: {
        email: platform.user.email,
        slackWebhook: platform.user.slackWebhook,
        alertEmail: false,
        alertSlack: platform.alertSlack,
      },
    }).catch((err: Error) => console.error('70pct alert failed:', err.message))
  }

  // Priority: HOURLY > DAILY > MONTHLY
  let triggerType: 'HOURLY_LIMIT' | 'DAILY_LIMIT' | 'MONTHLY_LIMIT' | 'SPIKE_DETECTED' | 'MANUAL' | null = null
  let shouldKill = false

  if (shouldKillHourly) {
    triggerType = 'HOURLY_LIMIT'
    shouldKill = true
  } else if (isDailyBreached) {
    triggerType = 'DAILY_LIMIT'
    shouldKill = true
  } else if (isMonthlyBreached) {
    triggerType = 'MONTHLY_LIMIT'
    shouldKill = true
  }

  // Budget restore exemption: HALF_OPEN and last incident was DAILY or MONTHLY — only re-kill on new hourly spike
  const lastTrigger = platform.lastTriggerType as string | null | undefined
  if (platform.breakerState === 'HALF_OPEN') {
    if (
      (lastTrigger === 'DAILY_LIMIT' || lastTrigger === 'MONTHLY_LIMIT') &&
      triggerType !== 'HOURLY_LIMIT'
    ) {
      shouldKill = false
    }
  }

  if (!platform.autoKill) shouldKill = false

  // Month rollover detection
  if (cached.previousAmount != null && cached.amount < cached.previousAmount * 0.5) {
    await resetSlidingWindow(platform.id)
  }

  const cb = new CircuitBreaker(platform.breakerState)
  const action = cb.evaluate(burnRate, hourlyLimit > 0 ? hourlyLimit : Infinity)

  console.info(
    `[ENGINE:CB:${platform.id.slice(-6)}] state: ${platform.breakerState} | action: ${action} | ` +
    `spend: $${cached.amount.toFixed(4)} | burnRate: $${burnRate.toFixed(4)}/hr | limit: $${hourlyLimit}/hr | ` +
    `overLimit: ${isOverHourly} | anomaly: ${anomaly.isAnomaly} | shouldKill: ${shouldKill}`
  )
  log.info(
    `Kill decision: shouldKill=${shouldKill} | trigger=${triggerType ?? 'none'}`,
    { shouldKill, triggerType, burnRate, hourlyLimit, breakerState: platform.breakerState, action },
    platform.id,
    'ENGINE'
  )

  if (shouldKill && (action === 'KILL' || triggerType)) {
    await executeKill({
      platformId: platform.id,
      userId: platform.userId,
      burnRate,
      threshold: hourlyLimit,
      triggerType: triggerType ?? 'HOURLY_LIMIT',
    })
    await sendAlert({
      type: 'kill',
      platform: platform.displayName ?? platform.provider,
      provider: platform.provider,
      burnRate,
      threshold: hourlyLimit,
      projectedSaved: burnRate * 24,
      triggerType: triggerType ?? 'HOURLY_LIMIT',
      user: {
        email: platform.user.email,
        slackWebhook: platform.user.slackWebhook,
        alertEmail: platform.alertEmail,
        alertSlack: platform.alertSlack,
      },
    }).then(() => {
      log.info(`Alert sent: kill`, { channel: 'email+slack', alertType: triggerType ?? 'HOURLY_LIMIT', recipient: platform.user?.email }, platform.id, 'ALERT')
    }).catch((err: Error) => {
      console.error('Kill alert failed:', err.message)
      log.warn(`Alert failed: ${err.message}`, { channel: 'email/slack', alertType: 'kill', error: err.message }, platform.id, 'ALERT')
    })
    return true
  }

  if (action === 'CLOSE') {
    await finalizeRestore(platform.id)
  }

  return false
}
