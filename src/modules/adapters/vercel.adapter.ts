// src/modules/adapters/vercel.adapter.ts
// CostGuard — Vercel spend monitoring and project pause kill switch

import type { PlatformAdapter, SpendData, KillResult, RestoreResult, PlatformSnapshot } from './base.adapter';

interface VercelCredentials {
  accessToken: string;
  projectId: string;
  teamId?: string;
}

export class VercelAdapter implements PlatformAdapter {
  private headers: Record<string, string>;

  constructor(private creds: VercelCredentials) {
    this.headers = { Authorization: `Bearer ${creds.accessToken}` };
  }

  async getSpend(): Promise<SpendData> {
    const url = this.creds.teamId
      ? `https://api.vercel.com/v2/teams/${this.creds.teamId}/usage`
      : 'https://api.vercel.com/v2/usage';
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Vercel usage API ${res.status}`);
    const data = await res.json();
    const amount = (data.bandwidth?.used ?? 0) / 1e9 * 0.40 +
                   (data.functionInvocations?.used ?? 0) / 1e6 * 0.40;
    return { amount, period: 'monthly', currency: 'usd' };
  }

  async getSnapshot(): Promise<PlatformSnapshot> {
    try {
      const teamQ = this.creds.teamId ? `?teamId=${this.creds.teamId}` : '';
      const res = await fetch(
        `https://api.vercel.com/v9/projects/${this.creds.projectId}${teamQ}`,
        { headers: this.headers }
      );
      const data = await res.json() as { name?: string; paused?: boolean };
      return {
        capturedAt: new Date().toISOString(),
        provider: 'VERCEL',
        data: { projectId: this.creds.projectId, name: data.name, paused: data.paused ?? false },
      };
    } catch {
      return {
        capturedAt: new Date().toISOString(),
        provider: 'VERCEL',
        data: { projectId: this.creds.projectId, paused: false },
      };
    }
  }

  async kill(): Promise<KillResult> {
    try {
      const snapshot = await this.getSnapshot();
      const teamQ = this.creds.teamId ? `?teamId=${this.creds.teamId}` : '';
      const res = await fetch(
        `https://api.vercel.com/v1/projects/${this.creds.projectId}/pause${teamQ}`,
        { method: 'POST', headers: this.headers }
      );
      return { success: res.ok, method: 'project_paused', reversible: true, snapshot };
    } catch (err) {
      return { success: false, method: 'project_paused', reversible: true, error: String(err) };
    }
  }

  async restore(_snapshot?: PlatformSnapshot): Promise<RestoreResult> {
    try {
      const teamQ = this.creds.teamId ? `?teamId=${this.creds.teamId}` : '';
      const res = await fetch(
        `https://api.vercel.com/v1/projects/${this.creds.projectId}/resume${teamQ}`,
        { method: 'POST', headers: this.headers }
      );
      return { success: res.ok, method: 'project_resumed' };
    } catch (err) {
      return { success: false, method: 'project_resumed', error: String(err) };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.vercel.com/v9/projects/${this.creds.projectId}`,
        { headers: this.headers }
      );
      return res.ok;
    } catch { return false; }
  }
}
