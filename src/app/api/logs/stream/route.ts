// src/app/api/logs/stream/route.ts
// CostGuard — SSE stream for live logs (poll Redis every 3s for new entries)
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { REDIS_LOG_KEY, REDIS_GLOBAL_KEY, parseLogEntry } from '@/lib/logger'
import type { LogEntry } from '@/lib/logger'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const userPlatformIds = await prisma.platform.findMany({
    where: { userId: user.id },
    select: { id: true },
  }).then((r) => r.map((p) => p.id))

  const encoder = new TextEncoder()
  let lastSentAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial ping so client knows connection is alive
      controller.enqueue(encoder.encode(': ping\n\n'))

      let closed = false
      req.signal?.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        try {
          controller.close()
        } catch {
          // ignore
        }
      })

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval)
          return
        }
        try {
          const [systemRaw, ...platformRaws] = await Promise.all([
            redis.lrange(REDIS_GLOBAL_KEY, 0, 49),
            ...userPlatformIds.map((pid) => redis.lrange(REDIS_LOG_KEY(pid), 0, 49)),
          ])
          const allRaw = [...(systemRaw ?? []), ...platformRaws.flatMap((r) => r ?? [])]
          const parsed = allRaw.map(parseLogEntry).filter((e): e is LogEntry => e != null)
          parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          const newLogs = parsed
            .filter((l) => new Date(l.createdAt).getTime() > lastSentAt)
            .slice(0, 50)
          if (newLogs.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(newLogs)}\n\n`))
            lastSentAt = new Date(newLogs[0].createdAt).getTime()
          }
        } catch (err) {
          console.error('[LOGS-STREAM]', err)
        }
      }, 3000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
