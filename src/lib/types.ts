// src/lib/types.ts
// CostGuard — Shared frontend TypeScript types

export interface Platform {
  id: string
  provider: string
  displayName: string | null
  environment: string
  hourlyLimit: number
  dailyBudget: number
  monthlyBudget: number
  breakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  isActive: boolean
  autoKill: boolean
  anomalyDetect: boolean
  alertEmail: boolean
  alertSlack: boolean
  alertWebhook: boolean
  lastPolledAt: string | null
  // Injected by hooks from Redis cache
  burnRate?: number
  spendToday?: number
}

export interface Incident {
  id: string
  userId: string
  platformId: string
  triggerType: 'HOURLY_LIMIT' | 'DAILY_LIMIT' | 'SPIKE_DETECTED' | 'MANUAL'
  spendAtTrigger: number
  burnRateAtKill: number
  thresholdLimit: number
  estimatedSaved: number
  status: 'ACTIVE' | 'RESTORING' | 'RESOLVED'
  killedAt: string
  resolvedAt: string | null
  resolvedByUserId: string | null
  durationSecs: number | null
  notes: string | null
  platform?: {
    provider: string
    displayName: string | null
  }
}

export interface ActivityItem {
  id: string
  type: 'kill' | 'restore' | 'warn' | 'safe'
  platform: string
  message: string
  amount?: number
  time: Date
}

export const PROVIDER_ICONS: Record<string, string> = {
  OPENAI: '🤖',
  ANTHROPIC: '🧠',
  AWS: '☁️',
  VERCEL: '▲',
  SUPABASE: '🐘',
}

export const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: '#19C37D',
  ANTHROPIC: '#D97706',
  AWS: '#F59E0B',
  VERCEL: '#FFFFFF',
  SUPABASE: '#3ECF8E',
}

export function getPlatformState(platform: Platform): 'safe' | 'warn' | 'danger' | 'killed' {
  if (platform.breakerState === 'OPEN') return 'killed'
  const pct = platform.burnRate ? platform.burnRate / platform.hourlyLimit : 0
  if (pct >= 0.85) return 'danger'
  if (pct >= 0.6) return 'warn'
  return 'safe'
}
