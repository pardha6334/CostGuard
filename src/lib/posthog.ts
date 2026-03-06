// src/lib/posthog.ts
// CostGuard — PostHog analytics client initializer (client-side only)
import posthog from 'posthog-js'

export function initPostHog() {
  if (typeof window === 'undefined') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || key === 'REPLACE_ME') return
  if (posthog.__loaded) return

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    autocapture: false,
  })
}

export { posthog }
