// src/app/api/platforms/[id]/route.ts
// CostGuard — Update or deactivate a single platform
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const PatchSchema = z.object({
  hourlyLimit:    z.number().min(1).optional(),
  dailyBudget:    z.number().min(1).optional(),
  monthlyBudget:  z.number().min(1).optional(),
  autoKill:       z.boolean().optional(),
  anomalyDetect:  z.boolean().optional(),
  alertEmail:     z.boolean().optional(),
  alertSlack:     z.boolean().optional(),
  alertWebhook:   z.boolean().optional(),
  displayName:    z.string().optional(),
})

async function getAuthorizedPlatform(platformId: string, userId: string) {
  const platform = await prisma.platform.findUnique({ where: { id: platformId } })
  if (!platform || platform.userId !== userId) return null
  return platform
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const platform = await getAuthorizedPlatform(params.id, user.id)
  if (!platform) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = PatchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updated = await prisma.platform.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, provider: true, hourlyLimit: true, dailyBudget: true, autoKill: true },
  })

  return NextResponse.json({ platform: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const platform = await getAuthorizedPlatform(params.id, user.id)
  if (!platform) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Soft delete — keep data for audit
  await prisma.platform.update({
    where: { id: params.id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
}
