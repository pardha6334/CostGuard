// next.config.js
// CostGuard — Next.js configuration with optional Sentry integration

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
}

// Only wrap with withSentryConfig when a real DSN is configured.
// With REPLACE_ME placeholders, skip Sentry entirely to avoid
// the SDK injecting chunks that cause SyntaxError in the browser.
const hasSentryDsn =
  !!process.env.NEXT_PUBLIC_SENTRY_DSN &&
  process.env.NEXT_PUBLIC_SENTRY_DSN !== 'REPLACE_ME'

if (hasSentryDsn) {
  const { withSentryConfig } = require('@sentry/nextjs')
  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    hideSourceMaps: true,
    widenClientFileUpload: false,
    telemetry: false,
  })
} else {
  module.exports = nextConfig
}
