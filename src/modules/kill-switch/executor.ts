// src/modules/kill-switch/executor.ts
// CostGuard — Executes kill and restore operations, snapshot storage, cooldown, Redis kill key
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { decrypt } from '@/lib/crypto'
import { getAdapter } from '@/modules/polling/adapter-factory'
import { sendAlert } from '@/modules/alerts/dispatcher'
import { log } from '@/lib/logger'
import type { KillResult, RestoreResult, PlatformSnapshot } from '@/modules/adapters/base.adapter'

const SNAPSHOT_TTL_SEC = 30 * 24 * 3600 // 30 days

export interface KillContext {
  platformId: string
  userId: string
  burnRate: number
  threshold: number
  triggerType: 'HOURLY_LIMIT' | 'DAILY_LIMIT' | 'MONTHLY_LIMIT' | 'SPIKE_DETECTED' | 'MANUAL'
}

export async function executeKill(ctx: KillContext): Promise<KillResult> {
  const platform = await prisma.platform.findUnique({
    where: { id: ctx.platformId },
    include: { user: { select: { id: true, email: true, slackWebhook: true } } },
  })
  if (!platform) return { success: false, method: 'not_found', reversible: false, error: 'Platform not found' }

  // Cooldown: max 3 auto-kills per platform per hour (Redis-based)
  if (ctx.triggerType !== 'MANUAL') {
    const killCount = await redis.incr(`killcount:${ctx.platformId}`)
    await redis.expire(`killcount:${ctx.platformId}`, 3600)
    if (killCount > 3) {
      console.warn(`[EXECUTOR] Kill cooldown active for ${ctx.platformId} — ${killCount} kills this hour`)
      return { success: false, method: 'cooldown_active', reversible: true, error: 'Cooldown: max 3 auto-kills per hour' }
    }
  }

  const creds = JSON.parse(decrypt(platform.encryptedCreds))
  const adapter = getAdapter(platform.provider, creds)

  // Capture snapshot BEFORE kill and store in Redis + DB
  try {
    const snapshot = await adapter.getSnapshot()
    const snapshotJson = JSON.stringify(snapshot)
    await redis.set(`snapshot:${ctx.platformId}`, snapshotJson, { ex: SNAPSHOT_TTL_SEC })
    await prisma.platform.update({
      where: { id: ctx.platformId },
      data: { killSnapshot: snapshotJson },
    })
  } catch (err) {
    console.error(`[EXECUTOR] Snapshot capture failed for ${ctx.platformId}:`, err)
  }

  const result = await adapter.kill()

  if (!result.success) {
    console.error(`[EXECUTOR] ❌ KILL FAILED for ${ctx.platformId}: ${result.error}`)
    log.error(`Kill FAILED: ${result.error}`, { error: result.error, method: result.method }, ctx.platformId, 'ERROR')
    await sendAlert({
      type: 'kill',
      platform: platform.displayName ?? platform.provider,
      provider: platform.provider,
      burnRate: ctx.burnRate,
      threshold: ctx.threshold,
      projectedSaved: ctx.burnRate * 24,
      triggerType: 'KILL_FAILED',
      error: result.error,
      user: {
        email: platform.user.email,
        slackWebhook: platform.user.slackWebhook ?? null,
        alertEmail: platform.alertEmail,
        alertSlack: platform.alertSlack,
      },
    }).catch((e: Error) => console.error('KILL_FAILED alert failed:', e.message))
  } else {
    // Set Redis key for app-level ft:* kill check
    await redis.set(`costguard:kill:${ctx.platformId}`, '1', { ex: SNAPSHOT_TTL_SEC })
    const hardBlocked = result.hardBlocked ?? 0
    log.success(`Kill executed — ${hardBlocked} models → 0 req/min`, {
      hardBlocked,
      ftSkipped: result.ftSkipped,
      sharedSkipped: result.sharedSkipped,
      method: result.method,
      effectiveCoverage: result.effectiveCoverage,
    }, ctx.platformId, 'KILL')
    log.info(`Rate limits set to 0 — ${hardBlocked} models hard blocked`, { hardBlocked, method: result.method }, ctx.platformId, 'RATELIMIT')
  }

  // Update circuit breaker state and lastTriggerType
  await prisma.platform.update({
    where: { id: ctx.platformId },
    data: { breakerState: 'OPEN', lastTriggerType: ctx.triggerType },
  })

  // Log incident
  const projectedSaved = ctx.burnRate * 24
  await prisma.incident.create({
    data: {
      userId: ctx.userId,
      platformId: ctx.platformId,
      triggerType: ctx.triggerType,
      spendAtTrigger: 0,
      burnRateAtKill: ctx.burnRate,
      thresholdLimit: ctx.threshold,
      estimatedSaved: projectedSaved,
      status: 'ACTIVE',
    },
  })

  return result
}

export async function executeRestore(platformId: string, userId: string): Promise<RestoreResult> {
  const platform = await prisma.platform.findUnique({
    where: { id: platformId },
  })
  if (!platform) return { success: false, method: 'not_found', error: 'Platform not found' }
  if (platform.userId !== userId) return { success: false, method: 'unauthorized', error: 'Forbidden' }

  // Read snapshot from Redis first, fallback to DB (plain JSON)
  let snapshot: PlatformSnapshot | null = null
  const redisSnap = await redis.get<string>(`snapshot:${platformId}`)
  if (redisSnap) {
    try {
      snapshot = typeof redisSnap === 'string' ? (JSON.parse(redisSnap) as PlatformSnapshot) : (redisSnap as PlatformSnapshot)
    } catch {
      // ignore
    }
  }
  if (!snapshot && platform.killSnapshot) {
    try {
      snapshot = JSON.parse(platform.killSnapshot) as PlatformSnapshot
    } catch {
      // ignore
    }
  }

  if (!snapshot) {
    console.warn(`[EXECUTOR] No snapshot for ${platformId} — adapter may use defaults`)
  }

  const creds = JSON.parse(decrypt(platform.encryptedCreds))
  const adapter = getAdapter(platform.provider, creds)
  const result = await adapter.restore(snapshot ?? undefined)

  if (result.success) {
    await redis.del(`snapshot:${platformId}`)
    await redis.del(`costguard:kill:${platformId}`)
    await prisma.platform.update({
      where: { id: platformId },
      data: { killSnapshot: null },
    })
    log.success(`Restore executed — models restored to original limits`, { method: result.method, snapshotSource: 'redis_or_db' }, platformId, 'RESTORE')
  }

  await prisma.platform.update({
    where: { id: platformId },
    data: { breakerState: 'HALF_OPEN' },
  })

  await prisma.incident.updateMany({
    where: { platformId, status: 'ACTIVE' },
    data: { status: 'RESTORING', resolvedByUserId: userId },
  })

  return result
}

export async function finalizeRestore(platformId: string): Promise<void> {
  await prisma.platform.update({
    where: { id: platformId },
    data: { breakerState: 'CLOSED' },
  })
  const now = new Date()
  const incidents = await prisma.incident.findMany({
    where: { platformId, status: 'RESTORING' },
  })
  for (const inc of incidents) {
    const durationSecs = Math.round((now.getTime() - inc.killedAt.getTime()) / 1000)
    await prisma.incident.update({
      where: { id: inc.id },
      data: { status: 'RESOLVED', resolvedAt: now, durationSecs },
    })
  }
}
