'use client'
// src/components/dashboard/DistanceGauge.tsx
// CostGuard — Hero component: animated fill bar showing burn rate vs threshold
import { useMemo } from 'react'

interface DistanceGaugeProps {
  platform: string
  icon: string
  burnRate: number
  threshold: number
  killed?: boolean
  compact?: boolean
}

export default function DistanceGauge({ platform, icon, burnRate, threshold, killed = false, compact = false }: DistanceGaugeProps) {
  const pct = useMemo(() => Math.min((burnRate / Math.max(threshold, 0.01)) * 100, 110), [burnRate, threshold])
  const isBreached = pct >= 100

  const fillClass = killed
    ? 'killed'
    : pct >= 85
    ? 'danger'
    : pct >= 60
    ? 'warn'
    : 'safe'

  const fillColor = killed
    ? 'var(--muted2)'
    : pct >= 85
    ? 'var(--kill)'
    : pct >= 60
    ? 'var(--warn)'
    : 'var(--safe)'

  const glowColor = killed
    ? 'none'
    : pct >= 85
    ? 'var(--kill-glow)'
    : pct >= 60
    ? 'var(--warn-glow)'
    : 'var(--safe-glow)'

  const remaining = threshold - burnRate
  const distLabel = killed
    ? 'KILLED'
    : isBreached
    ? 'BREACHED'
    : `$${remaining.toFixed(0)}/hr left`

  return (
    <div style={{ margin: compact ? '8px 0 4px' : '14px 0 10px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '9px',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {compact ? '' : `${icon} `}{platform}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '11px',
            fontWeight: 700,
            color: killed ? 'var(--muted)' : isBreached ? 'var(--kill)' : fillColor,
          }}
        >
          {distLabel}
        </span>
      </div>

      {/* Track */}
      <div
        style={{
          height: compact ? '3px' : '6px',
          background: 'var(--border)',
          borderRadius: '3px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Fill */}
        <div
          style={{
            height: '100%',
            width: `${Math.min(pct, 100)}%`,
            borderRadius: '3px',
            background: killed
              ? 'var(--muted2)'
              : pct >= 85
              ? `linear-gradient(90deg, rgba(255,26,46,0.5), var(--kill))`
              : pct >= 60
              ? `linear-gradient(90deg, rgba(255,184,0,0.4), var(--warn))`
              : `linear-gradient(90deg, rgba(0,255,106,0.4), var(--safe))`,
            transition: 'width 1.2s cubic-bezier(0.23,1,0.32,1)',
            animation: !killed && pct >= 85 ? 'fill-danger 0.5s infinite alternate' : 'none',
            position: 'relative',
          }}
        >
          {/* Right-edge highlight */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '3px',
              filter: 'blur(2px)',
              background: fillColor,
              borderRadius: '3px',
              boxShadow: pct >= 85 ? `0 0 8px ${glowColor}` : 'none',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes fill-danger { from { opacity: 0.8; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}
