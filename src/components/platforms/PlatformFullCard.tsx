'use client'
// src/components/platforms/PlatformFullCard.tsx
// CostGuard — Full platform card for the /platforms page
import { useState } from 'react'
import type { Platform } from '@/lib/types'
import { getPlatformState, PROVIDER_ICONS, PROVIDER_COLORS } from '@/lib/types'
import DistanceGauge from '@/components/dashboard/DistanceGauge'

const monoFont = 'var(--font-share-tech-mono, Share Tech Mono)'

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
  const [testLatency, setTestLatency] = useState<number | null>(null)

  // Edit panel state
  const [showEdit, setShowEdit] = useState(false)
  const [editHourly, setEditHourly] = useState(String(platform.hourlyLimit))
  const [editDaily, setEditDaily] = useState(String(platform.dailyBudget))
  const [editAutoKill, setEditAutoKill] = useState(platform.autoKill)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const handleSaveSettings = async () => {
    const hourly = parseFloat(editHourly)
    const daily = parseFloat(editDaily)
    if (isNaN(hourly) || hourly <= 0 || isNaN(daily) || daily <= 0) {
      setSaveMsg('Invalid values')
      return
    }
    setIsSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch(`/api/platforms/${platform.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourlyLimit: hourly, dailyBudget: daily, autoKill: editAutoKill }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveMsg('Save failed: ' + (err?.error ?? res.status))
      } else {
        setSaveMsg('Saved!')
        onMutate()
        setTimeout(() => { setSaveMsg(null); setShowEdit(false) }, 1200)
      }
    } catch (e) {
      setSaveMsg('Network error')
    } finally {
      setIsSaving(false)
    }
  }

  const state = getPlatformState(platform)
  const icon = PROVIDER_ICONS[platform.provider] ?? '●'
  const iconColor = PROVIDER_COLORS[platform.provider] ?? 'var(--muted)'
  const badge = STATE_BADGE[state]
  const burnRate = platform.burnRate ?? 0
  const spendToday = platform.spendToday ?? 0

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
    setTestLatency(null)
    try {
      const res = await fetch(`/api/platforms/${platform.id}/test`, { method: 'POST' })
      const json = await res.json()
      setTestResult(json.ok ? 'ok' : 'fail')
      if (json.latencyMs) setTestLatency(json.latencyMs)
      setTimeout(() => { setTestResult(null); setTestLatency(null) }, 4000)
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--border)' }}>
        {[
          { label: 'Burn Rate', value: `$${burnRate.toFixed(2)}/hr` },
          { label: "Today's Spend", value: `$${spendToday.toFixed(2)}` },
          { label: 'Daily Budget', value: `$${platform.dailyBudget}` },
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
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

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
              flex: 1, padding: '7px 0', borderRadius: '5px',
              fontFamily: monoFont, fontSize: '10px', fontWeight: 700,
              letterSpacing: '0.5px', textTransform: 'uppercase',
              cursor: isActing ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(0,255,106,0.3)', background: 'transparent', color: 'var(--safe)',
            }}
          >
            ↺ Restore
          </button>
        ) : (
          <button
            onClick={handleKill}
            disabled={isActing || state === 'killed'}
            style={{
              flex: 1, padding: '7px 0', borderRadius: '5px',
              fontFamily: monoFont, fontSize: '10px', fontWeight: 700,
              letterSpacing: '0.5px', textTransform: 'uppercase',
              cursor: isActing ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,26,46,0.3)', background: 'transparent', color: 'var(--kill)',
            }}
          >
            ⚡ Kill
          </button>
        )}
        <button
          onClick={handleTestConnection}
          disabled={isActing}
          style={{
            flex: 1, padding: '7px 0', borderRadius: '5px',
            fontFamily: monoFont, fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.5px', textTransform: 'uppercase',
            cursor: isActing ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)', background: 'transparent',
            color: testResult === 'ok' ? 'var(--safe)' : testResult === 'fail' ? 'var(--kill)' : 'var(--muted)',
          }}
        >
          {testResult === 'ok'
            ? `✓ OK${testLatency ? ` ${testLatency}ms` : ''}`
            : testResult === 'fail' ? '✗ Unreachable' : '◎ Test'}
        </button>
        <button
          onClick={() => {
            setShowEdit(v => !v)
            setEditHourly(String(platform.hourlyLimit))
            setEditDaily(String(platform.dailyBudget))
            setEditAutoKill(platform.autoKill)
            setSaveMsg(null)
          }}
          style={{
            flex: 1, padding: '7px 0', borderRadius: '5px',
            fontFamily: monoFont, fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.5px', textTransform: 'uppercase',
            cursor: 'pointer',
            border: showEdit ? '1px solid var(--cyan)' : '1px solid var(--border)',
            background: showEdit ? 'rgba(0,212,255,0.07)' : 'transparent',
            color: showEdit ? 'var(--cyan)' : 'var(--muted)',
          }}
        >
          ✎ Edit
        </button>
      </div>

      {/* Inline edit panel */}
      {showEdit && (
        <div style={{
          margin: '0 16px 14px',
          padding: '14px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontFamily: monoFont, fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '5px' }}>
                Hourly Limit ($)
              </label>
              <input
                type="number"
                step="any"
                min="0.00001"
                value={editHourly}
                onChange={e => setEditHourly(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '5px', padding: '7px 10px', fontFamily: monoFont,
                  fontSize: '12px', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontFamily: monoFont, fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '5px' }}>
                Daily Budget ($)
              </label>
              <input
                type="number"
                step="any"
                min="0.00001"
                value={editDaily}
                onChange={e => setEditDaily(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '5px', padding: '7px 10px', fontFamily: monoFont,
                  fontSize: '12px', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Auto Kill toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: monoFont, fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Auto Kill
            </span>
            <button
              onClick={() => setEditAutoKill(v => !v)}
              style={{
                width: '42px', height: '22px', borderRadius: '11px', border: 'none',
                cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                background: editAutoKill ? 'var(--kill)' : 'var(--border)',
              }}
            >
              <span style={{
                position: 'absolute', top: '3px',
                left: editAutoKill ? '22px' : '3px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              style={{
                flex: 1, padding: '7px 0', borderRadius: '5px',
                fontFamily: monoFont, fontSize: '10px', fontWeight: 700,
                letterSpacing: '0.5px', textTransform: 'uppercase',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                border: '1px solid rgba(0,212,255,0.4)',
                background: 'rgba(0,212,255,0.08)', color: 'var(--cyan)',
              }}
            >
              {isSaving ? 'Saving...' : '✓ Save'}
            </button>
            <button
              onClick={() => { setShowEdit(false); setSaveMsg(null) }}
              style={{
                flex: 1, padding: '7px 0', borderRadius: '5px',
                fontFamily: monoFont, fontSize: '10px', fontWeight: 700,
                letterSpacing: '0.5px', textTransform: 'uppercase',
                cursor: 'pointer', border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--muted)',
              }}
            >
              Cancel
            </button>
            {saveMsg && (
              <span style={{
                fontFamily: monoFont, fontSize: '10px',
                color: saveMsg === 'Saved!' ? 'var(--safe)' : 'var(--kill)',
              }}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      )}

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
