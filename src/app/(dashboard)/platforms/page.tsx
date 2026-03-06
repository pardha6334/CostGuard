'use client'
// src/app/(dashboard)/platforms/page.tsx
// CostGuard — Connected platforms management page
import { useCallback, useState } from 'react'
import { usePlatforms } from '@/lib/hooks/usePlatforms'
import PlatformFullCard from '@/components/platforms/PlatformFullCard'
import ConnectWizard from '@/components/platforms/ConnectWizard'

export default function PlatformsPage() {
  const { platforms, isLoading, mutate } = usePlatforms()
  const [showWizard, setShowWizard] = useState(false)

  const activePlatforms = platforms.filter((p) => p.isActive)

  const handleKill = useCallback(async (id: string) => {
    await fetch('/api/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId: id }),
    })
    await mutate()
  }, [mutate])

  const handleRestore = useCallback(async (id: string) => {
    await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId: id }),
    })
    await mutate()
  }, [mutate])

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
            }}
          >
            Connected Platforms
          </div>
          <div
            style={{
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '11px',
              color: 'var(--muted)',
              marginTop: '4px',
            }}
          >
            {activePlatforms.length} platforms monitored · Real-time circuit breaker protection
          </div>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: 'linear-gradient(135deg, var(--kill2), var(--kill))',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          + Connect Platform
        </button>
      </div>

      {/* Platform grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                height: '300px',
                animation: 'skeleton-pulse 1.5s infinite',
              }}
            />
          ))}
        </div>
      ) : activePlatforms.length === 0 ? (
        <EmptyState onConnect={() => setShowWizard(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {activePlatforms.map((p) => (
            <PlatformFullCard
              key={p.id}
              platform={p}
              onKill={handleKill}
              onRestore={handleRestore}
              onMutate={mutate}
            />
          ))}
        </div>
      )}

      {/* Connect wizard modal */}
      {showWizard && (
        <ConnectWizard
          onClose={() => setShowWizard(false)}
          onSuccess={async () => {
            setShowWizard(false)
            await mutate()
          }}
        />
      )}

      <style>{`
        @keyframes skeleton-pulse { 0%,100%{opacity:1;} 50%{opacity:0.5;} }
      `}</style>
    </div>
  )
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        textAlign: 'center',
        background: 'var(--panel)',
        border: '1px dashed var(--border2)',
        borderRadius: '12px',
      }}
    >
      <div style={{ position: 'relative', width: '120px', height: '120px', marginBottom: '28px' }}>
        {[0, 20, 40].map((inset, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: `${inset}px`,
              borderRadius: '50%',
              border: '1px solid var(--border2)',
              borderStyle: i === 1 ? 'dashed' : 'solid',
              animation: `orbit-rotate ${[8, 5, 3][i]}s linear infinite ${i === 1 ? 'reverse' : ''}`,
            }}
          />
        ))}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
          ⬡
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '20px', fontWeight: 700, letterSpacing: '1px', marginBottom: '8px' }}>
        No Platforms Connected
      </div>
      <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', color: 'var(--muted)', maxWidth: '300px', lineHeight: 1.6 }}>
        Connect your AI and cloud platforms to start monitoring spend and protect against runaway costs.
      </div>
      <button
        onClick={onConnect}
        style={{
          marginTop: '20px',
          padding: '10px 24px',
          background: 'rgba(255,26,46,0.1)',
          border: '1px solid rgba(255,26,46,0.25)',
          color: 'var(--kill)',
          borderRadius: '6px',
          fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        + Connect First Platform
      </button>
      <style>{`@keyframes orbit-rotate { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }`}</style>
    </div>
  )
}
