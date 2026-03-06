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
