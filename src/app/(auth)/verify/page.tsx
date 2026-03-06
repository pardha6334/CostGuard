'use client'
// src/app/(auth)/verify/page.tsx
// CostGuard — "Check your inbox" email verification page
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function VerifyContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? 'your inbox'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--void)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{ width: '400px', maxWidth: '100%', textAlign: 'center' }}>
        {/* Logo */}
        <div
          style={{
            width: '48px',
            height: '48px',
            background: 'var(--kill)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            margin: '0 auto 24px',
            boxShadow: '0 0 30px var(--kill-glow)',
          }}
        >
          ⚡
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '40px 32px',
          }}
        >
          {/* Email icon */}
          <div
            style={{
              fontSize: '56px',
              marginBottom: '20px',
              animation: 'bounce-in 0.5s cubic-bezier(0.23,1,0.32,1)',
            }}
          >
            ✉
          </div>

          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              marginBottom: '12px',
            }}
          >
            Check Your Inbox
          </div>

          <div
            style={{
              fontFamily: 'Barlow, sans-serif',
              fontSize: '14px',
              color: 'var(--muted)',
              lineHeight: 1.6,
              marginBottom: '8px',
            }}
          >
            We sent a verification link to
          </div>
          <div
            style={{
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '13px',
              color: 'var(--cyan)',
              marginBottom: '24px',
              padding: '8px 16px',
              background: 'rgba(0,229,255,0.06)',
              border: '1px solid rgba(0,229,255,0.15)',
              borderRadius: '6px',
              display: 'inline-block',
            }}
          >
            {email}
          </div>

          <div
            style={{
              fontFamily: 'Barlow, sans-serif',
              fontSize: '13px',
              color: 'var(--muted)',
              lineHeight: 1.6,
              marginBottom: '32px',
            }}
          >
            Click the link in the email to activate your account and start protecting your AI costs.
          </div>

          <Link
            href="/login"
            style={{
              display: 'block',
              padding: '12px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              textDecoration: 'none',
              transition: 'all 0.2s',
            }}
          >
            ← Back to Login
          </Link>
        </div>
      </div>
      <style>{`
        @keyframes bounce-in { from{transform:scale(0.5);opacity:0;} to{transform:scale(1);opacity:1;} }
      `}</style>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div />}>
      <VerifyContent />
    </Suspense>
  )
}
