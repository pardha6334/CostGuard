// src/lib/dev-mode.ts
// CostGuard — Dev mode helpers: bypass Stripe, seed test data
export const IS_DEV = process.env.NODE_ENV === 'development'
export const DEV_BYPASS_STRIPE = process.env.DEV_BYPASS_STRIPE === 'true'
