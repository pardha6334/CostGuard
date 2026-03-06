// src/app/api/webhooks/stripe/route.ts
// CostGuard — Stripe webhook handler: syncs subscription status to DB
import { NextRequest, NextResponse } from 'next/server'
import { stripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

// Build PLAN_MAP lazily to avoid issues with REPLACE_ME env values at module load
function getPlanMap(): Record<string, 'STARTER' | 'PRO' | 'TEAM'> {
  return {
    ...(process.env.STRIPE_PRICE_STARTER ? { [process.env.STRIPE_PRICE_STARTER]: 'STARTER' } : {}),
    ...(process.env.STRIPE_PRICE_PRO ? { [process.env.STRIPE_PRICE_PRO]: 'PRO' } : {}),
    ...(process.env.STRIPE_PRICE_TEAM ? { [process.env.STRIPE_PRICE_TEAM]: 'TEAM' } : {}),
  }
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    return NextResponse.json({ error: `Webhook error: ${String(err)}` }, { status: 400 })
  }

  const PLAN_MAP = getPlanMap()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      const plan = session.metadata?.plan as 'STARTER' | 'PRO' | 'TEAM' | undefined
      if (userId && plan) {
        await prisma.user.update({
          where: { id: userId },
          data: { plan, trialEndsAt: null },
        })
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const priceId = sub.items.data[0]?.price.id
      const plan = priceId ? PLAN_MAP[priceId] : undefined
      const userId = sub.metadata?.userId
      if (userId && plan) {
        await prisma.user.update({
          where: { id: userId },
          data: { plan },
        })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.userId
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { plan: 'TRIAL' },
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
