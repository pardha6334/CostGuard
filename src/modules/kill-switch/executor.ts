// src/modules/kill-switch/executor.ts
// CostGuard — Executes kill and restore operations, logs incidents to DB
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { encrypt, decrypt } from '@/lib/crypto'
import { getAdapter } from '@/modules/polling/adapter-factory'
import type { KillResult, RestoreResult, PlatformSnapshot } from '@/modules/adapters/base.adapter'

export interface KillContext {
  platformId: string
  userId: string
  burnRate: number
  threshold: number
  triggerType: 'HOURLY_LIMIT' | 'DAILY_LIMIT' | 'MONTHLY_LIMIT' | 'SPIKE_DETECTED' | 'MANUAL'
}

export async function executeKill(ctx: KillContext): Promise<KillResult> {
  // Cooldown: max 3 auto-kills per platform per hour (prevents kill/restore spam)
  if (ctx.triggerType !== 'MANUAL') {
    const recentKills = await prisma.incident.count({
      where: {
        platformId: ctx.platformId,
        triggerType: { not: 'MANUAL' },
        killedAt: { gte: new Date(Date.now() - 3_600_000) },
      },
    })
    if (recentKills >= 3) {
      console.warn(`[COOLDOWN] ${ctx.platformId} — ${recentKills} auto-kills in last hour, suppressing`)
      return { success: false, method: 'cooldown_active', reversible: false, error: 'Cooldown: 3 auto-kills/hour limit reached' }
    }
  }

  const platform = await prisma.platform.findUnique({
    where: { id: ctx.platformId },
  })
  if (!platform) return { success: false, method: 'not_found', reversible: false, error: 'Platform not found' }

  const creds = JSON.parse(decrypt(platform.encryptedCreds))
  const adapter = getAdapter(platform.provider, creds)

  const result = await adapter.kill()

  // Store snapshot in Redis (fast) + DB (durable) for restore
  if (result.snapshot) {
    try {
      const encryptedSnapshot = encrypt(JSON.stringify(result.snapshot))
      await Promise.all([
        redis.set(`snapshot:${ctx.platformId}`, encryptedSnapshot, { ex: 30 * 24 * 3600 }),
        prisma.platform.update({
          where: { id: ctx.platformId },
          data: { killSnapshot: encryptedSnapshot },
        }),
      ])
    } catch (err) {
      console.error(`[SNAPSHOT STORE FAILED] ${ctx.platformId}:`, err)
    }
  }

  if (!result.success) {
    console.error(`[KILL FAILED] ${platform.provider}:${ctx.platformId} — ${result.error}`)
  }

  // Update circuit breaker state
  await prisma.platform.update({
    where: { id: ctx.platformId },
    data: { breakerState: 'OPEN' },
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

  // Step 1: Read snapshot from Redis (fastest path)
  let snapshot: PlatformSnapshot | undefined
  try {
    const cached = await redis.get<string>(`snapshot:${platformId}`)
    if (cached) {
      snapshot = JSON.parse(decrypt(cached)) as PlatformSnapshot
      console.info(`[RESTORE] Redis snapshot found for ${platformId}`)
    }
  } catch {
    // ignore
  }

  // Step 2: Fallback to DB snapshot
  if (!snapshot && platform.killSnapshot) {
    try {
      snapshot = JSON.parse(decrypt(platform.killSnapshot)) as PlatformSnapshot
      console.info(`[RESTORE] DB snapshot fallback for ${platformId}`)
    } catch {
      // ignore
    }
  }

  // Step 3: No snapshot — use adapter defaults (safe fallback)
  if (!snapshot) {
    console.warn(`[RESTORE] No snapshot for ${platformId} — adapter will use safe defaults`)
  }

  const creds = JSON.parse(decrypt(platform.encryptedCreds))
  const adapter = getAdapter(platform.provider, creds)
  const result = await adapter.restore(snapshot)

  // Cleanup snapshot after successful restore
  if (result.success) {
    await Promise.all([
      redis.del(`snapshot:${platformId}`),
      prisma.platform.update({
        where: { id: platformId },
        data: { killSnapshot: null },
      }),
    ])
  }

  // Move to HALF_OPEN — monitor 15 min before closing
  await prisma.platform.update({
    where: { id: platformId },
    data: { breakerState: 'HALF_OPEN' },
  })

  // Mark active incidents as RESTORING
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
