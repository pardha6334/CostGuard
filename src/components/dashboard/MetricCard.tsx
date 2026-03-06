'use client'
// src/components/dashboard/MetricCard.tsx
// CostGuard — Metric card with sparkline, delta badge, ghost background number
import { useMemo } from 'react'

interface MetricCardProps {
  label: string
  value: string
  sub: string
  delta?: string
  deltaDir?: 'up' | 'down'
  color?: string
  sparkData?: number[]
  bgChar?: string
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 200
  const h = 32
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  })

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  )
}

export default function MetricCard({
  label,
  value,
  sub,
  delta,
  deltaDir,
  color = 'var(--safe)',
  sparkData = [],
  bgChar = '$',
}: MetricCardProps) {
  const cardClass = useMemo(() => {
    if (color === 'var(--kill)') return 'danger'
    if (color === 'var(--warn)') return 'warn'
    return ''
  }, [color])

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${cardClass === 'danger' ? 'rgba(255,26,46,0.4)' : cardClass === 'warn' ? 'rgba(255,184,0,0.3)' : 'var(--border)'}`,
        borderRadius: '12px',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        animation: cardClass === 'danger' ? 'danger-pulse 1.5s infinite' : 'none',
      }}
    >
      {/* Gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* Label row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
          fontSize: '10px',
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}
      >
        <span>{label}</span>
        {delta && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '2px',
              color: deltaDir === 'up' ? 'var(--kill)' : 'var(--safe)',
              background: deltaDir === 'up' ? 'rgba(255,26,46,0.1)' : 'rgba(0,255,106,0.08)',
            }}
          >
            {delta}
          </span>
        )}
      </div>

      {/* Value */}
      <div
        style={{
          fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
          fontSize: '36px',
          fontWeight: 800,
          letterSpacing: '-1px',
          lineHeight: 1,
          color,
        }}
      >
        {value}
      </div>

      {/* Sub */}
      <div
        style={{
          fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
          fontSize: '11px',
          color: 'var(--muted)',
          marginTop: '8px',
        }}
      >
        {sub}
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <div style={{ marginTop: '12px', height: '32px' }}>
          <Sparkline data={sparkData} color={color} />
        </div>
      )}

      {/* Ghost BG number */}
      <div
        style={{
          position: 'absolute',
          right: '-10px',
          bottom: '-10px',
          fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
          fontSize: '80px',
          fontWeight: 900,
          color: 'rgba(255,255,255,0.02)',
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {bgChar}
      </div>

      <style>{`
        @keyframes danger-pulse {
          0%,100% { box-shadow: 0 0 20px rgba(255,26,46,0.08); }
          50% { box-shadow: 0 0 40px rgba(255,26,46,0.18); }
        }
      `}</style>
    </div>
  )
}
