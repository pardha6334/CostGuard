'use client'
// src/components/platforms/PlatformFullCard.tsx
// CostGuard — Full platform card for the /platforms page
import { useState } from 'react'
import type { Platform } from '@/lib/types'
import { getPlatformState, PROVIDER_ICONS, PROVIDER_COLORS } from '@/lib/types'
import DistanceGauge from '@/components/dashboard/DistanceGauge'

interface PlatformFullCardProps {
  platform: Platform
  onKill: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<void>
  onMutate: () => void
}

const STATE_BORDER: Record<string, string> = {
  safe: '4px solid var(--safe)',
  warn: '4px solid var(--warn)',
  danger: '4px solid var(--kill)',
  killed: '4px solid var(--muted2)',
}

const STATE_BADGE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  safe: { color: 'var(--safe)', bg: 'rgba(0,255,106,0.08)', border: '1px solid rgba(0,255,106,0.15)', label: 'SAFE' },
  warn: { color: 'var(--warn)', bg: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)', label: 'ELEVATED' },
  danger: { color: 'var(--kill)', bg: 'rgba(255,26,46,0.08)', border: '1px solid rgba(255,26,46,0.2)', label: 'DANGER' },
  killed: { color: 'var(--muted)', bg: 'rgba(90,90,136,0.1)', border: '1px solid rgba(90,90,136,0.2)', label: 'KILLED' },
}

export default function PlatformFullCard({ platform, onKill, onRestore, onMutate }: PlatformFullCardProps) {
  const [isActing, setIsActing] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)

  const state = getPlatformState(platform)
  const icon = PROVIDER_ICONS[platform.provider] ?? '●'
  const iconColor = PROVIDER_COLORS[platform.provider] ?? 'var(--muted)'
  const badge = STATE_BADGE[state]
  const burnRate = platform.burnRate ?? 0
  const spendToday = platform.spendToday ?? 0
  const creditBalance = platform.creditBalance ?? null
  const creditRemaining = creditBalance != null ? Math.max(0, creditBalance - spendToday) : null
  const creditPct = creditBalance != null && creditBalance > 0 ? creditRemaining! / creditBalance : null

  const handleKill = async () => {
    setIsActing(true)
    try { await onKill(platform.id) } finally { setIsActing(false) }
  }

  const handleRestore = async () => {
    setIsActing(true)
    try { await onRestore(platform.id) } finally { setIsActing(false) }
  }

  const handleTestConnection = async () => {
    setIsActing(true)
    setTestResult(null)
    try {
      // Simple ping via re-fetching the platform list
      const res = await fetch('/api/platforms')
      setTestResult(res.ok ? 'ok' : 'fail')
      setTimeout(() => setTestResult(null), 3000)
    } catch {
      setTestResult('fail')
    } finally {
      setIsActing(false)
    }
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: STATE_BORDER[state],
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'all 0.2s',
        opacity: state === 'killed' ? 0.75 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              background: `${iconColor}1A`,
            }}
          >
            {icon}
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                fontSize: '17px',
                fontWeight: 700,
              }}
            >
              {platform.displayName ?? platform.provider}
            </div>
            <span
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '9px',
                color: 'var(--muted)',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                padding: '2px 7px',
                borderRadius: '3px',
                display: 'inline-block',
                marginTop: '3px',
              }}
            >
              {platform.environment || platform.provider}
            </span>
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '9px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '2px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: badge.color,
            background: badge.bg,
            border: badge.border,
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: creditBalance != null ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', borderTop: '1px solid var(--border)' }}>
        {[
          { label: 'Burn Rate', value: `$${burnRate.toFixed(2)}/hr` },
          { label: "Today's Spend", value: `$${spendToday.toFixed(2)}` },
          { label: 'Daily Budget', value: `$${platform.dailyBudget}` },
          ...(creditBalance != null ? [{
            label: 'Credits Left',
            value: `$${creditRemaining!.toFixed(2)}`,
            warn: creditPct != null && creditPct < 0.2,
          }] : []),
        ].map((stat) => (
          <div key={stat.label} style={{ padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
            <div
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '9px',
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '4px',
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                fontSize: '18px',
                fontWeight: 800,
                letterSpacing: '-0.5px',
                color: ('warn' in stat && stat.warn) ? 'var(--warn)' : undefined,
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Credit balance progress bar — only shown when creditBalance is set */}
      {creditBalance != null && creditPct != null && (
        <div style={{ padding: '6px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '9px', color: 'var(--muted)' }}>
              CREDIT REMAINING
            </span>
            <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '9px', color: 'var(--muted)' }}>
              ${creditRemaining!.toFixed(2)} / ${creditBalance.toFixed(2)}
            </span>
          </div>
          <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, creditPct * 100)).toFixed(1)}%`,
                background: creditPct > 0.4 ? 'var(--safe)' : creditPct > 0.2 ? 'var(--warn)' : 'var(--kill)',
                borderRadius: '2px',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Gauge */}
      <div style={{ padding: '10px 20px 14px' }}>
        <DistanceGauge
          platform={platform.displayName ?? platform.provider}
          icon={icon}
          burnRate={burnRate}
          threshold={platform.hourlyLimit}
          killed={platform.breakerState === 'OPEN'}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', padding: '0 16px 14px' }}>
        {platform.breakerState === 'OPEN' ? (
          <button
            onClick={handleRestore}
            disabled={isActing}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '5px',
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              cursor: isActing ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(0,255,106,0.3)',
              background: 'transparent',
              color: 'var(--safe)',
            }}
          >
            ↺ Restore
          </button>
        ) : (
          <button
            onClick={handleKill}
            disabled={isActing || state === 'killed'}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '5px',
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              cursor: isActing ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,26,46,0.3)',
              background: 'transparent',
              color: 'var(--kill)',
            }}
          >
            ⚡ Kill
          </button>
        )}
        <button
          onClick={handleTestConnection}
          disabled={isActing}
          style={{
            flex: 1,
            padding: '7px 0',
            borderRadius: '5px',
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            cursor: isActing ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: testResult === 'ok' ? 'var(--safe)' : testResult === 'fail' ? 'var(--kill)' : 'var(--muted)',
          }}
        >
          {testResult === 'ok' ? '✓ OK' : testResult === 'fail' ? '✗ Fail' : '◎ Test'}
        </button>
      </div>

      {/* Last polled */}
      <div
        style={{
          fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
          fontSize: '9px',
          color: 'var(--muted2)',
          padding: '0 20px 10px',
        }}
      >
        {platform.lastPolledAt
          ? `Last polled ${new Date(platform.lastPolledAt).toLocaleTimeString()}`
          : 'Not polled yet'}
      </div>
    </div>
  )
}
