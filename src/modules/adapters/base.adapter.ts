// src/modules/adapters/base.adapter.ts
// CostGuard — PlatformAdapter interface — every adapter must implement this

export interface SpendData {
  amount: number
  burnRate?: number
  period: 'hourly' | 'daily' | 'monthly'
  currency: string
  rawResponse?: unknown
}

export interface PlatformSnapshot {
  capturedAt: string
  provider: string
  data: Record<string, unknown>
}

export interface KillResult {
  success: boolean
  method: string
  reversible: boolean
  snapshot?: PlatformSnapshot
  error?: string
}

export interface RestoreResult {
  success: boolean
  method: string
  error?: string
}

export interface PlatformAdapter {
  getSpend(): Promise<SpendData>
  getSnapshot(): Promise<PlatformSnapshot>
  kill(): Promise<KillResult>
  restore(snapshot?: PlatformSnapshot): Promise<RestoreResult>
  testConnection(): Promise<boolean>
}
