// src/app/api/stripe/portal/route.ts
// CostGuard — Creates Stripe customer portal session
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: 'Billing not available yet. Plans coming soon.' },
      { status: 503 }
    )
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser?.stripeId) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://costguard.dev'
  const session = await stripe.billingPortal.sessions.create({
    customer: dbUser.stripeId,
    return_url: `${appUrl}/billing`,
  })

  return NextResponse.json({ url: session.url })
}
