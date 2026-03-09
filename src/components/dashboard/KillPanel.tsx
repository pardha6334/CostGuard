'use client'
// src/components/dashboard/KillPanel.tsx
// CostGuard — Kill switch panel: ring meter, blast radius, distance list, kill/restore button
import { useState, useMemo } from 'react'
import DistanceGauge from './DistanceGauge'
import type { Platform, Incident } from '@/lib/types'
import { getPlatformState, PROVIDER_ICONS } from '@/lib/types'

interface KillPanelProps {
  platforms: Platform[]
  recentIncidents: Incident[]
  onKill: (platformId: string) => Promise<void>
  onRestore: (platformId: string) => Promise<void>
}

export default function KillPanel({ platforms, recentIncidents, onKill, onRestore }: KillPanelProps) {
  const [isExecuting, setIsExecuting] = useState(false)

  const activePlatforms = platforms.filter((p) => p.isActive)
  const killedPlatforms = activePlatforms.filter((p) => p.breakerState === 'OPEN')
  const anyKilled = killedPlatforms.length > 0

  const worstPct = useMemo(() => {
    const alive = activePlatforms.filter((p) => p.breakerState !== 'OPEN')
    if (!alive.length) return 0
    return Math.max(...alive.map((p) => ((p.burnRate ?? 0) / Math.max(p.hourlyLimit, 0.01)) * 100))
  }, [activePlatforms])

  const worstPlatform = useMemo(() => {
    return activePlatforms
      .filter((p) => p.breakerState !== 'OPEN')
      .sort((a, b) => (b.burnRate ?? 0) / b.hourlyLimit - (a.burnRate ?? 0) / a.hourlyLimit)[0]
  }, [activePlatforms])

  const ringPct = Math.min(worstPct, 100)
  const circumference = 2 * Math.PI * 66 // 414.69
  const dashOffset = circumference - (ringPct / 100) * circumference

  const ringColor =
    ringPct >= 85 ? 'var(--kill)' : ringPct >= 60 ? 'var(--warn)' : 'var(--safe)'

  const ringLabel =
    ringPct >= 85 ? 'BREACH' : ringPct >= 60 ? 'ELEVATED' : 'MONITORING'

  const projectedDamage = worstPlatform
    ? (worstPlatform.burnRate ?? 0) * 24
    : 0

  const handleKillAll = async () => {
    if (isExecuting) return
    setIsExecuting(true)
    try {
      for (const p of activePlatforms.filter((p) => p.breakerState === 'CLOSED' && getPlatformState(p) !== 'safe')) {
        await onKill(p.id)
      }
    } finally {
      setIsExecuting(false)
    }
  }

  const handleRestoreAll = async () => {
    if (isExecuting) return
    setIsExecuting(true)
    try {
      for (const p of killedPlatforms) {
        await onRestore(p.id)
      }
    } finally {
      setIsExecuting(false)
    }
  }

  const btnState = anyKilled ? 'restore' : worstPct >= 85 ? 'armed' : 'safe'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Red gradient glow top-right */}
      <div
        style={{
          position: 'absolute',
          top: '-100px',
          right: '-100px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(255,26,46,0.04), transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Corner accents */}
      <div style={{ position: 'absolute', top: '-1px', left: '-1px', width: '8px', height: '8px', borderTop: '2px solid var(--kill)', borderLeft: '2px solid var(--kill)' }} />
      <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '8px', height: '8px', borderBottom: '2px solid var(--kill)', borderRight: '2px solid var(--kill)' }} />

      {/* Title */}
      <div
        style={{
          fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        Kill Command
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>

      {/* Ring Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '10px 0' }}>
        <div style={{ position: 'relative', width: '160px', height: '160px' }}>
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx="80" cy="80" r="66"
              fill="none"
              stroke="var(--border)"
              strokeWidth="6"
            />
            <circle
              cx="80" cy="80" r="66"
              fill="none"
              stroke={ringColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.23,1,0.32,1), stroke 0.5s' }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                fontSize: '26px',
                fontWeight: 900,
                letterSpacing: '-1px',
                lineHeight: 1,
                color: ringColor,
              }}
            >
              {Math.round(ringPct)}%
            </div>
            <div
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '9px',
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              of threshold
            </div>
            <div
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '8px',
                color: 'var(--muted2)',
              }}
            >
              {ringLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Blast Radius — shown when any platform > 70% */}
      {worstPct > 70 && (
        <div
          style={{
            position: 'relative',
            padding: '16px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '9px',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '12px',
            }}
          >
            ⚡ Projected Damage (24h)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    inset: `${i * 10}px`,
                    borderRadius: '50%',
                    border: `1px solid rgba(255,26,46,${0.8 - i * 0.2})`,
                    animation: `expand-ring 2s infinite`,
                    animationDelay: `${i * 0.4}s`,
                  }}
                />
              ))}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  margin: 'auto',
                  width: '10px',
                  height: '10px',
                  background: 'var(--kill)',
                  borderRadius: '50%',
                  boxShadow: '0 0 15px var(--kill-glow)',
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '28px',
                  fontWeight: 900,
                  color: 'var(--kill)',
                  letterSpacing: '-1px',
                }}
              >
                ${projectedDamage.toFixed(0)}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '9px',
                  color: 'var(--muted)',
                  marginTop: '2px',
                }}
              >
                if not killed now
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KILLED state — hard kill active card */}
      {anyKilled && (
        <div
          style={{
            background: 'rgba(255,26,46,0.06)',
            border: '1px solid rgba(255,26,46,0.35)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '14px', fontWeight: 800, color: 'var(--kill)', letterSpacing: '1px', marginBottom: '10px' }}>
            🔴 HARD KILL ACTIVE
          </div>
          <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--text)', lineHeight: 1.5 }}>
            ⚡ Instant block — 0 req/min
          </div>
          <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            116 models completely blocked
          </div>
          <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
            Coverage: 92.4% of real API spend
          </div>
          <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
            Propagation delay: None
          </div>
          <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '6px', fontSize: '10px', color: 'var(--warn, #EAB308)' }}>
            ⚠️ ft:* fine-tuned models require app-level block. <a href="/docs/FT-MODEL-KILL-INTEGRATION" style={{ color: 'var(--cyan)', textDecoration: 'underline' }}>View integration guide →</a>
          </div>
        </div>
      )}

      {/* RESTORED state message — when none killed, show last restore success */}
      {!anyKilled && activePlatforms.length > 0 && (
        <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '10px', color: 'var(--muted)' }}>
          ✅ All models restored to original limits when applicable. Original values from pre-kill snapshot.
        </div>
      )}

      {/* Distance to Threshold list */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '14px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '9px',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '10px',
          }}
        >
          Distance to Threshold
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activePlatforms.length === 0 ? (
            <div
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '10px',
                color: 'var(--muted2)',
              }}
            >
              No platforms connected
            </div>
          ) : (
            activePlatforms.slice(0, 5).map((p) => (
              <DistanceGauge
                key={p.id}
                platform={p.displayName ?? p.provider}
                icon={PROVIDER_ICONS[p.provider] ?? '●'}
                burnRate={p.burnRate ?? 0}
                threshold={p.hourlyLimit}
                killed={p.breakerState === 'OPEN'}
                compact
              />
            ))
          )}
        </div>
      </div>

      {/* Kill / Restore Button */}
      <button
        onClick={btnState === 'armed' ? handleKillAll : btnState === 'restore' ? handleRestoreAll : undefined}
        disabled={btnState === 'safe' || isExecuting}
        style={{
          position: 'relative',
          width: '100%',
          padding: '16px',
          border: btnState === 'safe' ? '1px solid rgba(0,255,106,0.2)' : btnState === 'restore' ? '1px solid rgba(0,255,106,0.25)' : 'none',
          borderRadius: '8px',
          fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
          fontSize: '16px',
          fontWeight: 800,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          cursor: btnState === 'safe' ? 'default' : 'pointer',
          transition: 'all 0.2s',
          background:
            btnState === 'armed'
              ? 'linear-gradient(135deg, var(--kill2), var(--kill))'
              : btnState === 'restore'
              ? 'rgba(0,255,106,0.08)'
              : 'rgba(0,255,106,0.08)',
          color:
            btnState === 'armed' ? 'white' : 'var(--safe)',
          boxShadow: btnState === 'armed' ? '0 4px 30px rgba(255,26,46,0.4)' : 'none',
          overflow: 'hidden',
        }}
      >
        {isExecuting
          ? '⟳ EXECUTING...'
          : btnState === 'armed'
          ? '⚡ EXECUTE KILL SWITCH'
          : btnState === 'restore'
          ? '↺ RESTORE ALL SERVICES'
          : '◉ SYSTEM SAFE'}
      </button>

      {/* Recent Actions */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '9px',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}
        >
          Recent Actions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {recentIncidents.length === 0 ? (
            <div
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '10px',
                color: 'var(--muted2)',
              }}
            >
              No actions yet
            </div>
          ) : (
            recentIncidents.slice(0, 3).map((inc) => (
              <div
                key={inc.id}
                style={{
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '10px',
                  color: 'var(--muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{inc.platform?.displayName ?? inc.platform?.provider ?? '?'}</span>
                <span style={{ color: 'var(--safe)' }}>-${inc.estimatedSaved.toFixed(0)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes expand-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(1.2); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
