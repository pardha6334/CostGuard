// src/app/api/connect/anthropic/workspaces/route.ts
// CostGuard — List Anthropic workspaces for dropdown (validates key format)

import { NextRequest, NextResponse } from 'next/server'
import { AnthropicAdapter } from '@/modules/adapters/anthropic.adapter'

const keyPrefix = (key: string) => (key ? `${key.slice(0, 15)}...${key.slice(-4)}` : 'none')

export async function GET(req: NextRequest) {
  const adminKey = req.nextUrl.searchParams.get('adminKey')
  console.log('[CONNECT:ANTHROPIC:WORKSPACES] Request received', { keyPrefix: keyPrefix(adminKey ?? ''), keyLength: adminKey?.length ?? 0 })

  if (!adminKey?.trim()) {
    console.log('[CONNECT:ANTHROPIC:WORKSPACES] Response: 400 Missing adminKey')
    return NextResponse.json({ error: 'Missing adminKey query parameter' }, { status: 400 })
  }

  // Accept sk-ant-admin, sk-ant-admin-, sk-ant-admin01-, etc. (reject sk-ant-api-)
  const isAdminKey = adminKey.startsWith('sk-ant-admin')
  const isRegularKey = adminKey.startsWith('sk-ant-api-')
  if (!isAdminKey) {
    if (isRegularKey) {
      console.log('[CONNECT:ANTHROPIC:WORKSPACES] Response: 400 Regular API key (sk-ant-api-) not Admin')
      return NextResponse.json(
        {
          error:
            'This is a regular API key, not an Admin key. Get your Admin key from console.anthropic.com → Settings → API Keys → Create Admin Key',
        },
        { status: 400 }
      )
    }
    console.log('[CONNECT:ANTHROPIC:WORKSPACES] Response: 400 Invalid key prefix')
    return NextResponse.json(
      { error: 'Admin key must start with sk-ant-admin (e.g. sk-ant-admin- or sk-ant-admin01-)' },
      { status: 400 }
    )
  }

  const adapter = new AnthropicAdapter(adminKey, null)
  console.log('[CONNECT:ANTHROPIC:WORKSPACES] Calling validateAdminKey()')
  const validation = await adapter.validateAdminKey()
  console.log('[CONNECT:ANTHROPIC:WORKSPACES] validateAdminKey result', { valid: validation.valid, orgId: validation.orgId ?? null, error: validation.error ?? null })
  if (!validation.valid) {
    console.log('[CONNECT:ANTHROPIC:WORKSPACES] Response: 400 Invalid admin key')
    return NextResponse.json({ error: validation.error ?? 'Invalid admin key' }, { status: 400 })
  }

  let workspaces: Array<{ id: string; name: string; display_color: string }>
  let listError: string | null = null
  try {
    console.log('[CONNECT:ANTHROPIC:WORKSPACES] Calling listWorkspaces()')
    const list = await adapter.listWorkspaces()
    console.log('[CONNECT:ANTHROPIC:WORKSPACES] listWorkspaces() returned', { count: list.length, names: list.slice(0, 5).map((w) => w.name) })
    workspaces = list.map((w) => ({
      id: w.id,
      name: w.name,
      display_color: w.display_color ?? '#666666',
    }))
    // If no workspaces (e.g. individual account or API returned empty), allow org-level connection
    if (workspaces.length === 0) {
      console.log('[CONNECT:ANTHROPIC:WORKSPACES] No workspaces in response, adding __org__ fallback')
      workspaces = [{ id: '__org__', name: 'Default (entire organization)', display_color: '#666666' }]
      listError = 'No workspaces returned by API.'
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    listError = msg
    console.error('[CONNECT:ANTHROPIC:WORKSPACES] listWorkspaces failed', { error: msg })
    // Still offer org-level option so user can connect
    workspaces = [{ id: '__org__', name: 'Default (entire organization)', display_color: '#666666' }]
  }

  console.log('[CONNECT:ANTHROPIC:WORKSPACES] Response', { workspacesCount: workspaces.length, list_error: listError })
  return NextResponse.json({ workspaces, list_error: listError })
}
