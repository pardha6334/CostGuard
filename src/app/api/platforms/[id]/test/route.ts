// src/app/api/platforms/[id]/test/route.ts
// CostGuard — Test live connectivity for a platform using its stored credentials
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { getAdapter } from '@/modules/polling/adapter-factory'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const platform = await prisma.platform.findUnique({ where: { id: params.id } })
  if (!platform || platform.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const creds = JSON.parse(decrypt(platform.encryptedCreds)) as Record<string, unknown>
    if (platform.provider === 'ANTHROPIC' && platform.workspaceId != null) {
      creds.workspaceId = platform.workspaceId
    }
    const adapter = getAdapter(platform.provider, creds)
    const t0 = Date.now()
    const ok = await adapter.testConnection()
    const latencyMs = Date.now() - t0
    console.log(`[TEST:${platform.provider}:${platform.id.slice(-6)}] ${ok ? '✅' : '❌'} testConnection → ${ok} in ${latencyMs}ms`)
    return NextResponse.json({ ok, latencyMs, provider: platform.provider })
  } catch (err) {
    console.error(`[TEST:${platform.provider}:${platform.id.slice(-6)}] ❌ threw:`, String(err))
    return NextResponse.json({ ok: false, error: String(err), provider: platform.provider })
  }
}
