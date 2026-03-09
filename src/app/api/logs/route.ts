// src/app/api/logs/route.ts
// CostGuard — Logs API: hybrid Redis (latest 500) + DB (historical), auth-scoped
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { REDIS_LOG_KEY, REDIS_GLOBAL_KEY, MAX_REDIS_LOGS, parseLogEntry } from '@/lib/logger'
import type { LogEntry } from '@/lib/logger'

const LOG_CATEGORIES = ['POLL', 'SPEND', 'KILL', 'RESTORE', 'ALERT', 'ERROR', 'ENGINE', 'RATELIMIT', 'SYSTEM'] as const
const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'SUCCESS'] as const

function filterLogs(
  logs: LogEntry[],
  category?: string,
  level?: string,
  search?: string
): LogEntry[] {
  return logs.filter((log) => {
    if (category && log.category !== category) return false
    if (level && log.level !== level) return false
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const platformId = searchParams.get('platformId') ?? undefined
  const category = searchParams.get('category') ?? undefined
  const level = searchParams.get('level') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined
  const cursor = searchParams.get('cursor') ?? undefined
  const after = searchParams.get('after') ?? undefined
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
  const source = (searchParams.get('source') ?? 'hybrid') as 'redis' | 'db' | 'hybrid'

  const userPlatformIds = await prisma.platform.findMany({
    where: { userId: user.id },
    select: { id: true },
  }).then((r) => r.map((p) => p.id))

  const useRedis = source === 'redis' || (source === 'hybrid' && !from && !to && !cursor)
  const useDb = source === 'db' || (source === 'hybrid' && (from || to || cursor))

  if (useRedis) {
    let rawList: string[] = []
    if (platformId) {
      if (!userPlatformIds.includes(platformId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      rawList = (await redis.lrange(REDIS_LOG_KEY(platformId), 0, MAX_REDIS_LOGS - 1)) ?? []
    } else {
      const [systemRaw, ...platformRaws] = await Promise.all([
        redis.lrange(REDIS_GLOBAL_KEY, 0, MAX_REDIS_LOGS - 1),
        ...userPlatformIds.map((pid) =>
          redis.lrange(REDIS_LOG_KEY(pid), 0, MAX_REDIS_LOGS - 1)
        ),
      ])
      const allRaw = [...(systemRaw ?? []), ...platformRaws.flatMap((r) => r ?? [])]
      allRaw.sort((a, b) => {
        const pa = parseLogEntry(a)
        const pb = parseLogEntry(b)
        if (!pa || !pb) return 0
        return new Date(pb.createdAt).getTime() - new Date(pa.createdAt).getTime()
      })
      rawList = allRaw.slice(0, MAX_REDIS_LOGS)
    }

    let logs = rawList.map(parseLogEntry).filter((e): e is LogEntry => e != null)
    if (after) {
      const afterTime = new Date(after).getTime()
      if (!Number.isNaN(afterTime)) {
        logs = logs.filter((l) => new Date(l.createdAt).getTime() > afterTime)
      }
    }
    const filtered = filterLogs(logs, category, level, search)
    const page = filtered.slice(0, limit)
    return NextResponse.json({
      logs: page,
      source: 'redis',
      hasMore: filtered.length > limit,
      nextCursor: filtered.length > limit ? page[page.length - 1]?.id ?? null : null,
      cursorType: 'id',
    })
  }

  if (useDb) {
    const where: Record<string, unknown> = platformId
      ? { platformId }
      : { OR: [{ platformId: { in: userPlatformIds } }, { platformId: null }] }
    if (platformId && !userPlatformIds.includes(platformId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (category && LOG_CATEGORIES.includes(category as (typeof LOG_CATEGORIES)[number])) where.category = category
    if (level && LOG_LEVELS.includes(level as (typeof LOG_LEVELS)[number])) where.level = level
    if (search) {
      where.message = { contains: search, mode: 'insensitive' }
    }
    if (from) {
      const fromDate = new Date(from)
      if (Number.isNaN(fromDate.getTime())) {
        return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
      }
      where.createdAt = { ...((where.createdAt ?? {}) as object), gte: fromDate }
    }
    if (to) {
      const toDate = new Date(to)
      if (Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ error: 'Invalid to date' }, { status: 400 })
      }
      where.createdAt = { ...((where.createdAt ?? {}) as object), lte: toDate }
    }
    if (after) {
      const afterDate = new Date(after)
      if (!Number.isNaN(afterDate.getTime())) {
        where.createdAt = {
          ...((where.createdAt ?? {}) as object),
          gt: afterDate,
        }
      }
    }

    const orderBy = { createdAt: 'desc' as const }
    const take = limit + 1

    const rows = cursor
      ? await prisma.log.findMany({
          where: where as object,
          orderBy,
          take,
          cursor: { id: cursor },
          skip: 1,
        })
      : await prisma.log.findMany({
          where: where as object,
          orderBy,
          take,
        })

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const logs: LogEntry[] = page.map((r) => ({
      id: r.id,
      platformId: r.platformId,
      userId: r.userId,
      category: r.category,
      level: r.level,
      message: r.message,
      meta: (r.meta as Record<string, unknown>) ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }))
    return NextResponse.json({
      logs,
      source: 'db',
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      cursorType: 'id',
    })
  }

  return NextResponse.json({ logs: [], source: 'redis', hasMore: false, nextCursor: null, cursorType: 'id' })
}
