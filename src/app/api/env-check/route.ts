// src/app/api/env-check/route.ts
// CostGuard — Safe env var checklist for deploy verification (never returns secret values)
import { NextResponse } from 'next/server'

const EXPECTED_VARS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'QSTASH_URL',
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'CRON_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_DSN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_AUTH_TOKEN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  // Stripe optional until billing enabled
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_TEAM',
] as const

function status(val: string | undefined): 'set' | 'missing' {
  if (val == null || val === '' || val === 'REPLACE_ME') return 'missing'
  if (val.startsWith('sk_test_placeholder')) return 'missing'
  return 'set'
}

export async function GET() {
  const result: Record<string, 'set' | 'missing'> = {}
  for (const key of EXPECTED_VARS) {
    result[key] = status(process.env[key])
  }
  const missing = EXPECTED_VARS.filter((k) => result[k] === 'missing')
  return NextResponse.json({
    env: result,
    missingCount: missing.length,
    missingList: missing,
    hint: missing.length > 0 ? 'Add missing vars in Vercel → Project → Settings → Environment Variables' : undefined,
  })
}
