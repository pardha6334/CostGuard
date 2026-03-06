# CostGuard — Complete Context Handoff

This document summarizes the project state, what was built, and what you need to know to continue or hand off to another agent (e.g. Claude).

---

## Current status (at handoff)

### ✅ What's 100% done (code is production-ready)

**Backend**
- All 5 platform adapters (OpenAI, Anthropic, AWS, Vercel, Supabase)
- Circuit breaker FSM + sliding-window burn rate + Z-score anomaly detection
- Kill switch executor + restore flow + incident logging
- Polling engine with Redis locking + QStash cron integration
- Slack + email alerts via Resend
- 8 protected API routes + `/api/health` + `/api/env-check`
- Stripe billing (optional; gracefully disabled until keys are added)
- 28 unit tests, all passing

**Frontend**
- 4 dashboard pages: Dashboard / Platforms / Incidents / Thresholds
- Auth pages: Login / Signup / Verify
- Billing page (shows "Plans coming soon" until Stripe enabled)
- DistanceGauge + KillPanel + SpendChart + ActivityFeed
- Dark + Light theme toggle
- Dev toolbar for local testing (seed, breach sim, poll, reset)

### 🔄 Pre-deploy / verification checklist (to be done by deployer)

| Item | Action |
|------|--------|
| Supabase project | Create project; get `DATABASE_URL`, `DIRECT_URL`, anon key, service role key |
| Env vars in `.env.local` | Fill required vars (Supabase, Redis, QStash, ENCRYPTION_KEY, CRON_SECRET, NEXT_PUBLIC_APP_URL); optional: Stripe, Resend, Sentry, PostHog |
| Prisma schema in DB | Run `npx prisma db push` (uses `.env` with same DATABASE_URL/DIRECT_URL) |
| Upstash Redis + QStash | Create Redis DB and QStash; add REST URL/token and QStash signing keys to env |
| Deploy to Vercel | `vercel --prod`; add all env vars in Vercel project settings |
| QStash schedule | In Upstash console, create schedule: POST to `https://<your-app>.vercel.app/api/cron/poll` (e.g. every 1 min) |
| Local smoke test | Run app with dev toolbar: Seed → Breach → Poll → verify circuit breaker / kill flow |

Use `/api/health` and `/api/env-check` after deploy to confirm DB, Redis, and env var presence (env-check does not expose values).

---

## 1. Project Overview

- **Name:** CostGuard  
- **Purpose:** Real-time AI/cloud spend monitoring SaaS with automated kill switches.  
- **Stack:** Next.js 14 (App Router), TypeScript, Supabase (auth + Postgres), Prisma, Upstash Redis + QStash, Stripe (optional), Resend, Sentry, PostHog.  
- **Blueprint:** Implementation follows `CURSOR_BLUEPRINT.md` (and related spec); `.cursorrules` enforces security, style, and architecture.

---

## 2. What Was Built (Summary)

### Core backend
- **Auth:** Supabase Auth (email/password). Middleware protects non-auth routes; dashboard layout does server-side auth check.
- **DB:** Prisma schema with `User`, `Platform`, `SpendReading`, `Incident`. Migrations via `npx prisma db push`. **Two env files:** Prisma CLI reads `.env` (DATABASE_URL, DIRECT_URL); Next.js reads `.env.local` (all vars). Both must stay in sync for DB URLs.
- **Encryption:** `src/lib/crypto.ts` — AES-256-GCM for platform credentials; `ENCRYPTION_KEY` is 32 bytes hex.
- **Redis:** Upstash Redis for caching latest spend, burn-rate windows, and locks. Required for polling and kill logic.
- **QStash:** Used in production to hit `/api/cron/poll` on a schedule (e.g. every minute). Dev can use `x-cron-secret` header to trigger the same route without QStash.

### Circuit breaker & polling
- **Circuit breaker:** State machine (CLOSED → OPEN → HALF_OPEN), sliding-window burn rate, Z-score anomaly detection. Lives under `src/modules/circuit-breaker/`.
- **Adapters:** Per-provider adapters (OpenAI, Anthropic, AWS, etc.) implementing `PlatformAdapter`; registered in `adapter-factory.ts`.
- **Polling:** `src/modules/polling/engine.ts` — `runPollCycle()` fetches spend, updates Redis, evaluates breakers, runs kill/restore and alerts.
- **Kill switch:** `src/modules/kill-switch/executor.ts` — execute kill/restore and write incidents.

### API routes (all under `src/app/api/`)
- **Auth-protected:** `/api/platforms`, `/api/platforms/[id]`, `/api/incidents`, `/api/kill`, `/api/restore`, `/api/user`, `/api/stripe/create-checkout`, `/api/stripe/portal`. All verify Supabase user; no `encryptedCreds` in responses.
- **Cron:** `/api/cron/poll` — in production requires QStash signature; in development accepts `x-cron-secret` header.
- **Webhooks:** `/api/webhooks/stripe` — Stripe signature verified; syncs subscription to DB. Returns 503 when Stripe is not configured.
- **Public:** `/api/health` (DB + Redis check), `/api/env-check` (lists which env vars are set/missing, no values).
- **Dev-only (404 in production):** `/api/dev/seed`, `/api/dev/breach`, `/api/dev/reset` — seed fake platforms/incidents, simulate breach, reset dev data.

### Frontend
- **Layout:** Dashboard layout has Sidebar + Topbar; auth redirect to `/login` if no session.
- **Pages:** `/` (dashboard), `/platforms`, `/incidents`, `/thresholds`, `/billing`, `/login`, `/signup`, `/verify`.
- **Key UI:** DistanceGauge (burn vs threshold), KillPanel, SpendChart (Recharts, dynamic import for SSR), ActivityFeed (framer-motion), PlatformCard, ConnectWizard (3-step connect flow).
- **Data:** SWR hooks `usePlatforms`, `useIncidents`; no sensitive data in client.

### Stripe & billing
- **Stripe optional:** `src/lib/stripe.ts` exports `isStripeConfigured` (true only when `STRIPE_SECRET_KEY` is set and not placeholder). When false:
  - `/api/stripe/create-checkout` and `/api/stripe/portal` return 503.
  - `/api/user` returns `stripeEnabled: false`.
  - Billing page shows “Plans coming soon” and disables upgrade buttons.
- **When you add Stripe later:** Set real keys and price IDs in Vercel; redeploy. No code change required.

### Dev experience
- **Dev toolbar:** `src/components/dev/DevToolbar.tsx` — floating “◈ DEV” button (only in development). Actions: Seed Test Data, Simulate OpenAI/AWS Breach, Run Poll Cycle + Reload, Manual Kill/Restore, Reset Dev Data.
- **Seed:** `/api/dev/seed` creates 3 fake platforms (dev-openai-1, dev-anthropic-1, dev-aws-1) and 2 incidents. **Important:** It upserts the current auth user into the Prisma `User` table first (Supabase Auth does not create this row), so Platform FK does not fail.
- **Breach simulation:** `/api/dev/breach` injects a fake burn rate into Redis so the next poll can trigger the circuit breaker.
- **Dev mode flags:** `DEV_BYPASS_STRIPE=true` and `DEV_USER_PLAN=PRO` in `.env.local` for local testing without Stripe.

### Observability & config
- **Sentry:** Client/server/edge configs; `next.config.js` wraps with `withSentryConfig` only when `NEXT_PUBLIC_SENTRY_DSN` is set (not REPLACE_ME). `src/instrumentation.ts` loads Sentry only when DSN is set to avoid loading OpenTelemetry when unused.
- **PostHog:** `src/lib/posthog.ts` + PostHogProvider in layout; init only when `NEXT_PUBLIC_POSTHOG_KEY` is set and not REPLACE_ME.
- **Resend:** Used for transactional/alert emails (e.g. signup verification); optional for basic run.

---

## 3. Environment Variables (Reference)

### Required for app to run (local and production)
- **Supabase:** `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Encryption:** `ENCRYPTION_KEY` (32 bytes hex, from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- **Redis:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **App:** `CRON_SECRET` (e.g. 24 bytes hex), `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000` locally, `https://your-app.vercel.app` in prod)

### Required for production cron (QStash)
- `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`

### Optional (app still runs without them)
- **Stripe (all 6):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM` — when missing, billing shows “Plans coming soon.”
- **Resend:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — for emails; can use `onboarding@resend.dev` for testing.
- **Sentry:** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — for error reporting and optional source map upload.
- **PostHog:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (e.g. `https://eu.i.posthog.com` for EU cloud).

### Dev-only (do not set in production or set false)
- `DEV_BYPASS_STRIPE` — set `true` locally to bypass Stripe; omit or `false` in production.
- `DEV_USER_PLAN` — optional local override.

### Where vars live
- **Next.js (dev/build):** `.env.local` (and optionally `.env` for shared non-secrets).
- **Prisma CLI:** `.env` must contain `DATABASE_URL` and `DIRECT_URL` (Prisma does not load `.env.local`).
- **Production:** Vercel project → Settings → Environment Variables (add all required + optional you need).

### Database URLs (Supabase)
- Use **pooler** URLs: transaction mode `:6543` with `?pgbouncer=true` for `DATABASE_URL`; session mode `:5432` (same pooler host) for `DIRECT_URL`. Do not use the direct DB host (`db.xxx.supabase.co:5432`) if your network blocks it; use pooler for both.

---

## 4. Key Files and Conventions

- **Business logic:** Only in `src/modules/`; API routes are thin (auth → call module → return).
- **Security:** No `encryptedCreds` or raw secrets in API responses; auth checked on all protected routes; Stripe webhook verifies signature.
- **Style:** TypeScript strict; Zod on API inputs; `@/` alias; no default exports except Next.js pages/layouts.
- **Tests:** Vitest; circuit breaker algorithms under `src/modules/circuit-breaker/` have unit tests. Run: `npm run build` and `npx vitest run` (28 tests).

---

## 5. Deployment (Vercel)

1. Deploy: `vercel --prod` from project root.
2. Add all required (and desired optional) env vars in Vercel → Project → Settings → Environment Variables for Production.
3. Set `NEXT_PUBLIC_APP_URL` to the production URL; do not set `DEV_BYPASS_STRIPE` (or set `false`) in production.
4. Supabase: Authentication → URL Configuration — set Site URL and Redirect URLs to the production domain.
5. QStash: Create a schedule to POST to `https://your-app.vercel.app/api/cron/poll` every minute (or as needed).
6. Verify: `curl https://your-app.vercel.app/api/health` and `curl https://your-app.vercel.app/api/env-check` to confirm DB/Redis and env var presence (env-check never returns secret values).

---

## 6. Handoff Checklist for Claude

- **Codebase:** Next.js 14 App Router, Prisma, Supabase Auth, Upstash Redis/QStash; Stripe/Resend/Sentry/PostHog integrated but optional where noted.
- **Secrets:** Never log or return `encryptedCreds` or env values; use `/api/env-check` for “set vs missing” only.
- **DB:** Prisma uses `.env` for CLI; Next uses `.env.local`; keep DATABASE_URL/DIRECT_URL in sync; User row must exist before creating Platform (seed does user upsert first).
- **Stripe:** Optional until billing is enabled; `isStripeConfigured` drives 503 on checkout/portal and “Plans coming soon” on billing page.
- **Dev:** DevToolbar, `/api/dev/seed`, `/api/dev/breach`, `/api/dev/reset` are disabled in production (NODE_ENV check).
- **Tests:** `npm run build` and `npx vitest run` should pass before considering the handoff complete.

Use this document to bring Claude (or any other agent) up to speed on what CostGuard is, what’s implemented, how env and deployment work, and what to do next (e.g. deploy, add Stripe, or extend features).
