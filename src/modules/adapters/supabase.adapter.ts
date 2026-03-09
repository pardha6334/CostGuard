// src/modules/adapters/supabase.adapter.ts
// CostGuard — Supabase spend monitoring and service-key rotation kill switch

import type { PlatformAdapter, SpendData, KillResult, RestoreResult, PlatformSnapshot } from './base.adapter';

interface SupabaseCredentials {
  managementToken: string;
  projectRef: string;
}

export class SupabaseAdapter implements PlatformAdapter {
  private headers: Record<string, string>;

  constructor(private creds: SupabaseCredentials) {
    this.headers = {
      Authorization: `Bearer ${creds.managementToken}`,
      'Content-Type': 'application/json',
    };
  }

  async getSpend(): Promise<SpendData> {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${this.creds.projectRef}/usage`,
      { headers: this.headers }
    );
    if (!res.ok) throw new Error(`Supabase usage API ${res.status}`);
    const data = await res.json();
    return { amount: data.monthly_cost ?? 0, period: 'monthly', currency: 'usd' };
  }

  async getSnapshot(): Promise<PlatformSnapshot> {
    return {
      capturedAt: new Date().toISOString(),
      provider: 'SUPABASE',
      data: {
        projectRef: this.creds.projectRef,
        note: 'Key rotation is irreversible. New key must be copied from Supabase dashboard.',
      },
    };
  }

  async kill(): Promise<KillResult> {
    try {
      const snapshot = await this.getSnapshot();
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${this.creds.projectRef}/api-keys`,
        { method: 'POST', headers: this.headers, body: JSON.stringify({ rotate: true }) }
      );
      return { success: res.ok, method: 'service_key_rotated', reversible: false, snapshot };
    } catch (err) {
      return { success: false, method: 'service_key_rotated', reversible: false, error: String(err) };
    }
  }

  async restore(_snapshot?: PlatformSnapshot): Promise<RestoreResult> {
    return {
      success: false,
      method: 'manual_required',
      error: 'Supabase key was rotated. Go to Supabase dashboard → Settings → API → copy new service role key → update your app environment variables → redeploy.',
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${this.creds.projectRef}`,
        { headers: this.headers }
      );
      return res.ok;
    } catch { return false; }
  }
}
