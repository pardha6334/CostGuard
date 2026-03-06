'use client'
// src/app/(dashboard)/incidents/page.tsx
// CostGuard — Incident history page: stats, filters, TanStack table
import { useState, useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useIncidents } from '@/lib/hooks/useIncidents'
import type { Incident } from '@/lib/types'

const columnHelper = createColumnHelper<Incident>()

function StatusBadge({ status }: { status: Incident['status'] }) {
  const styles = {
    ACTIVE: { color: 'var(--kill)', bg: 'rgba(255,26,46,0.1)', border: '1px solid rgba(255,26,46,0.2)', animation: 'blink-danger 0.8s infinite' },
    RESTORING: { color: 'var(--warn)', bg: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.2)', animation: 'none' },
    RESOLVED: { color: 'var(--safe)', bg: 'rgba(0,255,106,0.1)', border: '1px solid rgba(0,255,106,0.2)', animation: 'none' },
  }
  const s = styles[status]
  return (
    <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: '3px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', ...s, animation: s.animation }}>
      {status}
      <style>{`@keyframes blink-danger{0%,100%{opacity:1;}50%{opacity:0.5;}}`}</style>
    </span>
  )
}

function formatDuration(secs: number | null): string {
  if (!secs) return '—'
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'RESTORING', label: 'Restoring' },
  { id: 'RESOLVED', label: 'Resolved' },
]

export default function IncidentsPage() {
  const [activeFilter, setActiveFilter] = useState('all')
  const { incidents, totalSaved, isLoading } = useIncidents()

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return incidents
    return incidents.filter((i) => i.status === activeFilter)
  }, [incidents, activeFilter])

  const thisMonth = useMemo(() => {
    const now = new Date()
    return incidents.filter((i) => {
      const d = new Date(i.killedAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [incidents])

  const columns = [
    columnHelper.accessor('killedAt', {
      header: 'Time',
      cell: (info) => (
        <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)' }}>
          {new Date(info.getValue()).toLocaleString()}
        </span>
      ),
    }),
    columnHelper.accessor((row) => row.platform?.displayName ?? row.platform?.provider ?? '—', {
      id: 'platform',
      header: 'Platform',
      cell: (info) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '10px', fontWeight: 600, padding: '3px 8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('triggerType', {
      header: 'Trigger',
      cell: (info) => (
        <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '10px', color: 'var(--muted)' }}>
          {info.getValue().replace(/_/g, ' ')}
        </span>
      ),
    }),
    columnHelper.accessor('burnRateAtKill', {
      header: 'Burn Rate',
      cell: (info) => (
        <span style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '14px', fontWeight: 700, color: 'var(--kill)' }}>
          ${info.getValue().toFixed(2)}/hr
        </span>
      ),
    }),
    columnHelper.accessor('durationSecs', {
      header: 'Duration',
      cell: (info) => (
        <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)' }}>
          {formatDuration(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('estimatedSaved', {
      header: 'Saved (est.)',
      cell: (info) => (
        <span style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '14px', fontWeight: 700, color: 'var(--safe)' }}>
          ${info.getValue().toFixed(0)}
        </span>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    columnHelper.display({
      id: 'view',
      header: '',
      cell: () => (
        <button
          style={{
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
            fontSize: '9px',
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          View
        </button>
      ),
    }),
  ]

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const exportCSV = () => {
    const headers = ['Time', 'Platform', 'Trigger', 'Burn Rate', 'Duration', 'Saved', 'Status']
    const rows = incidents.map((i) => [
      new Date(i.killedAt).toISOString(),
      i.platform?.displayName ?? i.platform?.provider ?? '',
      i.triggerType,
      i.burnRateAtKill.toFixed(2),
      formatDuration(i.durationSecs),
      i.estimatedSaved.toFixed(0),
      i.status,
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `costguard-incidents-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>
            Incident History
          </div>
          <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Full log of all circuit breaker events
          </div>
        </div>
        <button
          onClick={exportCSV}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '1px',
            cursor: 'pointer',
          }}
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
        {[
          { label: 'Total Saved', value: `$${totalSaved.toFixed(0)}`, sub: 'lifetime protection', color: 'var(--safe)' },
          { label: 'Incidents', value: String(incidents.length), sub: 'total events caught', color: 'var(--text)' },
          { label: 'Avg Response', value: '<60s', sub: 'detection to kill', color: 'var(--cyan)' },
          { label: 'This Month', value: String(thisMonth), sub: 'incidents in ' + new Date().toLocaleString('en', { month: 'long' }), color: 'var(--warn)' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)', fontSize: '30px', fontWeight: 900, letterSpacing: '-1px', color: stat.color }}>
              {stat.value}
            </div>
            <div style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
              {stat.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '10px', color: 'var(--muted)' }}>FILTER:</span>
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            style={{
              padding: '6px 14px',
              borderRadius: '4px',
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '10px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: activeFilter === f.id ? '1px solid rgba(255,26,46,0.3)' : '1px solid var(--border)',
              background: activeFilter === f.id ? 'rgba(255,26,46,0.1)' : 'transparent',
              color: activeFilter === f.id ? 'var(--kill)' : 'var(--muted)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      padding: '12px 16px',
                      fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                      fontSize: '9px',
                      color: 'var(--muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px',
                      background: 'var(--panel)',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'left',
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '12px', color: 'var(--muted)' }}>
                  Loading incidents...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)', fontSize: '12px', color: 'var(--muted)' }}>
                  No incidents recorded. Circuit breakers armed and monitoring.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        borderBottom: '1px solid rgba(28,28,56,0.5)',
                        verticalAlign: 'middle',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
