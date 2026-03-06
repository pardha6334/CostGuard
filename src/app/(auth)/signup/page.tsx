'use client'
// src/app/(auth)/signup/page.tsx
// CostGuard — Signup page with email + password + confirm password
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

const schema = z
  .object({
    email: z.string().email('Valid email required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type SignupForm = z.infer<typeof schema>

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '12px 14px',
  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
  fontSize: '13px',
  color: 'var(--text)',
  outline: 'none',
  transition: 'border-color 0.2s',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
  fontSize: '10px',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '6px',
  display: 'block',
}

export default function SignupPage() {
  const [authError, setAuthError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: SignupForm) => {
    setIsLoading(true)
    setAuthError('')
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      })
      if (error) {
        setAuthError(error.message)
        return
      }
      router.push(`/verify?email=${encodeURIComponent(data.email)}`)
    } catch (err) {
      setAuthError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

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
      <div style={{ width: '400px', maxWidth: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
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
              margin: '0 auto 16px',
              boxShadow: '0 0 30px var(--kill-glow)',
            }}
          >
            ⚡
          </div>
          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            CostGuard
          </div>
          <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
            Start your 14-day free trial
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '32px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '1px',
              marginBottom: '24px',
              textTransform: 'uppercase',
            }}
          >
            Create Account
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                {...register('email')}
                style={{ ...inputStyle, borderColor: errors.email ? 'var(--kill)' : 'var(--border)' }}
              />
              {errors.email && (
                <div style={{ color: 'var(--kill)', fontSize: '10px', marginTop: '4px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)' }}>
                  {errors.email.message}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                placeholder="Min 8 characters"
                {...register('password')}
                style={{ ...inputStyle, borderColor: errors.password ? 'var(--kill)' : 'var(--border)' }}
              />
              {errors.password && (
                <div style={{ color: 'var(--kill)', fontSize: '10px', marginTop: '4px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)' }}>
                  {errors.password.message}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                placeholder="••••••••"
                {...register('confirmPassword')}
                style={{ ...inputStyle, borderColor: errors.confirmPassword ? 'var(--kill)' : 'var(--border)' }}
              />
              {errors.confirmPassword && (
                <div style={{ color: 'var(--kill)', fontSize: '10px', marginTop: '4px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)' }}>
                  {errors.confirmPassword.message}
                </div>
              )}
            </div>

            {authError && (
              <div
                style={{
                  background: 'rgba(255,26,46,0.08)',
                  border: '1px solid rgba(255,26,46,0.3)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '11px',
                  color: 'var(--kill)',
                }}
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px',
                background: isLoading ? 'var(--border)' : 'linear-gradient(135deg, var(--kill2), var(--kill))',
                border: 'none',
                borderRadius: '8px',
                fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: 'white',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: isLoading ? 'none' : '0 4px 20px var(--kill-glow)',
              }}
            >
              {isLoading ? '⟳ Creating account...' : '⚡ Create Account'}
            </button>
          </form>

          <div
            style={{
              textAlign: 'center',
              marginTop: '20px',
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '11px',
              color: 'var(--muted)',
            }}
          >
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--kill)', textDecoration: 'none' }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
