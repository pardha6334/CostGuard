'use client'
// src/components/dashboard/ActivityFeed.tsx
// CostGuard — Scrollable live activity feed with framer-motion entrance animations
import { AnimatePresence, motion } from 'framer-motion'
import type { ActivityItem } from '@/lib/types'

interface ActivityFeedProps {
  items: ActivityItem[]
}

const DOT_COLORS: Record<ActivityItem['type'], string> = {
  kill: 'var(--kill)',
  restore: 'var(--safe)',
  warn: 'var(--warn)',
  safe: 'var(--safe)',
}

const AMOUNT_COLORS: Record<ActivityItem['type'], string> = {
  kill: 'var(--kill)',
  restore: 'var(--safe)',
  warn: 'var(--warn)',
  safe: 'var(--muted)',
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export default function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div>
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
        Live Activity
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
              fontSize: '11px',
              color: 'var(--muted2)',
            }}
          >
            No recent activity. Circuit breakers monitoring...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.slice(0, 12).map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-share-tech-mono, Share Tech Mono)',
                  fontSize: '11px',
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: DOT_COLORS[item.type],
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'var(--muted2)', minWidth: '60px' }}>
                  {timeAgo(item.time)}
                </span>
                <span style={{ color: 'var(--muted)', minWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.platform}
                </span>
                <span style={{ color: 'var(--text)', flex: 1 }}>{item.message}</span>
                {item.amount !== undefined && (
                  <span style={{ color: AMOUNT_COLORS[item.type], textAlign: 'right', minWidth: '70px' }}>
                    ${item.amount.toFixed(2)}/hr
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
