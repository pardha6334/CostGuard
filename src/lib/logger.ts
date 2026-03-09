// src/lib/logger.ts
// CostGuard — Central logger: Redis (latest 500) + Supabase (persistent)
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import type { LogCategory, LogLevel } from '@prisma/client'

export const REDIS_LOG_KEY = (platformId: string) => `logs:${platformId}`
export const REDIS_GLOBAL_KEY = 'logs:system'
export const MAX_REDIS_LOGS = 500

export type { LogCategory, LogLevel }

export interface LogEntry {
  id: string
  platformId?: string | null
  userId?: string | null
  category: LogCategory
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
  createdAt: string
}

export function parseLogEntry(raw: string): LogEntry | null {
  try {
    const o = JSON.parse(raw) as LogEntry
    if (o && typeof o.message === 'string' && o.createdAt) return o
    return null
  } catch {
    return null
  }
}

export async function writeLog(entry: {
  platformId?: string | null
  userId?: string | null
  category: LogCategory
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
}): Promise<void> {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const log: LogEntry = {
    id,
    platformId: entry.platformId ?? null,
    userId: entry.userId ?? null,
    category: entry.category,
    level: entry.level,
    message: entry.message,
    meta: entry.meta,
    createdAt,
  }

  const logJson = JSON.stringify(log)
  const redisKey = entry.platformId ? REDIS_LOG_KEY(entry.platformId) : REDIS_GLOBAL_KEY

  const results = await Promise.allSettled([
    redis.lpush(redisKey, logJson).then(() => redis.ltrim(redisKey, 0, MAX_REDIS_LOGS - 1)),
    prisma.log.create({
      data: {
        id,
        platformId: entry.platformId ?? null,
        userId: entry.userId ?? null,
        category: entry.category,
        level: entry.level,
        message: entry.message,
        meta: (entry.meta ?? {}) as object,
      },
    }),
  ])
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[LOGGER] ${i === 0 ? 'Redis' : 'DB'} write failed:`, r.reason)
    }
  })
}

export const log = {
  info: (
    msg: string,
    meta?: Record<string, unknown>,
    platformId?: string | null,
    category: LogCategory = 'SYSTEM',
    userId?: string | null
  ) => writeLog({ platformId, userId, category, level: 'INFO', message: msg, meta }),

  warn: (
    msg: string,
    meta?: Record<string, unknown>,
    platformId?: string | null,
    category: LogCategory = 'SYSTEM',
    userId?: string | null
  ) => writeLog({ platformId, userId, category, level: 'WARN', message: msg, meta }),

  error: (
    msg: string,
    meta?: Record<string, unknown>,
    platformId?: string | null,
    category: LogCategory = 'ERROR',
    userId?: string | null
  ) => writeLog({ platformId, userId, category, level: 'ERROR', message: msg, meta }),

  success: (
    msg: string,
    meta?: Record<string, unknown>,
    platformId?: string | null,
    category: LogCategory = 'SYSTEM',
    userId?: string | null
  ) => writeLog({ platformId, userId, category, level: 'SUCCESS', message: msg, meta }),
}
