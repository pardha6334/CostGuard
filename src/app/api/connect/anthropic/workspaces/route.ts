// src/app/api/connect/anthropic/workspaces/route.ts
// CostGuard — List Anthropic workspaces for dropdown (validates key format)

import { NextRequest, NextResponse } from 'next/server'
import { AnthropicAdapter } from '@/modules/adapters/anthropic.adapter'

export async function GET(req: NextRequest) {
  const adminKey = req.nextUrl.searchParams.get('adminKey')
  if (!adminKey?.trim()) {
    return NextResponse.json({ error: 'Missing adminKey query parameter' }, { status: 400 })
  }

  if (!adminKey.startsWith('sk-ant-admin-')) {
    if (adminKey.startsWith('sk-ant-api-')) {
      return NextResponse.json(
        {
          error:
            'This is a regular API key, not an Admin key. Get your Admin key from console.anthropic.com → Settings → API Keys → Create Admin Key',
        },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Admin key must start with sk-ant-admin-' },
      { status: 400 }
    )
  }

  const adapter = new AnthropicAdapter(adminKey, null)
  const validation = await adapter.validateAdminKey()
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error ?? 'Invalid admin key' }, { status: 400 })
  }

  let workspaces: Array<{ id: string; name: string; display_color: string }>
  let listError: string | null = null
  try {
    const list = await adapter.listWorkspaces()
    workspaces = list.map((w) => ({
      id: w.id,
      name: w.name,
      display_color: w.display_color ?? '#666666',
    }))
    // If no workspaces (e.g. individual account or API returned empty), allow org-level connection
    if (workspaces.length === 0) {
      workspaces = [{ id: '__org__', name: 'Default (entire organization)', display_color: '#666666' }]
      listError = 'No workspaces returned by API.'
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    listError = msg
    console.error('[CONNECT:ANTHROPIC:WORKSPACES] listWorkspaces failed:', msg)
    // Still offer org-level option so user can connect
    workspaces = [{ id: '__org__', name: 'Default (entire organization)', display_color: '#666666' }]
  }

  return NextResponse.json({ workspaces, list_error: listError })
}
