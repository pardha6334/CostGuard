// src/modules/adapters/openai.adapter.ts
// CostGuard — OpenAI spend monitoring and rate-limit kill switch

import { withRetry } from '@/lib/backoff';
import { redis } from '@/lib/redis';
import type { PlatformAdapter, SpendData, KillResult, RestoreResult } from './base.adapter';

interface OpenAICredentials {
  adminKey: string;     // sk-admin-...
  projectId: string;    // proj_...
}

// Full rate limit entry as returned by OpenAI API
interface RateLimit {
  id: string;
  model?: string;
  max_requests_per_1_minute: number;
  max_tokens_per_1_minute: number;
  max_images_per_1_minute?: number;
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

      // Snapshot original values to Redis BEFORE overwriting — restore will read these back
      const snapshotKey = `ratelimits:${this.creds.projectId}:originals`;
      await redis.set(snapshotKey, rateLimits, { ex: 86400 }); // 24h TTL
      console.log(`${tag} 💾 Saved ${rateLimits.length} original rate limit values to Redis (key: ${snapshotKey})`);

      // 'skipped' = model not enabled for this org (can't be used anyway, safe to ignore)
      // 'failed'  = real error (e.g. server_error 500) that should be reported
      const results = await Promise.all(
        rateLimits.map(async (rl): Promise<'ok' | 'skipped' | 'failed'> => {
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
          if (res.ok) {
            console.log(`${tag}   model=${rl.model ?? rl.id} (was ${rl.max_requests_per_1_minute} req/min) → HTTP 200 ✅`);
            return 'ok';
          }
          const errBody = await res.text().catch(() => '{}');
          let errCode = '';
          try { errCode = JSON.parse(errBody)?.error?.code ?? ''; } catch { /* */ }
          if (errCode === 'rate_limit_does_not_exist_for_org_and_model' || errCode === 'rate_limit_not_updatable') {
            return 'skipped';
          }
          console.error(`${tag}   ❌ model=${rl.model ?? rl.id} HTTP ${res.status}: ${errBody}`);
          return 'failed';
        })
      );
      const ok = results.filter(r => r === 'ok').length;
      const skipped = results.filter(r => r === 'skipped').length;
      const failed = results.filter(r => r === 'failed').length;
      console.log(`${tag} ${failed === 0 ? '✅' : '⚠️'} Kill complete — ${ok} throttled, ${skipped} skipped, ${failed} real errors`);
      return {
        success: ok > 0,
        method: 'rate_limit_minimized',
        reversible: true,
        error: failed > 0 ? `${failed} model(s) failed with server errors (transient — retry safe)` : undefined,
      };
    } catch (err) {
      console.error(`${tag} ❌ Kill threw:`, String(err));
      return { success: false, method: 'rate_limit_minimized', reversible: true, error: String(err) };
    }
  }

  async restore(): Promise<RestoreResult> {
    const tag = `[OPENAI:RESTORE:${this.creds.projectId?.slice(-8) ?? 'unknown'}]`;
    try {
      // Load the original values that were snapshotted to Redis during kill
      const snapshotKey = `ratelimits:${this.creds.projectId}:originals`;
      const originals = await redis.get<RateLimit[]>(snapshotKey);

      let rateLimits: RateLimit[];
      if (originals && originals.length > 0) {
        rateLimits = originals;
        console.log(`${tag} 🟢 Restoring ${rateLimits.length} rate limit(s) to original values (from Redis snapshot)`);
      } else {
        // Fallback: no snapshot found — re-fetch current limits and restore to whatever OpenAI has
        // This should not happen in normal flow (snapshot is set during kill with 24h TTL)
        console.warn(`${tag} ⚠️  No Redis snapshot found — fetching current rate limits as fallback`);
        rateLimits = await this.getAllRateLimits();
        console.log(`${tag} 🟢 Restoring ${rateLimits.length} rate limit(s) using current live values (no snapshot)`);
      }

      const results = await Promise.all(
        rateLimits.map(async (rl): Promise<'ok' | 'skipped' | 'failed'> => {
          const res = await fetch(
            `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits/${rl.id}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.creds.adminKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                max_requests_per_1_minute: rl.max_requests_per_1_minute,
                max_tokens_per_1_minute: rl.max_tokens_per_1_minute,
                ...(rl.max_images_per_1_minute != null
                  ? { max_images_per_1_minute: rl.max_images_per_1_minute }
                  : {}),
              }),
            }
          );
          if (res.ok) {
            console.log(`${tag}   model=${rl.model ?? rl.id} → restored to ${rl.max_requests_per_1_minute} req/min ✅`);
            return 'ok';
          }
          const errBody = await res.text().catch(() => '{}');
          let errCode = '';
          try { errCode = JSON.parse(errBody)?.error?.code ?? ''; } catch { /* */ }
          if (errCode === 'rate_limit_does_not_exist_for_org_and_model' || errCode === 'rate_limit_not_updatable') {
            return 'skipped';
          }
          console.error(`${tag}   ❌ model=${rl.model ?? rl.id} HTTP ${res.status}: ${errBody}`);
          return 'failed';
        })
      );

      const ok = results.filter(r => r === 'ok').length;
      const skipped = results.filter(r => r === 'skipped').length;
      const failed = results.filter(r => r === 'failed').length;
      console.log(`${tag} ${failed === 0 ? '✅' : '⚠️'} Restore complete — ${ok} restored to originals, ${skipped} skipped, ${failed} errors`);

      // Always delete snapshot — whether restore fully succeeded or partially failed.
      // Keeping it would cause the next kill to snapshot 1 req/min values as "originals".
      await redis.del(snapshotKey);
      console.log(`${tag} 🗑️  Redis snapshot deleted`);

      return {
        success: ok > 0,
        method: 'rate_limit_restored',
        error: failed > 0 ? `${failed} model(s) failed to restore` : undefined,
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

  // Returns killable rate limit entries with their CURRENT values from OpenAI.
  // Paginates through ALL pages (API returns has_more=true when results exceed page size).
  // Fine-tuned (ft:*) and shared-tier (*-shared) models are excluded — API blocks updating them.
  private async getAllRateLimits(): Promise<RateLimit[]> {
    const tag = `[OPENAI:RL:${this.creds.projectId?.slice(-8) ?? 'unknown'}]`;
    const authHeader = { Authorization: `Bearer ${this.creds.adminKey}` };
    const baseUrl = `https://api.openai.com/v1/organization/projects/${this.creds.projectId}/rate_limits`;
    const all: RateLimit[] = [];
    let after: string | null = null;
    let page = 0;

    do {
      page++;
      const url = after ? `${baseUrl}?after=${encodeURIComponent(after)}&limit=100` : `${baseUrl}?limit=100`;
      const res = await fetch(url, { headers: authHeader });
      if (!res.ok) throw new Error(`Rate limits fetch failed: HTTP ${res.status}`);
      const data = await res.json() as { data?: RateLimit[]; has_more?: boolean; last_id?: string };
      const batch: RateLimit[] = (data.data ?? []).map((rl: RateLimit) => ({
        id: rl.id,
        model: rl.model,
        max_requests_per_1_minute: rl.max_requests_per_1_minute,
        max_tokens_per_1_minute: rl.max_tokens_per_1_minute,
        max_images_per_1_minute: rl.max_images_per_1_minute,
      }));
      all.push(...batch);
      after = data.has_more && data.last_id ? data.last_id : null;
      if (page > 1) console.log(`${tag} Page ${page}: fetched ${batch.length} more (total so far: ${all.length})`);
    } while (after);

    // Skip non-updatable model types — OpenAI API blocks updating these:
    //   ft:*           = fine-tuned models (rate_limit_not_updatable)
    //   *-shared       = ChatGPT shared-tier limits (rate_limit_not_updatable)
    //   *-alpha-shared = internal alpha shared limits
    const isNonUpdatable = (model?: string) =>
      !model ? false : model.startsWith('ft:') || model.endsWith('-shared') || model.endsWith('-alpha-shared');
    const killable = all.filter(rl => !isNonUpdatable(rl.model));
    const skippedCount = all.length - killable.length;
    console.log(`${tag} ${all.length} total rate limits across ${page} page(s), ${killable.length} killable (${skippedCount} non-updatable skipped)`);
    return killable;
  }
}
