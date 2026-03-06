'use client'
// src/components/dashboard/SpendChartDynamic.tsx
// CostGuard — SSR-safe wrapper for SpendChart (Recharts requires browser DOM measurements)
import dynamic from 'next/dynamic'

export const SpendChartDynamic = dynamic(
  () => import('./SpendChart'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
          height: '200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
          fontSize: '11px',
          color: 'var(--muted2)',
        }}
      >
        Loading chart...
      </div>
    ),
  }
)
