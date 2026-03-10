// src/app/api/connect/anthropic/route.ts
// CostGuard — Connect Anthropic workspace: validate admin key, list workspaces, create platform

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { AnthropicAdapter } from '@/modules/adapters/anthropic.adapter'
import { z } from 'zod'

const BodySchema = z.object({
  adminKey: z.string().min(1),
  workspaceId: z.string().optional(),
  displayName: z.string().optional(),
  hourlyLimit: z.number().min(1).optional(),
  dailyBudget: z.number().min(1).optional(),
})

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid adminKey' }, { status: 400 })
  }

  const { adminKey, workspaceId, displayName, hourlyLimit, dailyBudget } = parsed.data

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
    return NextResponse.json(
      { error: validation.error ?? 'Invalid admin key' },
      { status: 400 }
    )
  }

  const workspaces = await adapter.listWorkspaces()

  if (!workspaceId) {
    return NextResponse.json({
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        display_color: w.display_color,
      })),
    })
  }

  const workspace = workspaces.find((w) => w.id === workspaceId)
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 400 })
  }

  const workspaceAdapter = new AnthropicAdapter(adminKey, workspaceId)
  const activeKeys = await workspaceAdapter.listActiveApiKeys()
  const keyCount = activeKeys.length

  const platform = await prisma.platform.create({
    data: {
      userId: user.id,
      provider: 'ANTHROPIC',
      encryptedCreds: encrypt(JSON.stringify({ adminKey })),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      displayName: displayName ?? workspace.name,
      breakerState: 'CLOSED',
      hourlyLimit: hourlyLimit ?? 200,
      dailyBudget: dailyBudget ?? 500,
      monthlyBudget: (dailyBudget ?? 500) * 30,
    },
    select: { id: true, workspaceName: true },
  })

  return NextResponse.json({
    success: true,
    platformId: platform.id,
    workspaceName: platform.workspaceName,
    keyCount,
  })
}
