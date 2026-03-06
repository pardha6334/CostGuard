'use client'
// src/components/layout/Topbar.tsx
// CostGuard — Sticky top bar: title, system status, clock, theme toggle, alert badge
import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Command Center',
  '/platforms': 'Connected Platforms',
  '/incidents': 'Incident History',
  '/thresholds': 'Threshold Config',
}

type SystemStatus = 'nominal' | 'elevated' | 'breach'

interface TopbarProps {
  activeBreaches?: number
  systemStatus?: SystemStatus
}

export default function Topbar({ activeBreaches = 0, systemStatus = 'nominal' }: TopbarProps) {
  const pathname = usePathname()
  const [clock, setClock] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('cg-theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const toggleTheme = useCallback((t: 'dark' | 'light') => {
    setTheme(t)
    localStorage.setItem('cg-theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }, [])

  const title = PAGE_TITLES[pathname] ?? 'CostGuard'

  const statusColor = systemStatus === 'breach' ? 'var(--kill)' : systemStatus === 'elevated' ? 'var(--warn)' : 'var(--safe)'
  const statusGlow = systemStatus === 'breach' ? 'var(--kill-glow)' : systemStatus === 'elevated' ? 'var(--warn-glow)' : 'var(--safe-glow)'
  const statusText = systemStatus === 'breach' ? '⚡ BREACH DETECTED' : systemStatus === 'elevated' ? '▲ ELEVATED SPEND' : '● ALL SYSTEMS NOMINAL'

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(3,3,10,0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <span
          style={{
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '22px',
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '11px',
            color: statusColor,
            background: `${statusColor}0D`,
            border: `1px solid ${statusColor}26`,
            padding: '4px 12px',
            borderRadius: '3px',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 8px ${statusGlow}`,
              display: 'inline-block',
              animation: 'pulse-status 2s infinite',
            }}
          />
          {statusText}
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '11px',
            color: 'var(--muted2)',
          }}
        >
          POLLING EVERY 60s
        </span>
        <span
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '13px',
            color: 'var(--muted)',
          }}
        >
          {clock}
        </span>

        {/* Theme toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '3px',
            gap: 0,
          }}
        >
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => toggleTheme(t)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 11px',
                borderRadius: '16px',
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: theme === t ? 'var(--text)' : 'var(--muted)',
                background: theme === t ? 'var(--surface)' : 'transparent',
                boxShadow: theme === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <span>{t === 'dark' ? '◑' : '○'}</span> {t === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>

        {/* Alert badge */}
        <div
          style={{
            background: activeBreaches > 0 ? 'rgba(255,26,46,0.1)' : 'rgba(0,255,106,0.06)',
            border: activeBreaches > 0 ? '1px solid rgba(255,26,46,0.3)' : '1px solid rgba(0,255,106,0.2)',
            color: activeBreaches > 0 ? 'var(--kill)' : 'var(--safe)',
            padding: '4px 10px',
            borderRadius: '3px',
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '11px',
            animation: activeBreaches > 0 ? 'pulse-badge 1.5s infinite' : 'none',
          }}
        >
          {activeBreaches > 0 ? `⚠ ${activeBreaches} ACTIVE` : '● NOMINAL'}
        </div>
      </div>

      <style>{`
        @keyframes pulse-status { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        @keyframes pulse-badge { 0%,100%{opacity:1;} 50%{opacity:0.6;} }
      `}</style>
    </div>
  )
}
