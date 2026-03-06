'use client'
// src/components/dev/DevToolbar.tsx
// CostGuard — Floating dev toolbar (only renders in development)
import { useState } from 'react'

const btnStyle = (color: string): React.CSSProperties => ({
  background: 'transparent',
  border: `1px solid ${color}33`,
  borderRadius: 5,
  padding: '7px 10px',
  color,
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 10,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
  transition: 'background 0.15s',
  width: '100%',
})

export function DevToolbar() {
  const [log, setLog] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  async function call(path: string, body?: object) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let data: unknown
      try {
        data = text ? JSON.parse(text) : {}
      } catch (_) {
        setLog((prev) => [`${path} → ERROR: Invalid JSON (status ${res.status})`, ...prev.slice(0, 9)])
        return
      }
      setLog((prev) => [`${path} → ${JSON.stringify(data)}`, ...prev.slice(0, 9)])
      return data
    } catch (err) {
      const msg = `${path} → ERROR: ${String(err)}`
      setLog((prev) => [msg, ...prev.slice(0, 9)])
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9000,
        fontFamily: 'monospace',
        fontSize: 11,
      }}
    >
      {open && (
        <div
          style={{
            background: '#0D0D1A',
            border: '1px solid #252545',
            borderRadius: 10,
            padding: 16,
            marginBottom: 8,
            width: 320,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          <div
            style={{
              color: '#FFB800',
              marginBottom: 12,
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            ◈ DEV TOOLBAR — not in production
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => call('/api/dev/seed')} style={btnStyle('#00FF6A')}>
              ▶ Seed Test Data (3 platforms + 2 incidents)
            </button>

            <button
              onClick={() =>
                call('/api/dev/breach', { platformId: 'dev-openai-1', burnRate: 800 })
              }
              style={btnStyle('#FF1A2E')}
            >
              ⚡ Simulate OpenAI Breach ($800/hr)
            </button>

            <button
              onClick={() =>
                call('/api/dev/breach', { platformId: 'dev-aws-1', burnRate: 500 })
              }
              style={btnStyle('#FF1A2E')}
            >
              ⚡ Simulate AWS Breach ($500/hr)
            </button>

            <button
              onClick={async () => {
                const secret = process.env.NEXT_PUBLIC_CRON_SECRET_HINT ?? ''
                await call('/api/cron/poll', undefined)
                window.location.reload()
              }}
              style={btnStyle('#00E5FF')}
            >
              ↺ Run Poll Cycle + Reload
            </button>

            <button
              onClick={() => call('/api/kill', { platformId: 'dev-openai-1' })}
              style={btnStyle('#FF1A2E')}
            >
              ☠ Manual Kill — OpenAI
            </button>

            <button
              onClick={() => call('/api/restore', { platformId: 'dev-openai-1' })}
              style={btnStyle('#00FF6A')}
            >
              ↺ Manual Restore — OpenAI
            </button>

            <button
              onClick={async () => {
                await call('/api/dev/reset')
                window.location.reload()
              }}
              style={btnStyle('#5A5A88')}
            >
              ✕ Reset All Dev Data
            </button>
          </div>

          {log.length > 0 && (
            <div
              style={{
                marginTop: 12,
                borderTop: '1px solid #1C1C38',
                paddingTop: 10,
                color: '#5A5A88',
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {log.map((l, i) => (
                <div key={i} style={{ marginBottom: 3, wordBreak: 'break-all' }}>
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: open ? '#14142A' : '#FF1A2E',
          border: '1px solid #252545',
          borderRadius: 8,
          padding: '8px 14px',
          color: 'white',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'monospace',
          letterSpacing: 1,
          display: 'block',
          marginLeft: 'auto',
          boxShadow: open ? 'none' : '0 0 20px rgba(255,26,46,0.4)',
        }}
      >
        {open ? '✕ CLOSE' : '◈ DEV'}
      </button>
    </div>
  )
}
