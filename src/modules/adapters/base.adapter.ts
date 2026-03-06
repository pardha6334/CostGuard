// src/modules/adapters/base.adapter.ts
// CostGuard — PlatformAdapter interface shared by all platform adapters

export interface SpendData {
  amount: number;       // total spend so far this period in $
  burnRate?: number;    // if API provides it directly
  period: 'hourly' | 'daily' | 'monthly';
  currency: string;
  rawResponse?: unknown;
}

export interface KillResult {
  success: boolean;
  method: string;       // what we did e.g. "rate_limit_set"
  reversible: boolean;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  method: string;
  error?: string;
}

export interface PlatformAdapter {
  getSpend(): Promise<SpendData>;
  kill(): Promise<KillResult>;
  restore(): Promise<RestoreResult>;
  testConnection(): Promise<boolean>;
}
