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
    console.log(`${tag} 🔥 Burn rate: $${burnRate.toFixed(6)}/hr (hourly limit: $${platform.hourlyLimit}/hr, daily budget: $${platform.dailyBudget})`)

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
  const cached = await redis.get<{ amount: number; burnRate: number; ts: number }>(
    `spend:${platform.id}:latest`
  )
  if (!cached) return false

  const { burnRate } = cached
  const window = await redis.get<number[]>(`window:${platform.id}`) ?? []

  // Check A: Hourly burn rate
  const isOverLimit = platform.hourlyLimit > 0 && burnRate > platform.hourlyLimit
  const requiresSpike = platform.hourlyLimit > 10
  const anomaly = detectAnomaly(window, burnRate)
  const isDefiniteSpike = burnRate > platform.hourlyLimit * 1.5

  // Check B: Daily budget — approximate today's spend from last 24 readings
  const window24 = window.slice(-24)
  const todayApprox = window24.length > 1
    ? Math.max(0, window24[window24.length - 1] - window24[0])
    : 0
  const isDailyBreached = platform.dailyBudget > 0 && todayApprox > platform.dailyBudget

  // Check C: Monthly budget — cached.amount is monthly cumulative spend
  const monthlySpend = cached.amount
  const isMonthlyBreached = platform.monthlyBudget > 0 && monthlySpend > platform.monthlyBudget

  // Budget restore exemption: if HALF_OPEN and last kill was daily/monthly, don't re-kill on budget — only on new hourly spike
  let restoringFromBudget = false
  if (platform.breakerState === 'HALF_OPEN') {
    const lastIncident = await prisma.incident.findFirst({
      where: { platformId: platform.id, status: { in: ['ACTIVE', 'RESTORING'] } },
      orderBy: { killedAt: 'desc' },
    })
    restoringFromBudget =
      lastIncident?.triggerType === 'DAILY_LIMIT' ||
      lastIncident?.triggerType === 'MONTHLY_LIMIT'
  }

  const anyBreach = isOverLimit || isDailyBreached || isMonthlyBreached
  const hourlyOk = !requiresSpike || anomaly.isAnomaly || isDefiniteSpike
  const shouldKill = restoringFromBudget
    ? (isOverLimit && hourlyOk)
    : (anyBreach && (isOverLimit ? hourlyOk : true)) && platform.autoKill

  const triggerType =
    isOverLimit && (!requiresSpike || isDefiniteSpike || anomaly.isAnomaly) ? 'HOURLY_LIMIT'
    : isDailyBreached ? 'DAILY_LIMIT'
    : isMonthlyBreached ? 'MONTHLY_LIMIT'
    : anomaly.isAnomaly ? 'SPIKE_DETECTED'
    : 'HOURLY_LIMIT'

  const cb = new CircuitBreaker(platform.breakerState)
  const action = cb.evaluate(burnRate, platform.hourlyLimit > 0 ? platform.hourlyLimit : Infinity)

  console.info(
    `[ENGINE:CB:${platform.id.slice(-6)}] state: ${platform.breakerState} | action: ${action} | ` +
    `burnRate: $${burnRate.toFixed(4)}/hr | hourlyLimit: $${platform.hourlyLimit}/hr | ` +
    `daily: ${isDailyBreached ? 'BREACH' : 'ok'} | monthly: ${isMonthlyBreached ? 'BREACH' : 'ok'} | ` +
    `shouldKill: ${shouldKill}`
  )

  // Warning alerts (70% and 90%) — before kill check
  if (!shouldKill && platform.autoKill) {
    const hourlyPct = platform.hourlyLimit > 0 ? burnRate / platform.hourlyLimit : 0
    const dailyPct = platform.dailyBudget > 0 ? todayApprox / platform.dailyBudget : 0
    const monthlyPct = platform.monthlyBudget > 0 ? monthlySpend / platform.monthlyBudget : 0
    const worstPct = Math.max(hourlyPct, dailyPct, monthlyPct)

    if (worstPct >= 0.9) {
      await sendAlert({
        type: 'warning',
        platform: platform.displayName ?? platform.provider,
        provider: platform.provider,
        burnRate,
        threshold: platform.hourlyLimit,
        projectedSaved: burnRate * 24,
        triggerType: `WARNING_${Math.round(worstPct * 100)}PCT`,
        user: {
          email: platform.user.email,
          slackWebhook: platform.user.slackWebhook,
          alertEmail: platform.alertEmail,
          alertSlack: platform.alertSlack,
        },
      }).catch((err: Error) => console.error('Warning alert failed:', err.message))
    } else if (worstPct >= 0.7) {
      if (platform.user.slackWebhook && platform.alertSlack !== false) {
        await sendAlert({
          type: 'warning',
          platform: platform.displayName ?? platform.provider,
          provider: platform.provider,
          burnRate,
          threshold: platform.hourlyLimit,
          projectedSaved: burnRate * 24,
          triggerType: `APPROACHING_LIMIT_${Math.round(worstPct * 100)}PCT`,
          user: {
            email: platform.user.email,
            slackWebhook: platform.user.slackWebhook,
            alertEmail: false,
            alertSlack: platform.alertSlack,
          },
        }).catch((err: Error) => console.error('70pct alert failed:', err.message))
      }
    }
  }

  if (shouldKill && (action === 'KILL' || anyBreach)) {
    await executeKill({
      platformId: platform.id,
      userId: platform.userId,
      burnRate,
      threshold: platform.hourlyLimit,
      triggerType,
    })
    await sendAlert({
      type: 'kill',
      platform: platform.displayName ?? platform.provider,
      provider: platform.provider,
      burnRate,
      threshold: platform.hourlyLimit,
      projectedSaved: burnRate * 24,
      triggerType,
      user: {
        email: platform.user.email,
        slackWebhook: platform.user.slackWebhook,
        alertEmail: platform.alertEmail,
        alertSlack: platform.alertSlack,
      },
    }).catch((err: Error) => console.error('Kill alert failed:', err.message))
    return true
  }

  if (action === 'CLOSE') {
    await finalizeRestore(platform.id)
  }

  return false
}
