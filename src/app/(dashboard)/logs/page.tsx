'use client'
// src/app/(dashboard)/logs/page.tsx
// CostGuard — Logs page (Vercel-style): Redis + DB hybrid, live mode, filters, expandable meta
import { useState, useEffect, useCallback } from 'react'
import { usePlatforms } from '@/lib/hooks/usePlatforms'
import type { LogEntry } from '@/lib/logger'

const LEVEL_STYLES: Record<string, { bg: string; text: string }> = {
  SUCCESS: { bg: 'rgba(34,197,94,0.1)', text: '#22c55e' },
  INFO: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  WARN: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  ERROR: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' },
}
const CATEGORY_STYLES: Record<string, string> = {
  KILL: '#ef4444',
  RESTORE: '#22c55e',
  POLL: '#6b7280',
  SPEND: '#3b82f6',
  ENGINE: '#a855f7',
  RATELIMIT: '#f97316',
  ALERT: '#eab308',
  ERROR: '#ef4444',
  SYSTEM: '#6b7280',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function dateGroup(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const logDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (logDay.getTime() === today.getTime()) return `Today, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
  if (logDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function LogRow({ log, platformName }: { log: LogEntry; platformName?: string }) {
  const [expanded, setExpanded] = useState(false)
  const levelStyle = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.INFO
  const categoryColor = CATEGORY_STYLES[log.category] ?? '#6b7280'
  const hasMeta = log.meta && Object.keys(log.meta).length > 0
  const displayName = platformName ?? (log.platformId ? `Platform ${log.platformId.slice(0, 8)}…` : undefined)

  return (
    <div
      style={{
        background: expanded ? '#111' : 'transparent',
        borderBottom: '1px solid #1a1a1a',
        padding: '10px 16px',
        fontFamily: 'var(--font-share-tech-mono, "JetBrains Mono", monospace)',
        fontSize: '12px',
        cursor: hasMeta ? 'pointer' : 'default',
      }}
      onClick={() => hasMeta && setExpanded((e) => !e)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ color: '#6b7280', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace' }}>
          {formatTime(log.createdAt)}
        </span>
        <span
          style={{
            background: levelStyle.bg,
            color: levelStyle.text,
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {log.level}
        </span>
        <span
          style={{
            color: categoryColor,
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {log.category}
        </span>
      </div>
      <div style={{ marginTop: '6px', color: '#e5e5e5', paddingLeft: 0 }}>
        {log.message}
      </div>
      {displayName && (
        <div style={{ marginTop: '4px', color: '#6b7280', fontSize: '11px' }}>
          {displayName}
        </div>
      )}
      {hasMeta && (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '10px' }}>
          <span>{expanded ? '▼' : '▶'} meta</span>
        </div>
      )}
      {expanded && hasMeta && log.meta && (
        <pre
          style={{
            marginTop: '8px',
            padding: '12px',
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#9ca3af',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(log.meta, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function LogsPage() {
  const { platforms } = usePlatforms()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [newestId, setNewestId] = useState<string | null>(null)
  const [platformId, setPlatformId] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [level, setLevel] = useState<string>('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [source, setSource] = useState<'redis' | 'db'>('redis')

  const fetchLogs = useCallback(
    async (cursor?: string | null, append = false, liveFetch = false) => {
      const params = new URLSearchParams()
      if (platformId) params.set('platformId', platformId)
      if (category) params.set('category', category)
      if (level) params.set('level', level)
      if (search) params.set('search', search)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (cursor) params.set('cursor', cursor)
      if (liveFetch && newestId) params.set('after', newestId)
      params.set('limit', '50')
      params.set('source', source)
      const res = await fetch(`/api/logs?${params}`)
      if (!res.ok) return
      const data = await res.json()
      const list = (data.logs ?? []) as LogEntry[]
      if (liveFetch && list.length > 0) {
        setLogs((prev) => [...list, ...prev])
        const newest = list[0]
        if (newest?.createdAt) setNewestId(newest.createdAt)
      } else if (append) {
        setLogs((prev) => [...prev, ...list])
      } else {
        setLogs(list)
        const first = list[0]
        if (first?.createdAt) setNewestId(first.createdAt)
        else setNewestId(null)
      }
      setHasMore(Boolean(data.hasMore))
      setNextCursor(data.nextCursor ?? null)
    },
    [platformId, category, level, search, from, to, source, newestId]
  )

  useEffect(() => {
    if (from || to) setLive(false)
  }, [from, to])

  useEffect(() => {
    setLoading(true)
    fetchLogs(null, false, false).finally(() => setLoading(false))
    // Intentionally omit fetchLogs to avoid refetch when newestId updates (live mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformId, category, level, search, from, to, source])

  useEffect(() => {
    if (!live) return
    const es = new EventSource('/api/logs/stream')
    es.onmessage = (event) => {
      try {
        const newLogs = JSON.parse(event.data) as LogEntry[]
        if (newLogs.length > 0) {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id))
            const trulyNew = newLogs.filter((l) => !existingIds.has(l.id))
            return [...trulyNew, ...prev]
          })
          setNewestId(newLogs[0].createdAt)
        }
      } catch {
        // ignore parse errors
      }
    }
    es.onerror = () => {
      console.warn('[LOGS] SSE connection lost, reconnecting...')
    }
    return () => es.close()
  }, [live])

  const loadOlder = async () => {
    if (!nextCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      await fetchLogs(nextCursor, true, false)
    } finally {
      setLoadingOlder(false)
    }
  }

  const grouped = logs.reduce<Record<string, LogEntry[]>>((acc, log) => {
    const key = dateGroup(log.createdAt)
    if (!acc[key]) acc[key] = []
    acc[key].push(log)
    return acc
  }, {})

  const platformNames = Object.fromEntries(
    (platforms ?? []).map((p) => [p.id, p.displayName ?? p.provider ?? p.id])
  )

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `costguard-logs-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#e5e5e5' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <h1 style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '24px', fontWeight: 800, letterSpacing: '1px', margin: 0 }}>
            Logs
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              disabled={!!(from || to)}
              title={from || to ? 'Disable date filter to use live mode' : ''}
              onClick={() => setLive((l) => !l)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: live ? 'rgba(34,197,94,0.15)' : 'var(--panel)',
                border: `1px solid ${live ? '#22c55e' : 'var(--border)'}`,
                borderRadius: '6px',
                color: live ? '#22c55e' : 'var(--muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: from || to ? 'not-allowed' : 'pointer',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: live ? '#22c55e' : '#6b7280',
                  animation: live ? 'pulse 1.5s infinite' : 'none',
                  display: 'inline-block',
                }}
              />
              {live ? 'Live ●' : 'Live'}
            </button>
            <button
              type="button"
              onClick={exportLogs}
              style={{
                padding: '8px 14px',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--muted)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Export
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
          <select
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '6px',
              color: '#e5e5e5',
              fontSize: '12px',
              minWidth: '160px',
            }}
          >
            <option value="">All Platforms</option>
            {(platforms ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.displayName ?? p.provider}</option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '6px',
              color: '#e5e5e5',
              fontSize: '12px',
              minWidth: '140px',
            }}
          >
            <option value="">All Categories</option>
            {['POLL', 'SPEND', 'KILL', 'RESTORE', 'ALERT', 'ERROR', 'ENGINE', 'RATELIMIT', 'SYSTEM'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '6px',
              color: '#e5e5e5',
              fontSize: '12px',
              minWidth: '120px',
            }}
          >
            <option value="">All Levels</option>
            {['INFO', 'WARN', 'ERROR', 'SUCCESS'].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setSource('db')
            }}
            style={{
              padding: '8px 12px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '6px',
              color: '#e5e5e5',
              fontSize: '12px',
            }}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setSource('db')
            }}
            style={{
              padding: '8px 12px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '6px',
              color: '#e5e5e5',
              fontSize: '12px',
            }}
          />
          <input
            type="text"
            placeholder="🔍 Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '8px 12px',
              background: '#111',
              border: '1px solid #1a1a1a',
              borderRadius: '6px',
              color: '#e5e5e5',
              fontSize: '12px',
            }}
          />
        </div>

        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '8px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading logs...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No logs yet. Trigger a poll or kill to see entries.</div>
          ) : (
            Object.entries(grouped).map(([groupLabel, groupLogs]) => (
              <div key={groupLabel}>
                <div style={{ padding: '10px 16px', background: '#0a0a0a', borderBottom: '1px solid #1a1a1a', color: '#6b7280', fontSize: '11px', fontWeight: 600 }}>
                  —— {groupLabel} ——
                </div>
                {groupLogs.map((log) => (
                  <LogRow key={log.id} log={log} platformName={log.platformId ? platformNames[log.platformId] : undefined} />
                ))}
              </div>
            ))
          )}
          {hasMore && (
            <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid #1a1a1a' }}>
              <button
                type="button"
                disabled={loadingOlder}
                onClick={loadOlder}
                style={{
                  padding: '8px 20px',
                  background: 'transparent',
                  border: '1px solid #1a1a1a',
                  borderRadius: '6px',
                  color: 'var(--muted)',
                  fontSize: '12px',
                  cursor: loadingOlder ? 'not-allowed' : 'pointer',
                }}
              >
                {loadingOlder ? 'Loading...' : 'Load older logs from database...'}
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}
