# Build troubleshooting

## EPERM: operation not permitted, open '.next\trace' (Windows)

This happens when something else is using the `.next` folder (e.g. a dev server, IDE, or antivirus), so the build can’t write the trace file.

**Fix:**

1. Stop any running dev server (`npm run dev`) and close any terminal/IDE that might be using the project.
2. Remove the build output and rebuild:
   ```bash
   npm run clean
   npm run build
   ```
   Or in one step: `npm run build:clean`
3. If it still fails, enable **Windows Developer Mode** (Settings → Privacy & security → For developers → Developer Mode). This can resolve file-access issues during builds.

## Sentry deprecation warning

The warning about `sentry.client.config.ts` and `instrumentation-client.ts` is from Sentry/Next.js for future Turbopack support. It does not break the build. You can ignore it or later move client Sentry setup into `instrumentation-client.ts` when you switch to Turbopack.

## Vitest CJS deprecation

The message “The CJS build of Vite's Node API is deprecated” comes from Vitest/Vite. Tests still run (28/28). You can ignore it until Vitest provides a stable ESM setup.

## Cron poll: "Can't reach database server" on Vercel

When `/api/cron/poll` runs on Vercel, it used to do one `findMany` plus many fire-and-forget `platform.update` and `spendReading.create` calls. That can exhaust Supabase's connection pool (limited connections on the pooler), leading to "Can't reach database server at … pooler.supabase.com:6543".

**What we did:** On Vercel (`VERCEL=1`), the cron no longer runs those optional DB writes. The dashboard still gets lastPolledAt and latest spend from Redis. Only the initial `findMany` (to list platforms) uses the DB per cron run.

**If you self-host:** Those DB writes still run (SpendReading and Platform.lastPolledAt are updated).

**If you still see "Can't reach":** In Supabase dashboard, confirm the project is not paused (restore it if needed). Check Database → Connection pooler and connection limits; increase pool size or upgrade if needed.

## Prisma connection pool timeout (P2024) on Vercel

When the cron or API does many DB operations (e.g. logger writing to `Log` on every log line), you may see:

```
Timed out fetching a new connection from the connection pool.
(Current connection pool timeout: 10, connection limit: 5)
```

**Fix: increase the connection pool size** so Prisma can open more connections per serverless instance.

1. In **Vercel** → your project → **Settings** → **Environment Variables**, find `DATABASE_URL`.
2. Add (or update) the query string so it includes **`connection_limit`**:
   - If the URL has **no** `?` yet, append: **`?connection_limit=10`**
   - If it already has query params (e.g. `?pgbouncer=true`), add: **`&connection_limit=10`**
3. Example (Supabase pooler):
   ```
   postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10
   ```
4. Redeploy so the new `DATABASE_URL` is used.

A value of **10** is usually enough for cron + logger. If you still see timeouts, try **15**. Do not set it very high (e.g. 50) on Vercel, or the total connections across all instances may exceed your database/pooler limit.
