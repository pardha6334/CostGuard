// src/app/api/stripe/create-checkout/route.ts
// CostGuard — Creates Stripe checkout session for plan upgrade
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, PLANS, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const Schema = z.object({
  plan: z.enum(['STARTER', 'PRO', 'TEAM']),
})

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

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const { plan } = parsed.data
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://costguard.dev'

  // Get or create Stripe customer
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  let customerId = dbUser?.stripeId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeId: customerId },
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
    metadata: { userId: user.id, plan },
    subscription_data: {
      metadata: { userId: user.id, plan },
    },
  })

  return NextResponse.json({ url: session.url })
}
