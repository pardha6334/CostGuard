'use client'
// src/components/dashboard/PlatformCard.tsx
// CostGuard — Mini platform card for the dashboard grid
import type { Platform } from '@/lib/types'
import { getPlatformState, PROVIDER_ICONS, PROVIDER_COLORS } from '@/lib/types'
import DistanceGauge from './DistanceGauge'

interface PlatformCardProps {
  platform: Platform
}

const STATE_STYLES = {
  safe: {
    border: '3px solid var(--safe)',
    badge: { color: 'var(--safe)', bg: 'rgba(0,255,106,0.08)', border: '1px solid rgba(0,255,106,0.15)' },
    label: 'SAFE',
    animation: 'none',
  },
  warn: {
    border: '3px solid var(--warn)',
    badge: { color: 'var(--warn)', bg: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)' },
    label: 'ELEVATED',
    animation: 'none',
  },
  danger: {
    border: '3px solid var(--kill)',
    badge: { color: 'var(--kill)', bg: 'rgba(255,26,46,0.08)', border: '1px solid rgba(255,26,46,0.2)' },
    label: 'DANGER',
    animation: 'blink-danger 0.8s infinite',
  },
  killed: {
    border: '3px solid var(--muted2)',
    badge: { color: 'var(--muted)', bg: 'rgba(90,90,136,0.1)', border: '1px solid rgba(90,90,136,0.2)' },
    label: 'KILLED',
    animation: 'none',
  },
}

export default function PlatformCard({ platform }: PlatformCardProps) {
  const state = getPlatformState(platform)
  const styles = STATE_STYLES[state]
  const icon = PROVIDER_ICONS[platform.provider] ?? '●'
  const iconColor = PROVIDER_COLORS[platform.provider] ?? 'var(--muted)'
  const burnRate = platform.burnRate ?? 0
  const burnColor =
    state === 'danger' ? 'var(--kill)' : state === 'warn' ? 'var(--warn)' : state === 'killed' ? 'var(--muted)' : 'var(--safe)'

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderLeft: styles.border,
        borderRadius: '10px',
        padding: '18px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.23,1,0.32,1)',
        animation: state === 'danger' ? 'card-danger 2s infinite' : 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              background: `${iconColor}1A`,
            }}
          >
            {icon}
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              {platform.displayName ?? platform.provider}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '9px',
                color: 'var(--muted)',
                marginTop: '1px',
              }}
            >
              {platform.environment || 'production'}
            </div>
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '9px',
            fontWeight: 700,
            padding: '3px 7px',
            borderRadius: '2px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: styles.badge.color,
            background: styles.badge.bg,
            border: styles.badge.border,
            animation: styles.animation,
          }}
        >
          {styles.label}
        </span>
      </div>

      {/* Burn rate */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
        <span
          style={{
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '24px',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: burnColor,
          }}
        >
          ${burnRate.toFixed(2)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '10px',
            color: 'var(--muted)',
          }}
        >
          /hr
        </span>
      </div>

      {/* Distance gauge */}
      <DistanceGauge
        platform={platform.displayName ?? platform.provider}
        icon={icon}
        burnRate={burnRate}
        threshold={platform.hourlyLimit}
        killed={platform.breakerState === 'OPEN'}
        compact
      />

      {/* Today's spend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '8px',
          fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
          fontSize: '10px',
          color: 'var(--muted)',
        }}
      >
        <span>Today: ${(platform.spendToday ?? 0).toFixed(2)}</span>
        <span>Budget: ${platform.dailyBudget}/d</span>
      </div>

      <style>{`
        @keyframes card-danger { 0%,100%{background:rgba(255,26,46,0.02);} 50%{background:rgba(255,26,46,0.05);} }
        @keyframes blink-danger { 0%,100%{opacity:1;} 50%{opacity:0.5;} }
      `}</style>
    </div>
  )
}
