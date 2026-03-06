'use client'
// src/components/dashboard/SpendChart.tsx
// CostGuard — Recharts line chart of burn rate with threshold reference line
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface DataPoint {
  time: string
  burnRate: number
}

interface SpendChartProps {
  data?: DataPoint[]
  threshold?: number
}

const EMPTY_DATA: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
  time: `${i}m`,
  burnRate: 0,
}))

type TabKey = '1h' | '6h' | '24h' | '7d'

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '8px 12px',
        fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
        fontSize: '11px',
        color: 'var(--text)',
      }}
    >
      <div style={{ color: 'var(--muted)', marginBottom: '2px' }}>{label}</div>
      <div style={{ color: val > 0 ? 'var(--kill)' : 'var(--safe)' }}>
        ${val.toFixed(2)}/hr
      </div>
    </div>
  )
}

export default function SpendChart({ data, threshold }: SpendChartProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('1h')
  const chartData = data ?? EMPTY_DATA
  const maxVal = Math.max(...chartData.map((d) => d.burnRate), threshold ?? 0, 10)

  const lineColor =
    threshold && Math.max(...chartData.map((d) => d.burnRate)) > threshold * 0.85
      ? 'var(--kill)'
      : Math.max(...chartData.map((d) => d.burnRate)) > (threshold ?? 0) * 0.6
      ? 'var(--warn)'
      : 'var(--safe)'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div
          style={{
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          Spend Rate (Live)
          <div style={{ flex: 1, height: '1px', background: 'var(--border)', width: '60px' }} />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['1h', '6h', '24h', '7d'] as TabKey[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '5px 12px',
                borderRadius: '4px',
                fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                fontSize: '10px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: activeTab === tab ? '1px solid rgba(255,26,46,0.25)' : '1px solid transparent',
                background: activeTab === tab ? 'rgba(255,26,46,0.1)' : 'transparent',
                color: activeTab === tab ? 'var(--kill)' : 'var(--muted)',
              }}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: '140px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontFamily: 'Share Tech Mono', fontSize: 9, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, maxVal * 1.1]}
              tick={{ fontFamily: 'Share Tech Mono', fontSize: 9, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            {threshold && (
              <ReferenceLine
                y={threshold}
                stroke="var(--kill)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: 'LIMIT', fill: 'var(--kill)', fontSize: 9 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="burnRate"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor }}
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
