'use client'
// src/components/platforms/ConnectWizard.tsx
// CostGuard — 3-step modal: Select provider → Credentials → Thresholds
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const PROVIDERS = [
  { id: 'OPENAI', label: 'OpenAI', icon: '🤖', color: '#19C37D' },
  { id: 'ANTHROPIC', label: 'Anthropic', icon: '🧠', color: '#D97706' },
  { id: 'AWS', label: 'AWS', icon: '☁️', color: '#F59E0B' },
  { id: 'VERCEL', label: 'Vercel', icon: '▲', color: '#FFFFFF' },
  { id: 'SUPABASE', label: 'Supabase', icon: '🐘', color: '#3ECF8E' },
]

const CREDENTIAL_FIELDS: Record<string, { name: string; label: string; placeholder: string; type?: string }[]> = {
  OPENAI: [
    { name: 'adminKey', label: 'Admin API Key', placeholder: 'sk-admin-...' },
    { name: 'projectId', label: 'Project ID', placeholder: 'proj_...' },
  ],
  ANTHROPIC: [
    { name: 'adminKey', label: 'API Key', placeholder: 'sk-ant-...' },
    { name: 'apiKeyId', label: 'API Key ID', placeholder: 'key_...' },
  ],
  AWS: [
    { name: 'accessKeyId', label: 'Access Key ID', placeholder: 'AKIA...' },
    { name: 'secretAccessKey', label: 'Secret Access Key', placeholder: '...', type: 'password' },
    { name: 'region', label: 'Region', placeholder: 'us-east-1' },
    { name: 'roleName', label: 'IAM Role Name', placeholder: 'CostGuardKiller' },
    { name: 'accountId', label: 'Account ID', placeholder: '123456789' },
  ],
  VERCEL: [
    { name: 'accessToken', label: 'Access Token', placeholder: 'vt_...' },
    { name: 'projectId', label: 'Project ID', placeholder: 'prj_...' },
    { name: 'teamId', label: 'Team ID (optional)', placeholder: 'team_...' },
  ],
  SUPABASE: [
    { name: 'managementToken', label: 'Management API Token', placeholder: 'sbp_...' },
    { name: 'projectRef', label: 'Project Reference', placeholder: 'abcdefghijklmno' },
  ],
}

const thresholdsSchema = z.object({
  hourlyLimit: z.number().min(1),
  dailyBudget: z.number().min(1),
  displayName: z.string().optional(),
})

type ThresholdsForm = z.infer<typeof thresholdsSchema>

interface ConnectWizardProps {
  onClose: () => void
  onSuccess: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '10px 14px',
  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
  fontSize: '12px',
  color: 'var(--text)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
  fontSize: '10px',
  color: 'var(--muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginBottom: '6px',
  display: 'block',
}

export default function ConnectWizard({ onClose, onSuccess }: ConnectWizardProps) {
  const [step, setStep] = useState(1)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [credErrors, setCredErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<ThresholdsForm>({
    resolver: zodResolver(thresholdsSchema),
    defaultValues: { hourlyLimit: 50, dailyBudget: 200 },
  })

  const handleCredentialChange = (name: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [name]: value }))
    setCredErrors((prev) => { const n = { ...prev }; delete n[name]; return n })
  }

  const validateCredentials = () => {
    const fields = CREDENTIAL_FIELDS[selectedProvider] ?? []
    const errs: Record<string, string> = {}
    for (const f of fields) {
      if (!f.name.includes('optional') && !credentials[f.name]?.trim()) {
        if (!f.label.includes('optional')) {
          errs[f.name] = 'Required'
        }
      }
    }
    setCredErrors(errs)
    return Object.keys(errs).length === 0
  }

  const onSubmit = async (data: ThresholdsForm) => {
    setIsSubmitting(true)
    setApiError('')
    try {
      const res = await fetch('/api/platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          credentials,
          hourlyLimit: data.hourlyLimit,
          dailyBudget: data.dailyBudget,
          displayName: data.displayName || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setApiError(typeof json.error === 'string' ? json.error : 'Failed to connect platform')
        return
      }
      onSuccess()
    } catch (err) {
      setApiError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3,3,10,0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          width: '500px',
          maxWidth: '95vw',
          padding: '32px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
          }}
        >
          ✕
        </button>

        <div
          style={{
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '20px',
            fontWeight: 800,
            letterSpacing: '1px',
            marginBottom: '6px',
            textTransform: 'uppercase',
          }}
        >
          Connect Platform
        </div>
        <div
          style={{
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '11px',
            color: 'var(--muted)',
            marginBottom: '24px',
          }}
        >
          Step {step} of 3
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px' }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '10px',
                  border: s < step ? '1.5px solid var(--safe)' : s === step ? '1.5px solid var(--kill)' : '1.5px solid var(--border2)',
                  background: s < step ? 'rgba(0,255,106,0.1)' : s === step ? 'rgba(255,26,46,0.1)' : 'transparent',
                  color: s < step ? 'var(--safe)' : s === step ? 'var(--kill)' : 'var(--muted)',
                }}
              >
                {s < step ? '✓' : s}
              </div>
              {s < 3 && <div style={{ flex: 1, height: '1px', background: 'var(--border)', width: '40px' }} />}
            </div>
          ))}
        </div>

        {/* STEP 1: Select Provider */}
        {step === 1 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id)}
                  style={{
                    padding: '16px 10px',
                    borderRadius: '8px',
                    border: selectedProvider === p.id ? '2px solid var(--kill)' : '1px solid var(--border)',
                    background: selectedProvider === p.id ? 'rgba(255,26,46,0.08)' : 'var(--panel)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '6px' }}>{p.icon}</div>
                  <div
                    style={{
                      fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--text)',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {p.label}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 20px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => selectedProvider && setStep(2)}
                disabled={!selectedProvider}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: selectedProvider ? 'linear-gradient(135deg, var(--kill2), var(--kill))' : 'var(--border)',
                  border: 'none',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'white',
                  cursor: selectedProvider ? 'pointer' : 'not-allowed',
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Credentials */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              {(CREDENTIAL_FIELDS[selectedProvider] ?? []).map((field) => (
                <div key={field.name} style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>{field.label}</label>
                  <input
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    value={credentials[field.name] ?? ''}
                    onChange={(e) => handleCredentialChange(field.name, e.target.value)}
                    style={{
                      ...inputStyle,
                      borderColor: credErrors[field.name] ? 'var(--kill)' : 'var(--border)',
                    }}
                  />
                  {credErrors[field.name] && (
                    <div style={{ color: 'var(--kill)', fontSize: '10px', marginTop: '4px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)' }}>
                      {credErrors[field.name]}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: '12px 20px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => validateCredentials() && setStep(3)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'linear-gradient(135deg, var(--kill2), var(--kill))',
                  border: 'none',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Thresholds */}
        {step === 3 && (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Display Name (optional)</label>
                <input {...register('displayName')} placeholder="My OpenAI Project" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Hourly Limit ($)</label>
                  <input
                    type="number"
                    step="1"
                    {...register('hourlyLimit', { valueAsNumber: true })}
                    style={{ ...inputStyle, borderColor: errors.hourlyLimit ? 'var(--kill)' : 'var(--border)' }}
                  />
                  {errors.hourlyLimit && (
                    <div style={{ color: 'var(--kill)', fontSize: '10px', marginTop: '4px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)' }}>
                      {errors.hourlyLimit.message}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Daily Budget ($)</label>
                  <input
                    type="number"
                    step="1"
                    {...register('dailyBudget', { valueAsNumber: true })}
                    style={{ ...inputStyle, borderColor: errors.dailyBudget ? 'var(--kill)' : 'var(--border)' }}
                  />
                  {errors.dailyBudget && (
                    <div style={{ color: 'var(--kill)', fontSize: '10px', marginTop: '4px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)' }}>
                      {errors.dailyBudget.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {apiError && (
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
                {apiError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{
                  padding: '12px 20px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isSubmitting ? 'var(--border)' : 'linear-gradient(135deg, var(--kill2), var(--kill))',
                  border: 'none',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'white',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? '⟳ Connecting...' : '⚡ Connect Platform'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
