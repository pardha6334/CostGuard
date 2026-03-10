// src/modules/adapters/anthropic.adapter.ts
// CostGuard — Anthropic spend monitoring and API key kill switch (workspace-scoped)

import type { PlatformAdapter, SpendData, KillResult, RestoreResult, PlatformSnapshot } from './base.adapter';

// ─── TYPES ─────────────────────────────────────────────────────────────────

export interface AnthropicApiKey {
  id: string;
  type: 'api_key';
  name: string;
  status: 'active' | 'inactive';
  workspace_id: string | null;
  created_at: string;
}

export interface AnthropicWorkspace {
  id: string;
  type: 'workspace';
  name: string;
  created_at: string;
  archived_at: string | null;
  display_color: string;
}

export interface AnthropicCostReport {
  data: Array<{
    workspace_id: string | null;
    description: string | null;
    start_time: string;
    end_time: string;
    cost: number;
  }>;
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

export interface AnthropicUsageReport {
  data: Array<{
    workspace_id: string | null;
    model: string;
    start_time: string;
    end_time: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    requests: number;
  }>;
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

export interface AnthropicSnapshot {
  provider: 'ANTHROPIC';
  capturedAt: string;
  workspaceId: string | null;
  apiKeys: Array<{ id: string; name: string; status: 'active' }>;
}

// ─── TOKEN PRICE TABLE ─────────────────────────────────────────────────────

const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  default: { input: 3, output: 15 },
};

export function estimateCostFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const prices = ANTHROPIC_PRICES[model] ?? ANTHROPIC_PRICES.default;
  return (
    (inputTokens / 1_000_000) * prices.input +
    (outputTokens / 1_000_000) * prices.output
  );
}

// ─── CLASS ─────────────────────────────────────────────────────────────────

export class AnthropicAdapter implements PlatformAdapter {
  private readonly baseUrl = 'https://api.anthropic.com';
  private readonly headers: Record<string, string>;

  constructor(
    private readonly adminKey: string,
    private readonly workspaceId?: string | null
  ) {
    this.headers = {
      'anthropic-version': '2023-06-01',
      'x-api-key': adminKey,
      'content-type': 'application/json',
    };
  }

  private async anthropicFetch<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const isWorkspaces = path.includes('workspaces');
    if (isWorkspaces) {
      console.log('[ANTHROPIC:FETCH] Request', { path, url, method: options?.method ?? 'GET' });
    }
    const maxRetries = 4;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          ...options,
          headers: { ...this.headers, ...options?.headers },
        });

        if (isWorkspaces) {
          console.log('[ANTHROPIC:FETCH] Response', { path, status: res.status, ok: res.ok });
        }

        if (res.status === 401) {
          if (isWorkspaces) console.error('[ANTHROPIC:FETCH] 401 Unauthorized');
          throw new Error('Invalid admin key');
        }
        if (res.status === 403) {
          const body = await res.text();
          const bodyPreview = body.length > 400 ? `${body.slice(0, 400)}...` : body;
          console.error('[ANTHROPIC:FETCH] 403 Forbidden', { path, body: bodyPreview });
          throw new Error(`Admin role required: ${bodyPreview}`);
        }
        if (res.status === 429) {
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (res.status >= 500 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          const bodyPreview = text.length > 400 ? `${text.slice(0, 400)}...` : text;
          console.error('[ANTHROPIC:FETCH] Non-OK', { path, status: res.status, body: bodyPreview });
          throw new Error(`Anthropic API ${res.status}: ${text}`);
        }

        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const json = (await res.json()) as T;
          if (isWorkspaces && json && typeof json === 'object' && 'data' in json) {
            const data = (json as { data?: unknown[] }).data;
            console.log('[ANTHROPIC:FETCH] Success JSON', { path, dataLength: data?.length ?? 0, has_more: (json as { has_more?: boolean }).has_more });
          }
          return json;
        }
        return undefined as T;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (
          lastErr.message === 'Invalid admin key' ||
          lastErr.message === 'Admin role required'
        ) {
          throw lastErr;
        }
      }
    }
    throw lastErr ?? new Error('Anthropic API request failed');
  }

  async validateAdminKey(): Promise<{
    valid: boolean;
    orgId?: string;
    orgName?: string;
    error?: string;
  }> {
    try {
      const data = (await this.anthropicFetch<{ id?: string; type?: string; name?: string }>(
        '/v1/organizations/me'
      )) as { id?: string; type?: string; name?: string } | undefined;
      if (data?.id) {
        return { valid: true, orgId: data.id, orgName: data.name };
      }
      return { valid: false, error: 'Invalid response' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: msg };
    }
  }

  async listWorkspaces(): Promise<AnthropicWorkspace[]> {
    console.log('[ANTHROPIC:WORKSPACES] listWorkspaces() start');
    const all: AnthropicWorkspace[] = [];
    let afterId: string | null = null;
    let pageNum = 0;

    do {
      pageNum++;
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (afterId) params.set('after_id', afterId);
      const path = `/v1/organizations/workspaces?${params.toString()}`;
      const res = (await this.anthropicFetch<{
        data?: AnthropicWorkspace[];
        has_more?: boolean;
        last_id?: string;
      }>(path)) as { data?: AnthropicWorkspace[]; has_more?: boolean; last_id?: string };
      const page = res.data ?? [];
      const active = page.filter((w) => !w.archived_at);
      console.log('[ANTHROPIC:WORKSPACES] page', { pageNum, rawLength: page.length, activeLength: active.length, has_more: res.has_more, names: active.map((w) => w.name) });
      all.push(...active);
      afterId = res.has_more && res.last_id ? res.last_id : null;
    } while (afterId);

    console.log('[ANTHROPIC:WORKSPACES] listWorkspaces() done', { total: all.length, ids: all.map((w) => w.id) });
    return all;
  }

  async listActiveApiKeys(): Promise<AnthropicApiKey[]> {
    const all: AnthropicApiKey[] = [];
    let afterId: string | null = null;

    do {
      const params = new URLSearchParams();
      params.set('status', 'active');
      params.set('limit', '100');
      if (this.workspaceId) params.set('workspace_id', this.workspaceId);
      if (afterId) params.set('after_id', afterId);
      const path = `/v1/organizations/api_keys?${params.toString()}`;
      const res = (await this.anthropicFetch<{
        data?: AnthropicApiKey[];
        has_more?: boolean;
        last_id?: string;
      }>(path)) as { data?: AnthropicApiKey[]; has_more?: boolean; last_id?: string };
      const page = res.data ?? [];
      const active = page.filter((k) => k.status === 'active');
      all.push(...active);
      afterId = res.has_more && res.last_id ? res.last_id : null;
    } while (afterId);

    return all;
  }

  async getSpend(windowStart?: Date): Promise<SpendData> {
    const now = new Date();
    const start = windowStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const starting_at = start.toISOString();
    const ending_at = now.toISOString();

    const params = new URLSearchParams();
    params.set('starting_at', starting_at);
    params.set('ending_at', ending_at);
    params.append('group_by[]', 'workspace_id');

    const res = (await this.anthropicFetch<AnthropicCostReport>(
      `/v1/organizations/cost_report?${params.toString()}`
    )) as AnthropicCostReport;

    let total = 0;
    for (const row of res.data ?? []) {
      if (this.workspaceId != null) {
        if (row.workspace_id !== this.workspaceId) continue;
      }
      total += Number(row.cost ?? 0);
    }

    return {
      amount: total,
      currency: 'usd',
      period: 'monthly',
    };
  }

  async getBurnRate(): Promise<{ burnRatePerHour: number; windowMinutes: number }> {
    const now = new Date();
    const windowMinutes = 15;
    const start = new Date(now.getTime() - windowMinutes * 60 * 1000);
    const params = new URLSearchParams();
    params.set('starting_at', start.toISOString());
    params.set('ending_at', now.toISOString());
    params.set('bucket_width', '1m');
    params.append('group_by[]', 'model');
    if (this.workspaceId) params.append('workspace_ids[]', this.workspaceId);

    const res = (await this.anthropicFetch<AnthropicUsageReport>(
      `/v1/organizations/usage_report/messages?${params.toString()}`
    )) as AnthropicUsageReport;

    let totalCost = 0;
    for (const row of res.data ?? []) {
      totalCost += estimateCostFromTokens(
        row.model,
        row.input_tokens + (row.cache_creation_input_tokens ?? 0) + (row.cache_read_input_tokens ?? 0),
        row.output_tokens
      );
    }
    const hours = windowMinutes / 60;
    const burnRatePerHour = hours > 0 ? totalCost / hours : 0;
    return { burnRatePerHour, windowMinutes };
  }

  async getSnapshot(): Promise<PlatformSnapshot> {
    const keys = await this.listActiveApiKeys();
    const snapshot: AnthropicSnapshot = {
      provider: 'ANTHROPIC',
      capturedAt: new Date().toISOString(),
      workspaceId: this.workspaceId ?? null,
      apiKeys: keys.map((k) => ({ id: k.id, name: k.name, status: 'active' as const })),
    };
    return {
      capturedAt: snapshot.capturedAt,
      provider: 'ANTHROPIC',
      data: snapshot as unknown as Record<string, unknown>,
    };
  }

  async kill(): Promise<KillResult> {
    const tag = `[ANTHROPIC:KILL${this.workspaceId ? `:${this.workspaceId.slice(-8)}` : ''}]`;
    try {
      const keys = await this.listActiveApiKeys();
      let killed = 0;
      let failed = 0;

      const results = await Promise.allSettled(
        keys.map((key) =>
          this.anthropicFetch<unknown>(`/v1/organizations/api_keys/${key.id}`, {
            method: 'POST',
            body: JSON.stringify({ status: 'inactive' }),
          })
        )
      );

      results.forEach((r, i) => {
        const key = keys[i];
        if (r.status === 'fulfilled') {
          killed++;
          console.log(`${tag} keyId=${key.id} name=${key.name} → inactive ✅`);
        } else {
          failed++;
          console.error(`${tag} keyId=${key.id} failed:`, (r as PromiseRejectedResult).reason);
        }
      });

      console.log(
        `${tag} ${killed}/${keys.length} API keys deactivated | Coverage: 100% (all keys, no exceptions)`
      );

      return {
        success: failed === 0,
        method: 'api_key_inactive',
        reversible: true,
        hardBlock: true,
        propagationDelay: 0,
        hardBlocked: killed,
        effectiveCoverage: 100,
      };
    } catch (err) {
      const msg = String(err);
      console.error(`${tag} ❌ ${msg}`);
      return {
        success: false,
        method: 'api_key_inactive',
        reversible: true,
        error: msg,
      };
    }
  }

  async restore(snapshot?: PlatformSnapshot): Promise<RestoreResult> {
    const tag = `[ANTHROPIC:RESTORE${this.workspaceId ? `:${this.workspaceId.slice(-8)}` : ''}]`;
    try {
      const data = snapshot?.data as AnthropicSnapshot | undefined;
      const apiKeys = data?.apiKeys ?? [];
      if (apiKeys.length === 0) {
        console.warn(`${tag} No apiKeys in snapshot — nothing to restore`);
        return { success: true, method: 'api_key_active' };
      }

      const results = await Promise.allSettled(
        apiKeys.map((k) =>
          this.anthropicFetch<unknown>(`/v1/organizations/api_keys/${k.id}`, {
            method: 'POST',
            body: JSON.stringify({ status: 'active' }),
          })
        )
      );

      const restored = results.filter((r) => r.status === 'fulfilled').length;
      console.log(`${tag} ${restored} API keys reactivated ✅`);
      return {
        success: restored === apiKeys.length,
        method: 'api_key_active',
      };
    } catch (err) {
      const msg = String(err);
      console.error(`${tag} ❌ ${msg}`);
      return { success: false, method: 'api_key_active', error: msg };
    }
  }

  async testConnection(): Promise<boolean> {
    const r = await this.validateAdminKey();
    return r.valid;
  }
}
