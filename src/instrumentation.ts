// src/instrumentation.ts
// CostGuard — Next.js instrumentation hook: loads Sentry on server startup
export async function register() {
  // Skip entirely when Sentry is not configured — avoids pulling in the
  // entire OpenTelemetry module tree and flooding the console with warnings.
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn || dsn === 'REPLACE_ME') return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}
