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
  // In development skip signature check for easy local testing
  if (process.env.NODE_ENV !== 'production') {
    const secret = req.headers.get('x-cron-secret')
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const result = await runPollCycle()
    return NextResponse.json({ ok: true, ...result })
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
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const result = await runPollCycle()
  return NextResponse.json({ ok: true, ...result })
}
