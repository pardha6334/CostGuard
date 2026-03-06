// src/app/api/cron/poll/route.ts
// CostGuard — QStash cron endpoint, runs every 60 seconds
import { NextRequest, NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { runPollCycle } from '@/modules/polling/engine'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes — enough for 500 platforms

// GET: allow health check; returns 200 with hint so you know the route is alive (polling must use POST)
export async function GET() {
  return NextResponse.json({
    message: 'Cron poll endpoint. Use POST to run a poll (QStash or x-cron-secret).',
    method: 'POST',
  })
}

export async function POST(req: NextRequest) {
  const cronStart = Date.now()
  const triggerTime = new Date().toISOString()

  // In development skip signature check for easy local testing
  if (process.env.NODE_ENV !== 'production') {
    const secret = req.headers.get('x-cron-secret')
    if (secret !== process.env.CRON_SECRET) {
      console.log(`[CRON] ❌ Unauthorized request at ${triggerTime}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log(`[CRON] 🚀 Poll triggered (dev) at ${triggerTime}`)
    const result = await runPollCycle()
    const durationMs = Date.now() - cronStart
    console.log(`[CRON] ✅ Poll complete in ${durationMs}ms — polled:${result.polled} killed:${result.killed} errors:${result.errors.length}`)
    if (result.errors.length > 0) {
      console.error(`[CRON] ⚠️  Errors during poll:`, result.errors)
    }
    return NextResponse.json({ ok: true, ...result, durationMs })
  }

  // Production: verify QStash signature
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  })

  const body = await req.text()
  const signature = req.headers.get('upstash-signature') ?? ''

  try {
    await receiver.verify({ body, signature })
  } catch {
    console.log(`[CRON] ❌ Invalid QStash signature at ${triggerTime}`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  console.log(`[CRON] 🚀 Poll triggered (QStash) at ${triggerTime}`)
  const result = await runPollCycle()
  const durationMs = Date.now() - cronStart
  console.log(`[CRON] ✅ Poll complete in ${durationMs}ms — polled:${result.polled} killed:${result.killed} errors:${result.errors.length}`)
  if (result.errors.length > 0) {
    console.error(`[CRON] ⚠️  Errors during poll:`, result.errors)
  }
  return NextResponse.json({ ok: true, ...result, durationMs })
}
