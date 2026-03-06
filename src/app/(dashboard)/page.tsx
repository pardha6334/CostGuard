'use client'
// src/app/(dashboard)/page.tsx
// CostGuard — Main dashboard: metric cards, spend chart, platform grid, kill panel
import { useCallback, useMemo, useState } from 'react'
import MetricCard from '@/components/dashboard/MetricCard'
import KillPanel from '@/components/dashboard/KillPanel'
import { SpendChartDynamic as SpendChart } from '@/components/dashboard/SpendChartDynamic'
import ActivityFeed from '@/components/dashboard/ActivityFeed'
import PlatformCard from '@/components/dashboard/PlatformCard'
import { usePlatforms } from '@/lib/hooks/usePlatforms'
import { useIncidents } from '@/lib/hooks/useIncidents'
import type { ActivityItem, Platform } from '@/lib/types'
import { getPlatformState } from '@/lib/types'

function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        height: '120px',
        animation: 'skeleton-pulse 1.5s infinite',
      }}
    />
  )
}

export default function DashboardPage() {
  const { platforms, isLoading: platformsLoading, mutate: mutatePlatforms } = usePlatforms()
  const { incidents, totalSaved, isLoading: incidentsLoading } = useIncidents({ limit: 10 })
  const [activity, setActivity] = useState<ActivityItem[]>([])

  const activePlatforms = platforms.filter((p) => p.isActive)
  const totalBurnRate = activePlatforms
    .filter((p) => p.breakerState !== 'OPEN')
    .reduce((s, p) => s + (p.burnRate ?? 0), 0)

  const todaySpend = activePlatforms.reduce((s, p) => s + (p.spendToday ?? 0), 0)

  const worstState = useMemo(() => {
    const states = activePlatforms.map((p) => getPlatformState(p))
    if (states.includes('danger')) return 'breach'
    if (states.includes('warn')) return 'elevated'
    return 'nominal'
  }, [activePlatforms]) as 'breach' | 'elevated' | 'nominal'

  const activeBreaches = activePlatforms.filter((p) => getPlatformState(p) === 'danger').length

  const burnColor =
    totalBurnRate > 200 ? 'var(--kill)' : totalBurnRate > 100 ? 'var(--warn)' : 'var(--safe)'

  const handleKill = useCallback(async (platformId: string) => {
    const res = await fetch('/api/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId }),
    })
    if (res.ok) {
      const p = platforms.find((x: Platform) => x.id === platformId)
      if (p) {
        setActivity((prev) => [
          {
            id: `kill-${Date.now()}`,
            type: 'kill',
            platform: p.displayName ?? p.provider,
            message: 'Kill switch executed',
            amount: p.burnRate,
            time: new Date(),
          },
          ...prev,
        ])
      }
      await mutatePlatforms()
    }
  }, [platforms, mutatePlatforms])

  const handleRestore = useCallback(async (platformId: string) => {
    const res = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId }),
    })
    if (res.ok) {
      const p = platforms.find((x: Platform) => x.id === platformId)
      if (p) {
        setActivity((prev) => [
          {
            id: `restore-${Date.now()}`,
            type: 'restore',
            platform: p.displayName ?? p.provider,
            message: 'Service restored (HALF_OPEN)',
            time: new Date(),
          },
          ...prev,
        ])
      }
      await mutatePlatforms()
    }
  }, [platforms, mutatePlatforms])

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 340px',
          gridTemplateRows: 'auto auto auto',
          gap: '20px',
        }}
      >
        {/* Metric 1 — Total Burn Rate */}
        {platformsLoading ? (
          <SkeletonCard />
        ) : (
          <MetricCard
            label="Total Burn Rate"
            value={`$${totalBurnRate.toFixed(2)}`}
            sub="per hour across all platforms"
            color={burnColor}
            bgChar="$"
          />
        )}

        {/* Metric 2 — Today's Spend */}
        {platformsLoading ? (
          <SkeletonCard />
        ) : (
          <MetricCard
            label="Today's Spend"
            value={`$${todaySpend.toFixed(2)}`}
            sub="cumulative today"
            color="var(--cyan)"
            bgChar="24h"
          />
        )}

        {/* Metric 3 — Lifetime Saved */}
        {incidentsLoading ? (
          <SkeletonCard />
        ) : (
          <MetricCard
            label="Cost Saved (Lifetime)"
            value={`$${totalSaved.toFixed(0)}`}
            sub={`from ${incidents.length} incidents caught`}
            color="var(--safe)"
            bgChar="∞"
          />
        )}

        {/* Kill Panel — spans rows 1-3 */}
        <div style={{ gridColumn: 4, gridRow: '1 / 4' }}>
          <KillPanel
            platforms={activePlatforms}
            recentIncidents={incidents.slice(0, 3)}
            onKill={handleKill}
            onRestore={handleRestore}
          />
        </div>

        {/* Spend Chart — spans 3 cols */}
        <div style={{ gridColumn: '1 / 4' }}>
          <SpendChart />
        </div>

        {/* Platform Cards Grid + Activity Feed */}
        <div style={{ gridColumn: '1 / 4' }}>
          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            Connected Platforms
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {platformsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : activePlatforms.length === 0 ? (
            <EmptyPlatforms />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
              {activePlatforms.map((p) => (
                <PlatformCard key={p.id} platform={p} />
              ))}
            </div>
          )}

          <ActivityFeed items={activity} />
        </div>
      </div>

      <style>{`
        @keyframes skeleton-pulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  )
}

function EmptyPlatforms() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 40px',
        textAlign: 'center',
        background: 'var(--panel)',
        border: '1px dashed var(--border2)',
        borderRadius: '12px',
        marginBottom: '20px',
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
              animation: `orbit-rotate ${[8, 5, 3][i]}s linear infinite ${i === 1 ? 'reverse' : ''}`,
              borderStyle: i === 1 ? 'dashed' : 'solid',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
          }}
        >
          ◉
        </div>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
          fontSize: '20px',
          fontWeight: 700,
          letterSpacing: '1px',
          marginBottom: '8px',
        }}
      >
        No Platforms Connected
      </div>
      <div
        style={{
          fontFamily: 'Barlow, sans-serif',
          fontSize: '13px',
          color: 'var(--muted)',
          maxWidth: '280px',
          lineHeight: 1.6,
        }}
      >
        Connect your first AI platform to start monitoring spend and protecting against runaway costs.
      </div>
      <a
        href="/platforms"
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
          textDecoration: 'none',
          transition: 'all 0.2s',
        }}
      >
        + Connect First Platform
      </a>
      <style>{`
        @keyframes orbit-rotate { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
      `}</style>
    </div>
  )
}
