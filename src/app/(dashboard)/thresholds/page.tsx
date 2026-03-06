'use client'
// src/app/(dashboard)/thresholds/page.tsx
// CostGuard — Threshold configuration: global settings + per-platform cards
import { useCallback, useState } from 'react'
import { usePlatforms } from '@/lib/hooks/usePlatforms'
import type { Platform } from '@/lib/types'

interface ToggleSwitchProps {
  on: boolean
  onChange: (val: boolean) => void
}

function ToggleSwitch({ on, onChange }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: '36px',
        height: '20px',
        background: on ? 'var(--safe)' : 'var(--border)',
        borderRadius: '10px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.25s',
        border: 'none',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: '14px',
          height: '14px',
          background: 'white',
          borderRadius: '50%',
          top: '3px',
          left: on ? '19px' : '3px',
          transition: 'left 0.25s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          display: 'block',
        }}
      />
    </button>
  )
}

const GLOBAL_SETTINGS = [
  { key: 'autoKill', label: 'Auto Kill Switch' },
  { key: 'alertSlack', label: 'Slack Alerts' },
  { key: 'alertEmail', label: 'Email Alerts' },
  { key: 'autoRestore', label: 'Auto Restore' },
  { key: 'anomalyDetect', label: 'Anomaly Detection' },
  { key: 'weeklyReports', label: 'Weekly Reports' },
]

interface PlatformCardState {
  hourlyLimit: number
  dailyBudget: number
  monthlyBudget: number
  autoKill: boolean
  anomalyDetect: boolean
  alertEmail: boolean
  alertSlack: boolean
  alertWebhook: boolean
}

function ThresholdCard({ platform, onSave }: { platform: Platform; onSave: () => void }) {
  const [state, setState] = useState<PlatformCardState>({
    hourlyLimit: platform.hourlyLimit,
    dailyBudget: platform.dailyBudget,
    monthlyBudget: platform.monthlyBudget,
    autoKill: platform.autoKill,
    anomalyDetect: platform.anomalyDetect,
    alertEmail: platform.alertEmail,
    alertSlack: platform.alertSlack,
    alertWebhook: platform.alertWebhook,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const sliderColor =
    state.hourlyLimit > 500 ? 'danger' : state.hourlyLimit > 200 ? 'warn' : 'safe'
  const sliderThumbColor =
    sliderColor === 'danger' ? 'var(--kill)' : sliderColor === 'warn' ? 'var(--warn)' : 'var(--safe)'

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await fetch(`/api/platforms/${platform.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hourlyLimit: state.hourlyLimit,
          dailyBudget: state.dailyBudget,
          monthlyBudget: state.monthlyBudget,
          autoKill: state.autoKill,
          anomalyDetect: state.anomalyDetect,
          alertEmail: state.alertEmail,
          alertSlack: state.alertSlack,
          alertWebhook: state.alertWebhook,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSave()
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setState({
      hourlyLimit: platform.hourlyLimit,
      dailyBudget: platform.dailyBudget,
      monthlyBudget: platform.monthlyBudget,
      autoKill: platform.autoKill,
      anomalyDetect: platform.anomalyDetect,
      alertEmail: platform.alertEmail,
      alertSlack: platform.alertSlack,
      alertWebhook: platform.alertWebhook,
    })
  }

  const monoLabel: React.CSSProperties = {
    fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
    fontSize: '9px',
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '16px', fontWeight: 700 }}>
            {platform.displayName ?? platform.provider}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '9px', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: '3px' }}>
          {platform.provider}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '20px' }}>
        {/* Hourly limit slider */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ ...monoLabel, display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Hourly Limit</span>
            <span style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 700 }}>${state.hourlyLimit}/hr</span>
          </div>
          <input
            type="range"
            min={1}
            max={1000}
            value={state.hourlyLimit}
            onChange={(e) => setState((s) => ({ ...s, hourlyLimit: Number(e.target.value) }))}
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              background: `linear-gradient(to right, ${sliderThumbColor} 0%, ${sliderThumbColor} ${(state.hourlyLimit / 1000) * 100}%, var(--border) ${(state.hourlyLimit / 1000) * 100}%, var(--border) 100%)`,
            }}
          />
        </div>

        {/* Daily/Monthly inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {[
            { key: 'dailyBudget', label: 'Daily Budget ($)' },
            { key: 'monthlyBudget', label: 'Monthly Cap ($)' },
          ].map(({ key, label }) => (
            <div key={key}>
              <div style={{ ...monoLabel, marginBottom: '6px' }}>{label}</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '12px', color: 'var(--muted)' }}>$</span>
                <input
                  type="number"
                  value={state[key as 'dailyBudget' | 'monthlyBudget']}
                  onChange={(e) => setState((s) => ({ ...s, [key]: Number(e.target.value) }))}
                  style={{
                    width: '100%',
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '9px 10px 9px 22px',
                    fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                    fontSize: '13px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Toggles */}
        {[
          { key: 'autoKill', label: 'Auto Kill Switch' },
          { key: 'anomalyDetect', label: 'Anomaly Detection' },
        ].map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ ...monoLabel, fontSize: '11px' }}>{label}</span>
            <ToggleSwitch
              on={state[key as 'autoKill' | 'anomalyDetect']}
              onChange={(v) => setState((s) => ({ ...s, [key]: v }))}
            />
          </div>
        ))}

        {/* Alert channels */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
          <div style={{ ...monoLabel, marginBottom: '10px' }}>Alert Channels</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { key: 'alertEmail', label: '✉ Email' },
              { key: 'alertSlack', label: '# Slack' },
              { key: 'alertWebhook', label: '⟲ Webhook' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setState((s) => ({ ...s, [key]: !s[key as 'alertEmail' | 'alertSlack' | 'alertWebhook'] }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '10px',
                  cursor: 'pointer',
                  border: state[key as 'alertEmail' | 'alertSlack' | 'alertWebhook']
                    ? '1px solid rgba(0,229,255,0.25)'
                    : '1px solid var(--border)',
                  background: state[key as 'alertEmail' | 'alertSlack' | 'alertWebhook']
                    ? 'rgba(0,229,255,0.08)'
                    : 'transparent',
                  color: state[key as 'alertEmail' | 'alertSlack' | 'alertWebhook']
                    ? 'var(--cyan)'
                    : 'var(--muted)',
                  transition: 'all 0.2s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save/Reset */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 20px 16px' }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            flex: 1,
            padding: '9px',
            background: saved ? 'rgba(0,255,106,0.15)' : 'linear-gradient(135deg, var(--kill2), var(--kill))',
            border: saved ? '1px solid rgba(0,255,106,0.3)' : 'none',
            borderRadius: '6px',
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: saved ? 'var(--safe)' : 'white',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {saved ? '✓ Saved' : isSaving ? '⟳ Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: '9px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

export default function ThresholdsPage() {
  const { platforms, isLoading, mutate } = usePlatforms()
  const [globalSettings, setGlobalSettings] = useState({
    autoKill: true,
    alertSlack: true,
    alertEmail: true,
    autoRestore: false,
    anomalyDetect: true,
    weeklyReports: false,
  })

  const handleGlobalToggle = useCallback((key: string, val: boolean) => {
    setGlobalSettings((prev) => ({ ...prev, [key]: val }))
  }, [])

  const activePlatforms = platforms.filter((p) => p.isActive)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>
          Threshold Configuration
        </div>
        <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Set limits per platform · Changes take effect on next poll cycle
        </div>
      </div>

      {/* Global Settings */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '15px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ⚙ Global Settings
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {GLOBAL_SETTINGS.map(({ key, label }) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}
            >
              <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)' }}>
                {label}
              </span>
              <ToggleSwitch
                on={globalSettings[key as keyof typeof globalSettings]}
                onChange={(v) => handleGlobalToggle(key, v)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-platform threshold cards */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', height: '400px', animation: 'skeleton-pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : activePlatforms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '12px', color: 'var(--muted)' }}>
          No platforms connected. Add a platform to configure thresholds.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {activePlatforms.map((p) => (
            <ThresholdCard key={p.id} platform={p} onSave={mutate} />
          ))}
        </div>
      )}

      <style>{`@keyframes skeleton-pulse{0%,100%{opacity:1;}50%{opacity:0.5;}}`}</style>
    </div>
  )
}
