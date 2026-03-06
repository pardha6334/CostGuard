// src/lib/stripe.ts
// CostGuard — Stripe server client singleton (server-side only)
import Stripe from 'stripe'

const secret = process.env.STRIPE_SECRET_KEY
export const isStripeConfigured =
  !!secret && secret !== 'REPLACE_ME' && secret.startsWith('sk_')

export const stripe = new Stripe(secret || 'sk_test_placeholder', {
  apiVersion: '2026-02-25.clover',
})

export const PLANS = {
  STARTER: {
    priceId: process.env.STRIPE_PRICE_STARTER!,
    name: 'Starter',
    price: 49,
    platforms: 3,
    pollIntervalSecs: 60,
    features: [
      '3 platforms monitored',
      '60s polling interval',
      'Email + Slack alerts',
      'Hourly kill switch',
      '90-day incident history',
    ],
  },
  PRO: {
    priceId: process.env.STRIPE_PRICE_PRO!,
    name: 'Pro',
    price: 149,
    platforms: 15,
    pollIntervalSecs: 30,
    features: [
      '15 platforms monitored',
      '30s polling interval',
      'Anomaly detection (Z-score)',
      'Custom webhook alerts',
      'Priority support',
    ],
  },
  TEAM: {
    priceId: process.env.STRIPE_PRICE_TEAM!,
    name: 'Team',
    price: 299,
    platforms: 23,
    pollIntervalSecs: 15,
    features: [
      '23 platforms monitored',
      '15s polling interval',
      'Team members (5 seats)',
      'SSO + audit log',
      'SLA + dedicated support',
    ],
  },
} as const

export type PlanKey = keyof typeof PLANS
