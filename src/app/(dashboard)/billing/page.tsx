'use client'
// src/app/(dashboard)/billing/page.tsx
// CostGuard — Billing page: current plan, trial countdown, plan cards, upgrade/portal
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { DEV_BYPASS_STRIPE } from '@/lib/dev-mode'

// Static plan display data (no server-side Stripe import needed here)
const PLANS = [
  {
    key: 'STARTER' as const,
    name: 'Starter',
    price: 49,
    platforms: 3,
    pollInterval: '60s',
    features: [
      '3 platforms monitored',
      '60s polling interval',
      'Email + Slack alerts',
      'Hourly kill switch',
      '90-day incident history',
    ],
    highlight: false,
  },
  {
    key: 'PRO' as const,
    name: 'Pro',
    price: 149,
    platforms: 15,
    pollInterval: '30s',
    features: [
      '15 platforms monitored',
      '30s polling interval',
      'Anomaly detection (Z-score)',
      'Custom webhook alerts',
      'Priority support',
    ],
    highlight: true,
  },
  {
    key: 'TEAM' as const,
    name: 'Team',
    price: 299,
    platforms: 23,
    pollInterval: '15s',
    features: [
      '23 platforms monitored',
      '15s polling interval',
      'Team members (5 seats)',
      'SSO + audit log',
      'SLA + dedicated support',
    ],
    highlight: false,
  },
]

const PLAN_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  TRIAL:   { label: 'TRIAL',   color: 'var(--warn)',  bg: 'rgba(255,184,0,0.08)',  border: '1px solid rgba(255,184,0,0.25)' },
  STARTER: { label: 'STARTER', color: 'var(--cyan)',  bg: 'rgba(0,229,255,0.08)',  border: '1px solid rgba(0,229,255,0.2)' },
  PRO:     { label: 'PRO',     color: 'var(--safe)',  bg: 'rgba(0,255,106,0.08)',  border: '1px solid rgba(0,255,106,0.2)' },
  TEAM:    { label: 'TEAM',    color: 'var(--kill)',  bg: 'rgba(255,26,46,0.08)',  border: '1px solid rgba(255,26,46,0.2)' },
}

interface UserInfo {
  plan: string
  trialEndsAt: string | null
  hasStripeId: boolean
  stripeEnabled?: boolean
  email: string
}

function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null
  const diff = new Date(trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'neutral'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        top: '70px',
        right: '24px',
        zIndex: 2000,
        background: 'var(--surface)',
        border: `1px solid ${type === 'success' ? 'rgba(0,255,106,0.3)' : 'var(--border)'}`,
        borderLeft: `3px solid ${type === 'success' ? 'var(--safe)' : 'var(--muted)'}`,
        borderRadius: '8px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minWidth: '300px',
        fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
        fontSize: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'toast-in 0.4s cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      <span>{type === 'success' ? '✓' : '○'}</span>
      <span style={{ flex: 1, color: 'var(--text)' }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);}}`}</style>
    </div>
  )
}

function BillingContent() {
  const searchParams = useSearchParams()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'neutral' } | null>(null)

  // Show toast from URL params
  useEffect(() => {
    if (searchParams.get('success') === '1') {
      setToast({ message: '🎉 Plan upgraded successfully! Welcome aboard.', type: 'success' })
      // Clean URL
      window.history.replaceState({}, '', '/billing')
    } else if (searchParams.get('canceled') === '1') {
      setToast({ message: 'Upgrade canceled. Your current plan is unchanged.', type: 'neutral' })
      window.history.replaceState({}, '', '/billing')
    }
  }, [searchParams])

  useEffect(() => {
    fetch('/api/user')
      .then((r) => r.json())
      .then((data) => { if (data.plan) setUserInfo(data) })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const handleUpgrade = useCallback(async (plan: 'STARTER' | 'PRO' | 'TEAM') => {
    if (DEV_BYPASS_STRIPE) {
      alert('DEV MODE: Stripe disabled. Set DEV_BYPASS_STRIPE=false to enable.')
      return
    }
    if (userInfo?.stripeEnabled === false) {
      setToast({ message: 'Plans coming soon. We\'ll notify you when billing is available.', type: 'neutral' })
      return
    }
    setUpgradingPlan(plan)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else if (res.status === 503 && data.error) setToast({ message: data.error, type: 'neutral' })
    } catch {
      setToast({ message: 'Failed to create checkout session. Please try again.', type: 'neutral' })
    } finally {
      setUpgradingPlan(null)
    }
  }, [userInfo?.stripeEnabled])

  const handlePortal = useCallback(async () => {
    setIsPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      setToast({ message: 'Failed to open billing portal. Please try again.', type: 'neutral' })
    } finally {
      setIsPortalLoading(false)
    }
  }, [])

  const monoLabel: React.CSSProperties = {
    fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
    fontSize: '10px',
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '8px',
  }

  const currentPlan = userInfo?.plan ?? 'TRIAL'
  const badge = PLAN_BADGE[currentPlan] ?? PLAN_BADGE.TRIAL
  const daysLeft = trialDaysLeft(userInfo?.trialEndsAt ?? null)
  const canUpgrade = userInfo?.stripeEnabled !== false || DEV_BYPASS_STRIPE

  return (
    <div>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Page header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>
          Billing & Plans
        </div>
        <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Manage your subscription and usage limits
        </div>
      </div>

      {/* Current plan card */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ ...monoLabel, marginBottom: '6px' }}>Current Plan</div>
          {isLoading ? (
            <div style={{ height: '32px', width: '120px', background: 'var(--panel)', borderRadius: '6px', animation: 'skeleton-pulse 1.5s infinite' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '28px',
                  fontWeight: 900,
                  letterSpacing: '-0.5px',
                  color: badge.color,
                }}
              >
                {badge.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '3px',
                  color: badge.color,
                  background: badge.bg,
                  border: badge.border,
                  letterSpacing: '1px',
                }}
              >
                ACTIVE
              </span>
            </div>
          )}
          {!isLoading && currentPlan === 'TRIAL' && daysLeft !== null && (
            <div
              style={{
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '11px',
                color: daysLeft <= 3 ? 'var(--kill)' : 'var(--warn)',
                marginTop: '6px',
              }}
            >
              {daysLeft > 0 ? `⏱ ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining in trial` : '⚠ Trial expired'}
            </div>
          )}
        </div>
        {!isLoading && userInfo?.hasStripeId && userInfo?.stripeEnabled !== false && (
          <button
            onClick={handlePortal}
            disabled={isPortalLoading}
            style={{
              padding: '10px 20px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: 'var(--text)',
              cursor: isPortalLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {isPortalLoading ? '⟳ Opening...' : '⚙ Manage Billing'}
          </button>
        )}
      </div>

      {/* Dev mode banner */}
      {DEV_BYPASS_STRIPE && (
        <div
          style={{
            background: 'rgba(0,229,255,0.06)',
            border: '1px solid rgba(0,229,255,0.2)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            fontFamily: 'monospace',
            fontSize: 12,
            color: 'var(--cyan)',
          }}
        >
          ◈ DEV MODE — Stripe bypassed. Plan set to PRO.
          Set DEV_BYPASS_STRIPE=false to enable real payments.
        </div>
      )}

      {/* Production: Stripe not configured — plans coming soon */}
      {!isLoading && userInfo?.stripeEnabled === false && !DEV_BYPASS_STRIPE && (
        <div
          style={{
            background: 'rgba(0,229,255,0.06)',
            border: '1px solid rgba(0,229,255,0.2)',
            borderRadius: 12,
            padding: '24px 28px',
            marginBottom: 24,
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: 18,
            color: 'var(--cyan)',
            textAlign: 'center',
          }}
        >
          Plans coming soon. You&apos;re on the free trial — full monitoring and kill switch are available now.
        </div>
      )}

      {/* Plan cards */}
      <div
        style={{
          fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        Available Plans
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key
          const isUpgrading = upgradingPlan === plan.key

          return (
            <div
              key={plan.key}
              style={{
                background: plan.highlight ? 'var(--surface)' : 'var(--panel)',
                border: plan.highlight
                  ? '2px solid rgba(255,26,46,0.4)'
                  : isCurrent
                  ? '1px solid rgba(0,255,106,0.3)'
                  : '1px solid var(--border)',
                borderRadius: '12px',
                padding: '28px 24px',
                position: 'relative',
                transition: 'all 0.2s',
                overflow: 'hidden',
              }}
            >
              {/* Popular badge */}
              {plan.highlight && (
                <div
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'var(--kill)',
                    color: 'white',
                    fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                    fontSize: '8px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '3px',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
                  POPULAR
                </div>
              )}

              {/* Current plan indicator */}
              {isCurrent && (
                <div
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    color: 'var(--safe)',
                    fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                  }}
                >
                  ✓ CURRENT
                </div>
              )}

              {/* Plan name */}
              <div
                style={{
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginBottom: '8px',
                }}
              >
                {plan.name}
              </div>

              {/* Price */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '6px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                    fontSize: '48px',
                    fontWeight: 900,
                    letterSpacing: '-2px',
                    lineHeight: 1,
                    color: 'var(--text)',
                  }}
                >
                  ${plan.price}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                    fontSize: '11px',
                    color: 'var(--muted)',
                  }}
                >
                  /mo
                </span>
              </div>

              {/* Poll interval */}
              <div
                style={{
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '10px',
                  color: 'var(--cyan)',
                  marginBottom: '20px',
                }}
              >
                {plan.pollInterval} polling · {plan.platforms} platforms
              </div>

              {/* Feature list */}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                      fontSize: '11px',
                      color: 'var(--muted)',
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ color: 'var(--safe)', flexShrink: 0 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => !isCurrent && canUpgrade && handleUpgrade(plan.key)}
                disabled={isCurrent || isUpgrading || !canUpgrade}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: isCurrent
                    ? 'rgba(0,255,106,0.06)'
                    : !canUpgrade
                    ? 'var(--panel)'
                    : plan.highlight
                    ? 'linear-gradient(135deg, var(--kill2), var(--kill))'
                    : 'var(--panel)',
                  border: isCurrent
                    ? '1px solid rgba(0,255,106,0.2)'
                    : plan.highlight && canUpgrade
                    ? 'none'
                    : '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: isCurrent ? 'var(--safe)' : !canUpgrade ? 'var(--muted)' : plan.highlight ? 'white' : 'var(--text)',
                  cursor: isCurrent || !canUpgrade ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: plan.highlight && !isCurrent && canUpgrade ? '0 4px 20px rgba(255,26,46,0.3)' : 'none',
                }}
              >
                {isUpgrading
                  ? '⟳ Redirecting...'
                  : isCurrent
                  ? '✓ Current Plan'
                  : !canUpgrade
                  ? 'Coming soon'
                  : `⚡ Upgrade to ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      {/* Fine print */}
      <div
        style={{
          marginTop: '24px',
          fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
          fontSize: '10px',
          color: 'var(--muted2)',
          textAlign: 'center',
        }}
      >
        All plans billed monthly · Cancel anytime · No setup fees · Prices in USD
      </div>

      <style>{`@keyframes skeleton-pulse{0%,100%{opacity:1;}50%{opacity:0.5;}}`}</style>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-share-tech-mono)' }}>Loading...</div>}>
      <BillingContent />
    </Suspense>
  )
}
