// src/modules/adapters/openai.adapter.ts
// CostGuard — OpenAI spend monitoring and rate-limit kill switch

import { withRetry } from '@/lib/backoff';
import type { PlatformAdapter, SpendData, KillResult, RestoreResult } from './base.adapter';

interface OpenAICredentials {
  adminKey: string;     // sk-admin-...
  projectId: string;    // proj_...
  rateLimitId?: string; // cached after first fetch
}

export class OpenAIAdapter implements PlatformAdapter {
  constructor(private creds: OpenAICredentials) {}

  async getSpend(): Promise<SpendData> {
    return withRetry(async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const res = await fetch(
        `https://api.openai.com/v1/organization/costs?` +
        `start_time=${Math.floor(startOfMonth.getTime() / 1000)}` +
        `&end_time=${Math.floor(now.getTime() / 1000)}` +
        `&project_id=${this.creds.projectId}`,
        { headers: { Authorization: `Bearer ${this.creds.adminKey}` } }
      );
      if (!res.ok) throw new Error(`OpenAI spend API ${res.status}`);
      const data = await res.json();
      const amount = data.data?.reduce((s: number, d: { results?: { amount?: { value?: number } }[] }) =>
        s + (d.results?.[0]?.amount?.value ?? 0), 0) ?? 0;
      return { amount, period: 'monthly', currency: 'usd' };
    });
  }

  async kill(): Promise<KillResult> {
    try {
      const rateLimitId = await this.getRateLimitId();
      const res = await fetch(
        `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits/${rateLimitId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.creds.adminKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            max_requests_per_1_minute: 1,
            max_tokens_per_1_minute: 100,
          }),
        }
      );
      return {
        success: res.ok,
        method: 'rate_limit_minimized',
        reversible: true,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return { success: false, method: 'rate_limit_minimized', reversible: true, error: String(err) };
    }
  }

  async restore(): Promise<RestoreResult> {
    try {
      const rateLimitId = await this.getRateLimitId();
      const res = await fetch(
        `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits/${rateLimitId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.creds.adminKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            max_requests_per_1_minute: 3500,
            max_tokens_per_1_minute: 90000,
          }),
        }
      );
      return { success: res.ok, method: 'rate_limit_restored' };
    } catch (err) {
      return { success: false, method: 'rate_limit_restored', error: String(err) };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.openai.com/v1/organization/projects/${this.creds.projectId}`,
        { headers: { Authorization: `Bearer ${this.creds.adminKey}` } }
      );
      return res.ok;
    } catch { return false; }
  }

  private async getRateLimitId(): Promise<string> {
    if (this.creds.rateLimitId) return this.creds.rateLimitId;
    const res = await fetch(
      `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits`,
      { headers: { Authorization: `Bearer ${this.creds.adminKey}` } }
    );
    const data = await res.json();
    const id = data.data?.[0]?.id;
    if (!id) throw new Error('No rate limit ID found');
    this.creds.rateLimitId = id;
    return id;
  }
}
