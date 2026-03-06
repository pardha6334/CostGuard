'use client'
// src/components/layout/Sidebar.tsx
// CostGuard — Collapsible sidebar: 64px collapsed, 200px on hover
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', icon: '◉', label: 'Dashboard' },
  { href: '/platforms', icon: '⬡', label: 'Platforms' },
  { href: '/incidents', icon: '⚡', label: 'Incidents' },
  { href: '/thresholds', icon: '◈', label: 'Thresholds' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '64px',
        background: 'var(--deep)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        zIndex: 200,
        transition: 'width 0.3s cubic-bezier(0.23,1,0.32,1)',
        overflow: 'hidden',
      }}
      className="group/sidebar hover:w-[200px]"
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', padding: '0 14px', width: '100%' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            background: 'var(--kill)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0,
            boxShadow: '0 0 20px var(--kill-glow)',
          }}
        >
          ⚡
        </div>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 800,
            color: 'var(--text)',
            fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            opacity: 0,
            whiteSpace: 'nowrap',
            marginLeft: '10px',
            transition: 'opacity 0.2s',
          }}
          className="group-hover/sidebar:opacity-100"
        >
          CostGuard
        </span>
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', padding: '0 10px' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                color: isActive ? 'var(--kill)' : 'var(--muted)',
                background: isActive ? 'rgba(255,26,46,0.1)' : 'transparent',
                border: isActive ? '1px solid rgba(255,26,46,0.2)' : '1px solid transparent',
                textDecoration: 'none',
                overflow: 'hidden',
                transition: 'all 0.2s',
                width: '100%',
              }}
            >
              <span style={{ fontSize: '18px', flexShrink: 0, width: '20px', textAlign: 'center' }}>
                {item.icon}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                }}
                className="group-hover/sidebar:opacity-100"
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Connect button */}
      <div style={{ width: '100%', padding: '0 10px' }}>
        <Link
          href="/platforms"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            borderRadius: '8px',
            color: 'var(--muted)',
            background: 'transparent',
            border: '1px solid transparent',
            textDecoration: 'none',
            overflow: 'hidden',
            transition: 'all 0.2s',
            width: '100%',
          }}
        >
          <span style={{ fontSize: '18px', flexShrink: 0, width: '20px', textAlign: 'center' }}>+</span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: 'var(--font-barlow-condensed, Barlow Condensed)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              opacity: 0,
              transition: 'opacity 0.2s',
            }}
            className="group-hover/sidebar:opacity-100"
          >
            Connect
          </span>
        </Link>
      </div>
    </aside>
  )
}
