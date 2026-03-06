// src/modules/adapters/anthropic.adapter.ts
// CostGuard — Anthropic spend monitoring and API key kill switch

import { withRetry } from '@/lib/backoff';
import type { PlatformAdapter, SpendData, KillResult, RestoreResult } from './base.adapter';

interface AnthropicCredentials {
  adminKey: string;   // sk-ant-admin-...
  apiKeyId: string;   // key_...
}

export class AnthropicAdapter implements PlatformAdapter {
  constructor(private creds: AnthropicCredentials) {}

  async getSpend(): Promise<SpendData> {
    return withRetry(async () => {
      const res = await fetch(
        'https://api.anthropic.com/v1/organizations/usage',
        {
          headers: {
            'x-api-key': this.creds.adminKey,
            'anthropic-version': '2023-06-01',
          },
        }
      );
      if (!res.ok) throw new Error(`Anthropic usage API ${res.status}`);
      const data = await res.json();
      return {
        amount: data.total_cost ?? 0,
        period: 'monthly',
        currency: 'usd',
      };
    });
  }

  async kill(): Promise<KillResult> {
    try {
      const res = await fetch(
        `https://api.anthropic.com/v1/organizations/api_keys/${this.creds.apiKeyId}`,
        {
          method: 'POST',
          headers: {
            'x-api-key': this.creds.adminKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'inactive' }),
        }
      );
      return { success: res.ok, method: 'api_key_deactivated', reversible: true };
    } catch (err) {
      return { success: false, method: 'api_key_deactivated', reversible: true, error: String(err) };
    }
  }

  async restore(): Promise<RestoreResult> {
    try {
      const res = await fetch(
        `https://api.anthropic.com/v1/organizations/api_keys/${this.creds.apiKeyId}`,
        {
          method: 'POST',
          headers: {
            'x-api-key': this.creds.adminKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'active' }),
        }
      );
      return { success: res.ok, method: 'api_key_reactivated' };
    } catch (err) {
      return { success: false, method: 'api_key_reactivated', error: String(err) };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.anthropic.com/v1/organizations/api_keys/${this.creds.apiKeyId}`,
        {
          headers: {
            'x-api-key': this.creds.adminKey,
            'anthropic-version': '2023-06-01',
          },
        }
      );
      return res.ok;
    } catch { return false; }
  }
}
