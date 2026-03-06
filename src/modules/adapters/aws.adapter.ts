// src/modules/adapters/aws.adapter.ts
// CostGuard — AWS spend monitoring and IAM Deny-All kill switch

import {
  IAMClient,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand,
  CreatePolicyCommand,
} from '@aws-sdk/client-iam';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import type { PlatformAdapter, SpendData, KillResult, RestoreResult } from './base.adapter';

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  roleName: string;   // IAM role to freeze
  accountId: string;
}

const DENY_POLICY_NAME = 'CostGuard_EmergencyFreeze';

export class AWSAdapter implements PlatformAdapter {
  private iam: IAMClient;
  private ce: CostExplorerClient;

  constructor(private creds: AWSCredentials) {
    const config = {
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      region: creds.region,
    };
    this.iam = new IAMClient(config);
    this.ce = new CostExplorerClient(config);
  }

  async getSpend(): Promise<SpendData> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = now.toISOString().split('T')[0];

    const res = await this.ce.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
    }));

    const amount = parseFloat(
      res.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount ?? '0'
    );
    return { amount, period: 'monthly', currency: 'usd' };
  }

  async kill(): Promise<KillResult> {
    try {
      const policyArn = `arn:aws:iam::${this.creds.accountId}:policy/${DENY_POLICY_NAME}`;
      try {
        await this.iam.send(new CreatePolicyCommand({
          PolicyName: DENY_POLICY_NAME,
          PolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{ Effect: 'Deny', Action: '*', Resource: '*' }],
          }),
        }));
      } catch { /* policy already exists */ }

      await this.iam.send(new AttachRolePolicyCommand({
        RoleName: this.creds.roleName,
        PolicyArn: policyArn,
      }));

      return { success: true, method: 'iam_deny_all_attached', reversible: true };
    } catch (err) {
      return { success: false, method: 'iam_deny_all_attached', reversible: true, error: String(err) };
    }
  }

  async restore(): Promise<RestoreResult> {
    try {
      const policyArn = `arn:aws:iam::${this.creds.accountId}:policy/${DENY_POLICY_NAME}`;
      await this.iam.send(new DetachRolePolicyCommand({
        RoleName: this.creds.roleName,
        PolicyArn: policyArn,
      }));
      return { success: true, method: 'iam_deny_all_removed' };
    } catch (err) {
      return { success: false, method: 'iam_deny_all_removed', error: String(err) };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ce.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: '2024-01-01', End: '2024-01-02' },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
      }));
      return true;
    } catch { return false; }
  }
}
