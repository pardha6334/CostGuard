// src/app/api/user/route.ts
// CostGuard — Returns current user plan and trial info for billing page
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { isStripeConfigured } from '@/lib/stripe'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { plan: true, trialEndsAt: true, stripeId: true, email: true },
  })

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    plan: dbUser.plan,
    trialEndsAt: dbUser.trialEndsAt?.toISOString() ?? null,
    hasStripeId: !!dbUser.stripeId,
    stripeEnabled: isStripeConfigured,
    email: dbUser.email,
  })
}
