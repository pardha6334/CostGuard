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
      const startSec = Math.floor(startOfMonth.getTime() / 1000);
      const endSec = Math.floor(now.getTime() / 1000);
      const authHeader = { Authorization: `Bearer ${this.creds.adminKey}` };
      const projectId = this.creds.projectId;
      // API returns data[] of buckets; each bucket has "results" (plural). amount.value can be string or number.
      // Working request: start_time, end_time, bucket_width=1d, limit=31 (no group_by, no project_ids).
      // Filter by project_id when summing so we only count this platform's spend.
      // Only sum results that match our project_id (or have no project_id, for backwards compatibility).
      type ResultItem = {
        amount?: { value?: number | string } | number;
        project_id?: string | null;
      };
      type Bucket = { result?: ResultItem[]; results?: ResultItem[] };
      let total = 0;
      let page: string | null = null;
      const maxPages = 20;
      let pageCount = 0;
      do {
        if (++pageCount > maxPages) break;
        const query = `start_time=${startSec}&end_time=${endSec}` +
          `&bucket_width=1d` +
          `&limit=31` + (page ? `&page=${encodeURIComponent(page)}` : '');
        const res = await fetch(`https://api.openai.com/v1/organization/costs?${query}`, { headers: authHeader });
        if (!res.ok) throw new Error(`OpenAI spend API ${res.status}`);
        const data = await res.json() as { data?: Bucket[]; next_page?: string; has_more?: boolean };
        const items = (bucket: Bucket) => bucket.results ?? bucket.result ?? [];
        const pageTotal = (data.data ?? []).reduce((sum, bucket) => {
          return sum + items(bucket).reduce((s, r) => {
            if (r.project_id != null && r.project_id !== projectId) return s; // skip other projects
            const amt = r.amount;
            if (amt == null) return s;
            const rawVal = typeof amt === 'number' ? amt : (amt as { value?: number | string }).value;
            const val = typeof rawVal === 'string' ? parseFloat(rawVal) : rawVal;
            return s + (typeof val === 'number' && !Number.isNaN(val) ? val : 0);
          }, 0);
        }, 0);
        total += pageTotal;
        page = data.has_more && data.next_page ? data.next_page : null;
      } while (page);
      return { amount: total, period: 'monthly', currency: 'usd' };
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
