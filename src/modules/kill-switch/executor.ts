// src/modules/kill-switch/executor.ts
// CostGuard — Executes kill and restore operations, logs incidents to DB
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { getAdapter } from '@/modules/polling/adapter-factory'
import type { KillResult, RestoreResult } from '@/modules/adapters/base.adapter'

export interface KillContext {
  platformId: string
  userId: string
  burnRate: number
  threshold: number
  triggerType: 'HOURLY_LIMIT' | 'DAILY_LIMIT' | 'SPIKE_DETECTED' | 'MANUAL'
}

export async function executeKill(ctx: KillContext): Promise<KillResult> {
  const platform = await prisma.platform.findUnique({
    where: { id: ctx.platformId },
  })
  if (!platform) return { success: false, method: 'not_found', reversible: false, error: 'Platform not found' }

  const creds = JSON.parse(decrypt(platform.encryptedCreds))
  const adapter = getAdapter(platform.provider, creds)

  const result = await adapter.kill()

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

  const creds = JSON.parse(decrypt(platform.encryptedCreds))
  const adapter = getAdapter(platform.provider, creds)

  const result = await adapter.restore()

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
