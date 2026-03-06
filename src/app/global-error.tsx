// src/app/global-error.tsx
// CostGuard — Global error boundary with Sentry reporting
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body
        style={{
          background: '#03030A',
          color: '#E0E0FF',
          fontFamily: 'sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 48 }}>⚡</div>
        <h2 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h2>
        <p style={{ color: '#5A5A88', margin: 0, fontSize: 14 }}>
          {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred'}
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            padding: '8px 20px',
            background: '#FF1A2E',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
