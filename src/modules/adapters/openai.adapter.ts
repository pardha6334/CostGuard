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
      const tag = `[OPENAI:${this.creds.projectId?.slice(-8) ?? 'unknown'}]`;
      const now = new Date();
      // Use UTC boundaries so day buckets align with OpenAI's UTC-midnight bucket edges.
      // end_time must be start of the NEXT UTC day — the API only returns results for a
      // bucket once its end time has passed. Using "now" mid-day gives empty results for today.
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const startOfNextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const startSec = Math.floor(startOfMonth.getTime() / 1000);
      const endSec = Math.floor(startOfNextDay.getTime() / 1000);
      const authHeader = { Authorization: `Bearer ${this.creds.adminKey}` };
      const projectId = this.creds.projectId;

      console.log(`${tag} 📅 Date range: ${startOfMonth.toISOString().split('T')[0]} → ${startOfNextDay.toISOString().split('T')[0]} (${startSec} → ${endSec}) [end = next UTC midnight]`);
      console.log(`${tag} 🔑 Using key: sk-...${this.creds.adminKey?.slice(-6) ?? 'MISSING'} | projectId: ${projectId ?? 'MISSING'}`);

      // API returns data[] of buckets; each bucket has "results" (plural). amount.value can be string or number.
      // Working request: start_time, end_time, bucket_width=1d, limit=31 (no group_by, no project_ids).
      // Filter by project_id when summing so we only count this platform's spend.
      // Only sum results that match our project_id (or have no project_id, for backwards compatibility).
      type ResultItem = {
        amount?: { value?: number | string } | number;
        project_id?: string | null;
      };
      type Bucket = { result?: ResultItem[]; results?: ResultItem[]; start_time_iso?: string; end_time_iso?: string };
      let total = 0;
      let page: string | null = null;
      const maxPages = 20;
      let pageCount = 0;
      do {
        if (++pageCount > maxPages) {
          console.warn(`${tag} ⚠️  Hit maxPages limit (${maxPages}) — stopping pagination`);
          break;
        }
        const query = `start_time=${startSec}&end_time=${endSec}` +
          `&bucket_width=1d` +
          `&limit=31` + (page ? `&page=${encodeURIComponent(page)}` : '');
        const url = `https://api.openai.com/v1/organization/costs?${query}`;
        console.log(`${tag} 🌐 GET ${url} (page ${pageCount})`);
        const t0 = Date.now();
        const res = await fetch(url, { headers: authHeader });
        const httpMs = Date.now() - t0;
        console.log(`${tag} ↩️  HTTP ${res.status} in ${httpMs}ms`);
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          console.error(`${tag} ❌ API error ${res.status}: ${errBody}`);
          throw new Error(`OpenAI spend API ${res.status}`);
        }
        const data = await res.json() as { data?: Bucket[]; next_page?: string; has_more?: boolean };
        const buckets = data.data ?? [];
        console.log(`${tag} 📦 Response: ${buckets.length} bucket(s) | has_more: ${data.has_more} | next_page: ${data.next_page ?? 'null'}`);

        const items = (bucket: Bucket) => bucket.results ?? bucket.result ?? [];
        let pageTotal = 0;
        let bucketsWithData = 0;
        for (const bucket of buckets) {
          const results = items(bucket);
          if (results.length === 0) continue;
          bucketsWithData++;
          for (const r of results) {
            console.log(`${tag}   📊 Bucket ${bucket.start_time_iso ?? '?'} → result: project_id=${r.project_id ?? 'null'} amount=${JSON.stringify(r.amount)}`);
            if (r.project_id != null && r.project_id !== projectId) {
              console.log(`${tag}   ⏭️  Skipping — project_id mismatch (${r.project_id} ≠ ${projectId})`);
              continue;
            }
            const amt = r.amount;
            if (amt == null) continue;
            const rawVal = typeof amt === 'number' ? amt : (amt as { value?: number | string }).value;
            const val = typeof rawVal === 'string' ? parseFloat(rawVal) : rawVal;
            const contribution = (typeof val === 'number' && !Number.isNaN(val)) ? val : 0;
            if (contribution > 0) {
              console.log(`${tag}   ✅ Counting $${contribution.toFixed(8)} (raw: "${rawVal}")`);
            }
            pageTotal += contribution;
          }
        }
        console.log(`${tag} 💵 Page ${pageCount} total: $${pageTotal.toFixed(8)} (${bucketsWithData}/${buckets.length} buckets had data)`);
        total += pageTotal;
        page = data.has_more && data.next_page ? data.next_page : null;
      } while (page);

      console.log(`${tag} 🏁 Final spend total: $${total.toFixed(8)} (${pageCount} page(s) fetched)`);
      return { amount: total, period: 'monthly', currency: 'usd' };
    });
  }

  async kill(): Promise<KillResult> {
    const tag = `[OPENAI:KILL:${this.creds.projectId?.slice(-8) ?? 'unknown'}]`;
    try {
      const rateLimits = await this.getAllRateLimits();
      console.log(`${tag} 🔴 Killing ${rateLimits.length} rate limit(s) for project ${this.creds.projectId}`);
      if (rateLimits.length === 0) {
        console.warn(`${tag} ⚠️  No rate limits found — kill has no effect`);
        return { success: false, method: 'rate_limit_minimized', reversible: true, error: 'No rate limits found for this project' };
      }
      const results = await Promise.all(
        rateLimits.map(async (rl) => {
          const res = await fetch(
            `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits/${rl.id}`,
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
          console.log(`${tag}   model=${rl.model ?? rl.id} → HTTP ${res.status} ${res.ok ? '✅' : '❌'}`);
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error(`${tag}   ❌ Failed to kill ${rl.id}: ${body}`);
          }
          return res.ok;
        })
      );
      const allOk = results.every(Boolean);
      const anyOk = results.some(Boolean);
      console.log(`${tag} ${allOk ? '✅' : anyOk ? '⚠️ Partial' : '❌'} Kill complete — ${results.filter(Boolean).length}/${results.length} rate limits throttled`);
      return {
        success: anyOk,
        method: 'rate_limit_minimized',
        reversible: true,
        error: allOk ? undefined : `${results.filter(v => !v).length} rate limit(s) failed to update`,
      };
    } catch (err) {
      console.error(`${tag} ❌ Kill threw:`, String(err));
      return { success: false, method: 'rate_limit_minimized', reversible: true, error: String(err) };
    }
  }

  async restore(): Promise<RestoreResult> {
    const tag = `[OPENAI:RESTORE:${this.creds.projectId?.slice(-8) ?? 'unknown'}]`;
    try {
      const rateLimits = await this.getAllRateLimits();
      console.log(`${tag} 🟢 Restoring ${rateLimits.length} rate limit(s) for project ${this.creds.projectId}`);
      const results = await Promise.all(
        rateLimits.map(async (rl) => {
          const res = await fetch(
            `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits/${rl.id}`,
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
          console.log(`${tag}   model=${rl.model ?? rl.id} → HTTP ${res.status} ${res.ok ? '✅' : '❌'}`);
          return res.ok;
        })
      );
      const allOk = results.every(Boolean);
      console.log(`${tag} ${allOk ? '✅' : '⚠️'} Restore complete — ${results.filter(Boolean).length}/${results.length} rate limits restored`);
      return {
        success: allOk,
        method: 'rate_limit_restored',
        error: allOk ? undefined : `${results.filter(v => !v).length} rate limit(s) failed to restore`,
      };
    } catch (err) {
      console.error(`${tag} ❌ Restore threw:`, String(err));
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

  // Returns ALL rate limit entries for the project (one per model).
  // Kill/restore must target every entry — throttling only one model leaves others unrestricted.
  private async getAllRateLimits(): Promise<{ id: string; model?: string }[]> {
    const res = await fetch(
      `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits`,
      { headers: { Authorization: `Bearer ${this.creds.adminKey}` } }
    );
    if (!res.ok) throw new Error(`Rate limits fetch failed: HTTP ${res.status}`);
    const data = await res.json();
    const items: { id: string; model?: string }[] = (data.data ?? []).map(
      (rl: { id: string; model?: string }) => ({ id: rl.id, model: rl.model })
    );
    return items;
  }
}
