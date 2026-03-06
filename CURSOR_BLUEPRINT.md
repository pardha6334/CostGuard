# ⚡ CostGuard — Complete Cursor Development Blueprint
> Hand this file to Cursor. It contains everything needed to build the full production app from scratch.

---

## 0. WHAT WE ARE BUILDING

**CostGuard** is a SaaS dashboard that monitors AI/cloud platform spend in real-time and automatically executes "kill switches" when spend breaches thresholds — before a runaway bill becomes a disaster.

**Core value:** The ONLY tool that combines real-time multi-platform monitoring + automated kill switches + circuit breaker logic at indie-friendly pricing ($49–$499/mo).

**Target user:** Solo developers and small startups using OpenAI, Anthropic, AWS, Vercel, Supabase.

---

## 1. TECH STACK (Non-negotiable)

```
Frontend:     Next.js 14 (App Router) + TypeScript 5
Styling:      Tailwind CSS + shadcn/ui (customized dark theme)
Charts:       Recharts
Forms:        React Hook Form + Zod
Tables:       TanStack Table v8
Animations:   Framer Motion
Icons:        Lucide React

Backend:      Next.js API Routes (Edge-compatible)
Database:     Supabase (Postgres 15 + Auth + Vault + Realtime)
ORM:          Prisma 5
Cache:        Upstash Redis (serverless)
Job Queue:    Upstash QStash (cron + HTTP queue)
Encryption:   Node.js crypto (built-in) — AES-256-GCM

Payments:     Stripe (subscriptions)
Email:        Resend + React Email templates
Analytics:    PostHog
Errors:       Sentry
Hosting:      Vercel Pro

Testing:      Vitest (unit) + Playwright (E2E)
```

---

## 2. PROJECT STRUCTURE

```
costguard/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── verify/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          ← sidebar + topbar wrapper
│   │   │   ├── page.tsx            ← main dashboard
│   │   │   ├── platforms/page.tsx
│   │   │   ├── incidents/page.tsx
│   │   │   ├── thresholds/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── billing/page.tsx
│   │   └── api/
│   │       ├── auth/callback/route.ts
│   │       ├── cron/poll/route.ts        ← QStash calls this every 60s
│   │       ├── platforms/
│   │       │   ├── route.ts              ← GET list, POST add
│   │       │   └── [id]/route.ts         ← GET, PATCH, DELETE
│   │       ├── incidents/route.ts
│   │       ├── kill/route.ts             ← POST execute kill
│   │       ├── restore/route.ts          ← POST restore platform
│   │       └── webhooks/
│   │           └── stripe/route.ts
│   │
│   ├── modules/
│   │   ├── polling/
│   │   │   ├── engine.ts           ← orchestrates all polls
│   │   │   └── scheduler.ts        ← QStash job management
│   │   ├── adapters/
│   │   │   ├── base.adapter.ts     ← interface PlatformAdapter
│   │   │   ├── openai.adapter.ts
│   │   │   ├── anthropic.adapter.ts
│   │   │   ├── aws.adapter.ts
│   │   │   ├── vercel.adapter.ts
│   │   │   └── supabase.adapter.ts
│   │   ├── circuit-breaker/
│   │   │   ├── state-machine.ts    ← FSM: CLOSED → OPEN → HALF_OPEN
│   │   │   ├── burn-rate.ts        ← sliding window calculator
│   │   │   └── anomaly.ts          ← z-score detector
│   │   ├── kill-switch/
│   │   │   ├── executor.ts         ← parallel kill all platforms
│   │   │   └── restore.ts          ← restore flow
│   │   └── alerts/
│   │       ├── dispatcher.ts       ← priority queue sender
│   │       ├── slack.ts
│   │       └── email.ts
│   │
│   ├── lib/
│   │   ├── crypto.ts               ← AES-256-GCM vault
│   │   ├── redis.ts                ← Upstash client singleton
│   │   ├── db.ts                   ← Prisma client singleton
│   │   └── stripe.ts               ← Stripe client
│   │
│   └── components/
│       ├── layout/
│       │   ├── Sidebar.tsx
│       │   └── Topbar.tsx
│       ├── dashboard/
│       │   ├── MetricCard.tsx
│       │   ├── SpendChart.tsx
│       │   ├── PlatformCard.tsx
│       │   ├── KillPanel.tsx
│       │   ├── DistanceGauge.tsx   ← THE hero component
│       │   └── ActivityFeed.tsx
│       ├── platforms/
│       │   ├── PlatformFullCard.tsx
│       │   └── ConnectWizard.tsx
│       ├── incidents/
│       │   ├── IncidentTable.tsx
│       │   └── IncidentModal.tsx
│       ├── thresholds/
│       │   ├── ThresholdCard.tsx
│       │   └── GlobalSettings.tsx
│       └── ui/                     ← shadcn/ui components
│
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── unit/
│   │   ├── burn-rate.test.ts
│   │   ├── anomaly.test.ts
│   │   └── circuit-breaker.test.ts
│   └── e2e/
│       ├── kill-switch.spec.ts
│       └── onboarding.spec.ts
├── .env.local
└── .env.test
```

---

## 3. DATABASE SCHEMA (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id          String    @id @default(cuid())
  email       String    @unique
  plan        Plan      @default(TRIAL)
  trialEndsAt DateTime?
  stripeId    String?   @unique
  slackWebhook String?
  platforms   Platform[]
  incidents   Incident[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Platform {
  id              String        @id @default(cuid())
  userId          String
  provider        Provider
  encryptedCreds  String        // AES-256-GCM encrypted JSON
  displayName     String?       // user label e.g. "prod-openai"
  environment     String        @default("production")
  hourlyLimit     Float         @default(200)
  dailyBudget     Float         @default(500)
  monthlyBudget   Float         @default(5000)
  breakerState    BreakerState  @default(CLOSED)
  isActive        Boolean       @default(true)
  autoKill        Boolean       @default(true)
  anomalyDetect   Boolean       @default(true)
  alertEmail      Boolean       @default(true)
  alertSlack      Boolean       @default(true)
  alertWebhook    Boolean       @default(false)
  lastPolledAt    DateTime?
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  readings        SpendReading[]
  incidents       Incident[]

  @@index([userId, isActive])
  @@index([userId, provider])
}

model SpendReading {
  id          String   @id @default(cuid())
  platformId  String
  amount      Float    // cumulative spend in $
  burnRate    Float    // calculated $/hr
  recordedAt  DateTime @default(now())
  platform    Platform @relation(fields: [platformId], references: [id], onDelete: Cascade)

  @@index([platformId, recordedAt])
}

model Incident {
  id              String         @id @default(cuid())
  userId          String
  platformId      String
  triggerType     TriggerType
  spendAtTrigger  Float
  burnRateAtKill  Float
  thresholdLimit  Float
  estimatedSaved  Float          @default(0)
  status          IncidentStatus @default(ACTIVE)
  killedAt        DateTime       @default(now())
  resolvedAt      DateTime?
  resolvedByUserId String?
  durationSecs    Int?
  notes           String?
  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  platform        Platform       @relation(fields: [platformId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([userId, killedAt])
}

enum Plan           { TRIAL STARTER PRO TEAM }
enum Provider       { OPENAI ANTHROPIC AWS VERCEL SUPABASE GCP AZURE CLOUDFLARE TWILIO REPLICATE }
enum BreakerState   { CLOSED OPEN HALF_OPEN }
enum TriggerType    { HOURLY_LIMIT DAILY_LIMIT SPIKE_DETECTED MANUAL }
enum IncidentStatus { ACTIVE RESTORING RESOLVED }
```

---

## 4. ENVIRONMENT VARIABLES

```bash
# .env.local — ALL required

# Supabase
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[ref].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Encryption — 32 random bytes as hex
ENCRYPTION_KEY="a1b2c3d4e5f6...64charshex"

# Upstash Redis
UPSTASH_REDIS_REST_URL="https://[id].upstash.io"
UPSTASH_REDIS_REST_TOKEN="..."

# Upstash QStash
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="..."
QSTASH_CURRENT_SIGNING_KEY="..."
QSTASH_NEXT_SIGNING_KEY="..."

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."

# Stripe Price IDs
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PRO="price_..."
STRIPE_PRICE_TEAM="price_..."

# Resend
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="alerts@costguard.dev"

# Sentry
SENTRY_DSN="https://...@sentry.io/..."

# PostHog
NEXT_PUBLIC_POSTHOG_KEY="phc_..."
NEXT_PUBLIC_POSTHOG_HOST="https://app.posthog.com"

# App
NEXT_PUBLIC_APP_URL="https://costguard.dev"
CRON_SECRET="random-secret-to-verify-qstash-calls"
```

---

## 5. CORE ALGORITHMS (Implement Exactly As Specified)

### 5.1 Sliding Window Burn Rate — O(1)

```typescript
// src/modules/circuit-breaker/burn-rate.ts
export class SlidingWindowBurnRate {
  private buffer: { amount: number; ts: number }[];
  private head = 0;
  private size = 0;
  private readonly W = 60; // 60 readings = 60 minutes of history

  constructor() {
    this.buffer = new Array(this.W);
  }

  push(amount: number, timestamp: number = Date.now()) {
    this.buffer[this.head] = { amount, ts: timestamp };
    this.head = (this.head + 1) % this.W;
    this.size = Math.min(this.size + 1, this.W);
  }

  getBurnRatePerHour(): number {
    if (this.size < 2) return 0;
    const oldest = this.buffer[(this.head - this.size + this.W) % this.W];
    const newest = this.buffer[(this.head - 1 + this.W) % this.W];
    const deltaAmt = newest.amount - oldest.amount;
    const deltaHrs = (newest.ts - oldest.ts) / 3_600_000;
    return deltaHrs > 0 ? deltaAmt / deltaHrs : 0;
  }

  getReadings(): number[] {
    return Array.from({ length: this.size }, (_, i) =>
      this.buffer[(this.head - this.size + i + this.W) % this.W].amount
    );
  }
}
```

### 5.2 Circuit Breaker FSM — O(1)

```typescript
// src/modules/circuit-breaker/state-machine.ts
export type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type CBAction = 'MONITOR' | 'KILL' | 'WATCH' | 'CLOSE';

export class CircuitBreaker {
  private state: CBState;
  private halfOpenStarted?: Date;
  private readonly HALF_OPEN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  constructor(initialState: CBState = 'CLOSED') {
    this.state = initialState;
  }

  getState(): CBState { return this.state; }

  evaluate(burnRate: number, limit: number): CBAction {
    switch (this.state) {
      case 'CLOSED':
        if (burnRate > limit) {
          this.state = 'OPEN';
          return 'KILL';
        }
        return 'MONITOR';

      case 'OPEN':
        return 'MONITOR'; // waiting for manual restore

      case 'HALF_OPEN':
        if (burnRate > limit) {
          this.state = 'OPEN';
          return 'KILL'; // spike again → re-kill
        }
        if (this.halfOpenElapsedMs() > this.HALF_OPEN_WINDOW_MS) {
          this.state = 'CLOSED';
          return 'CLOSE'; // stable for 15min → safe
        }
        return 'WATCH';
    }
  }

  initiateRestore() {
    if (this.state !== 'OPEN') return;
    this.state = 'HALF_OPEN';
    this.halfOpenStarted = new Date();
  }

  private halfOpenElapsedMs(): number {
    return this.halfOpenStarted
      ? Date.now() - this.halfOpenStarted.getTime()
      : 0;
  }
}
```

### 5.3 Z-Score Anomaly Detection

```typescript
// src/modules/circuit-breaker/anomaly.ts
export function detectAnomaly(
  historicalReadings: number[],
  currentRate: number,
  threshold = 3.0
): { isAnomaly: boolean; zScore: number; confidence: number } {
  const n = historicalReadings.length;
  if (n < 10) return { isAnomaly: false, zScore: 0, confidence: 0 };

  const mean = historicalReadings.reduce((a, b) => a + b, 0) / n;
  const variance = historicalReadings.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return { isAnomaly: false, zScore: 0, confidence: 0 };

  const zScore = (currentRate - mean) / stdDev;
  const confidence = Math.min(100, Math.round((zScore / 3) * 100));

  return {
    isAnomaly: zScore > threshold,
    zScore: Math.round(zScore * 100) / 100,
    confidence,
  };
}
```

### 5.4 Exponential Backoff

```typescript
// src/lib/backoff.ts
export function backoffDelay(attempt: number, base = 1000, cap = 30000): number {
  const exponential = Math.min(cap, base * 2 ** attempt);
  const jitter = Math.random() * exponential * 0.1;
  return exponential + jitter;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxAttempts - 1) throw err;
      await new Promise(r => setTimeout(r, backoffDelay(i)));
    }
  }
  throw new Error('Unreachable');
}
```

---

## 6. ADAPTER INTERFACE + ALL ADAPTERS

### 6.1 Base Interface

```typescript
// src/modules/adapters/base.adapter.ts
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
```

### 6.2 OpenAI Adapter

```typescript
// src/modules/adapters/openai.adapter.ts
import { withRetry } from '@/lib/backoff';

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
        `start_time=${Math.floor(startOfMonth.getTime()/1000)}` +
        `&end_time=${Math.floor(now.getTime()/1000)}` +
        `&project_id=${this.creds.projectId}`,
        { headers: { Authorization: `Bearer ${this.creds.adminKey}` } }
      );
      if (!res.ok) throw new Error(`OpenAI spend API ${res.status}`);
      const data = await res.json();
      const amount = data.data?.reduce((s: number, d: any) =>
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
      // Restore to plan defaults
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
```

### 6.3 Anthropic Adapter

```typescript
// src/modules/adapters/anthropic.adapter.ts
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
          }
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
        { headers: { 'x-api-key': this.creds.adminKey, 'anthropic-version': '2023-06-01' } }
      );
      return res.ok;
    } catch { return false; }
  }
}
```

### 6.4 AWS Adapter

```typescript
// src/modules/adapters/aws.adapter.ts
// Uses AWS SDK v3 — install: @aws-sdk/client-iam @aws-sdk/client-cloudtrail @aws-sdk/client-cost-explorer
import { IAMClient, AttachRolePolicyCommand, DetachRolePolicyCommand, CreatePolicyCommand, DeletePolicyCommand } from '@aws-sdk/client-iam';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';

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
      // Create and attach a Deny-All policy to the runaway role
      const policyArn = `arn:aws:iam::${this.creds.accountId}:policy/${DENY_POLICY_NAME}`;
      try {
        await this.iam.send(new CreatePolicyCommand({
          PolicyName: DENY_POLICY_NAME,
          PolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{ Effect: 'Deny', Action: '*', Resource: '*' }],
          }),
        }));
      } catch { /* already exists */ }

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
```

### 6.5 Vercel Adapter

```typescript
// src/modules/adapters/vercel.adapter.ts
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
    // Vercel doesn't have a direct spend API — use usage endpoint
    const url = creds.teamId
      ? `https://api.vercel.com/v2/teams/${this.creds.teamId}/usage`
      : 'https://api.vercel.com/v2/usage';
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Vercel usage API ${res.status}`);
    const data = await res.json();
    // Map bandwidth/function invocations to estimated cost
    const amount = (data.bandwidth?.used ?? 0) / 1e9 * 0.40 +
                   (data.functionInvocations?.used ?? 0) / 1e6 * 0.40;
    return { amount, period: 'monthly', currency: 'usd' };
  }

  async kill(): Promise<KillResult> {
    try {
      const teamQ = this.creds.teamId ? `?teamId=${this.creds.teamId}` : '';
      const res = await fetch(
        `https://api.vercel.com/v1/projects/${this.creds.projectId}/pause${teamQ}`,
        { method: 'POST', headers: this.headers }
      );
      return { success: res.ok, method: 'project_paused', reversible: true };
    } catch (err) {
      return { success: false, method: 'project_paused', reversible: true, error: String(err) };
    }
  }

  async restore(): Promise<RestoreResult> {
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
```

### 6.6 Supabase Adapter

```typescript
// src/modules/adapters/supabase.adapter.ts
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

  async kill(): Promise<KillResult> {
    try {
      // Rotate service role key — old key becomes invalid immediately
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${this.creds.projectRef}/api-keys`,
        { method: 'POST', headers: this.headers, body: JSON.stringify({ rotate: true }) }
      );
      return { success: res.ok, method: 'service_key_rotated', reversible: false };
    } catch (err) {
      return { success: false, method: 'service_key_rotated', reversible: false, error: String(err) };
    }
  }

  async restore(): Promise<RestoreResult> {
    // After key rotation, user must update their .env with new key
    // We can trigger a notification here
    return { success: true, method: 'manual_key_update_required' };
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
```

---

## 7. CREDENTIAL ENCRYPTION

```typescript
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes = 64 hex chars

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// Usage:
// Store:    platform.encryptedCreds = encrypt(JSON.stringify({ adminKey, projectId }))
// Retrieve: const creds = JSON.parse(decrypt(platform.encryptedCreds))
```

---

## 8. POLLING ENGINE (THE HEART)

```typescript
// src/modules/polling/engine.ts
// Called by /api/cron/poll every 60 seconds via QStash

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { decrypt } from '@/lib/crypto';
import { SlidingWindowBurnRate } from '@/modules/circuit-breaker/burn-rate';
import { CircuitBreaker } from '@/modules/circuit-breaker/state-machine';
import { detectAnomaly } from '@/modules/circuit-breaker/anomaly';
import { executeKill } from '@/modules/kill-switch/executor';
import { sendAlert } from '@/modules/alerts/dispatcher';
import { getAdapter } from './adapter-factory';

export async function runPollCycle() {
  // Get all active platforms
  const platforms = await prisma.platform.findMany({
    where: { isActive: true, breakerState: { in: ['CLOSED', 'HALF_OPEN'] } },
    include: { user: { select: { slackWebhook: true, email: true } } },
  });

  // Poll all in parallel, errors isolated per platform
  await Promise.allSettled(platforms.map(platform => pollPlatform(platform)));
}

async function pollPlatform(platform: any) {
  const lockKey = `lock:poll:${platform.id}`;

  // Prevent concurrent polls (race condition guard)
  const locked = await redis.set(lockKey, '1', { nx: true, ex: 90 });
  if (!locked) return; // Another worker is already polling this

  try {
    const creds = JSON.parse(decrypt(platform.encryptedCreds));
    const adapter = getAdapter(platform.provider, creds);

    // Get current spend
    const spendData = await adapter.getSpend();

    // Update sliding window in Redis (fast, no DB write)
    const windowKey = `window:${platform.id}`;
    const window = await redis.get<number[]>(windowKey) ?? [];
    window.push(spendData.amount);
    if (window.length > 60) window.shift();
    await redis.set(windowKey, window, { ex: 7200 });

    // Calculate burn rate
    const burnRateCalc = new SlidingWindowBurnRate();
    window.forEach((amt, i) => burnRateCalc.push(amt, Date.now() - (window.length - 1 - i) * 60000));
    const burnRate = burnRateCalc.getBurnRatePerHour();

    // Store reading in DB (async, don't block)
    prisma.spendReading.create({
      data: { platformId: platform.id, amount: spendData.amount, burnRate },
    }).catch(console.error);

    // Cache latest for dashboard
    await redis.set(`spend:${platform.id}:latest`, { amount: spendData.amount, burnRate, ts: Date.now() }, { ex: 300 });

    // Evaluate circuit breaker
    const cb = new CircuitBreaker(platform.breakerState);
    const anomaly = detectAnomaly(window, burnRate);
    const shouldKill = burnRate > platform.hourlyLimit && (anomaly.isAnomaly || burnRate > platform.hourlyLimit * 1.5);

    if (shouldKill && platform.breakerState === 'CLOSED') {
      // EXECUTE KILL
      await executeKill(platform, creds, burnRate);

      // Send alert
      await sendAlert({
        type: 'kill',
        platform: platform.provider,
        burnRate,
        threshold: platform.hourlyLimit,
        projectedSaved: burnRate * 24,
        user: platform.user,
      });
    }

  } finally {
    await redis.del(lockKey);
  }
}
```

### 8.1 Adapter Factory

```typescript
// src/modules/polling/adapter-factory.ts
import { OpenAIAdapter } from '@/modules/adapters/openai.adapter';
import { AnthropicAdapter } from '@/modules/adapters/anthropic.adapter';
import { AWSAdapter } from '@/modules/adapters/aws.adapter';
import { VercelAdapter } from '@/modules/adapters/vercel.adapter';
import { SupabaseAdapter } from '@/modules/adapters/supabase.adapter';

export function getAdapter(provider: string, creds: any): PlatformAdapter {
  const adapters: Record<string, () => PlatformAdapter> = {
    OPENAI: () => new OpenAIAdapter(creds),
    ANTHROPIC: () => new AnthropicAdapter(creds),
    AWS: () => new AWSAdapter(creds),
    VERCEL: () => new VercelAdapter(creds),
    SUPABASE: () => new SupabaseAdapter(creds),
  };
  const factory = adapters[provider];
  if (!factory) throw new Error(`No adapter for provider: ${provider}`);
  return factory();
}
```

---

## 9. KILL SWITCH EXECUTOR

```typescript
// src/modules/kill-switch/executor.ts
import { prisma } from '@/lib/db';
import { getAdapter } from '@/modules/polling/adapter-factory';
import { decrypt } from '@/lib/crypto';

export async function executeKill(platform: any, creds: any, burnRate: number) {
  const adapter = getAdapter(platform.provider, creds);

  const result = await adapter.kill();

  // Update DB — breaker is now OPEN
  await prisma.platform.update({
    where: { id: platform.id },
    data: { breakerState: 'OPEN' },
  });

  // Log incident
  const projectedSaved = burnRate * 24;
  await prisma.incident.create({
    data: {
      userId: platform.userId,
      platformId: platform.id,
      triggerType: burnRate > platform.hourlyLimit ? 'HOURLY_LIMIT' : 'SPIKE_DETECTED',
      spendAtTrigger: 0, // fill from latest reading
      burnRateAtKill: burnRate,
      thresholdLimit: platform.hourlyLimit,
      estimatedSaved: projectedSaved,
      status: 'ACTIVE',
    },
  });

  return result;
}

export async function executeRestore(platformId: string, userId: string) {
  const platform = await prisma.platform.findUnique({ where: { id: platformId } });
  if (!platform || platform.userId !== userId) throw new Error('Not found');

  const creds = JSON.parse(decrypt(platform.encryptedCreds));
  const adapter = getAdapter(platform.provider, creds);

  const result = await adapter.restore();

  // Move to HALF_OPEN — monitor for 15 minutes before going CLOSED
  await prisma.platform.update({
    where: { id: platformId },
    data: { breakerState: 'HALF_OPEN' },
  });

  // Resolve active incident
  await prisma.incident.updateMany({
    where: { platformId, status: 'ACTIVE' },
    data: {
      status: 'RESTORING',
      resolvedByUserId: userId,
    },
  });

  return result;
}
```

---

## 10. API ROUTES

### 10.1 Cron Poll Route

```typescript
// src/app/api/cron/poll/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { runPollCycle } from '@/modules/polling/engine';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(req: NextRequest) {
  // Verify this is actually from QStash
  const body = await req.text();
  const valid = await receiver.verify({ body, signature: req.headers.get('upstash-signature') ?? '' });
  if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await runPollCycle();
  return NextResponse.json({ ok: true });
}
```

### 10.2 Kill Route

```typescript
// src/app/api/kill/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeKill } from '@/modules/kill-switch/executor';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { platformId } = await req.json();

  const platform = await prisma.platform.findUnique({ where: { id: platformId } });
  if (!platform || platform.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const creds = JSON.parse(decrypt(platform.encryptedCreds));
  const result = await executeKill(platform, creds, 0); // burnRate=0 means manual

  return NextResponse.json({ success: result.success, method: result.method });
}
```

### 10.3 Platforms Route

```typescript
// src/app/api/platforms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { z } from 'zod';
import { getAdapter } from '@/modules/polling/adapter-factory';

const AddPlatformSchema = z.object({
  provider: z.enum(['OPENAI', 'ANTHROPIC', 'AWS', 'VERCEL', 'SUPABASE']),
  credentials: z.record(z.string()), // raw creds — we encrypt before storing
  hourlyLimit: z.number().min(1),
  dailyBudget: z.number().min(1),
  displayName: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const platforms = await prisma.platform.findMany({
    where: { userId: user.id, isActive: true },
    select: {
      id: true, provider: true, displayName: true, environment: true,
      hourlyLimit: true, dailyBudget: true, breakerState: true,
      lastPolledAt: true, autoKill: true, alertEmail: true, alertSlack: true,
      // NEVER return encryptedCreds
    },
  });

  return NextResponse.json({ platforms });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = AddPlatformSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { provider, credentials, hourlyLimit, dailyBudget, displayName } = parsed.data;

  // Test connection before saving
  const adapter = getAdapter(provider, credentials);
  const ok = await adapter.testConnection();
  if (!ok) return NextResponse.json({ error: 'Connection test failed. Check your credentials.' }, { status: 400 });

  const encryptedCreds = encrypt(JSON.stringify(credentials));

  const platform = await prisma.platform.create({
    data: {
      userId: user.id,
      provider,
      encryptedCreds,
      hourlyLimit,
      dailyBudget,
      displayName: displayName ?? provider,
    },
  });

  return NextResponse.json({ platform: { id: platform.id, provider: platform.provider } });
}
```

---

## 11. UI DESIGN SYSTEM

### 11.1 Colors (tailwind.config.ts)

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        // Dark theme (default)
        void: '#03030A',
        deep: '#07070F',
        surface: '#111122',
        panel: '#14142A',
        border: '#1C1C38',

        // Status
        kill: { DEFAULT: '#FF1A2E', dark: '#CC0F20' },
        safe: { DEFAULT: '#00FF6A', dark: '#00CC55' },
        warn: { DEFAULT: '#FFB800', dark: '#CC9200' },
        cyan: { DEFAULT: '#00E5FF', dark: '#00B8CC' },
      },
      fontFamily: {
        display: ['Barlow Condensed', 'sans-serif'],
        body: ['Barlow', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace'],
      },
    },
  },
};
```

### 11.2 Key UI Components to Build

#### DistanceGauge (most important — the hero UI)

```tsx
// src/components/dashboard/DistanceGauge.tsx
// Shows: platform name | fill bar from 0→100% | remaining amount
// Fill color: green (0-60%) → yellow (60-85%) → red (85-100%)
// At 100%: bar pulses, label says "BREACHED"
// Used on: Dashboard sidebar (kill panel) and Platforms page

interface DistanceGaugeProps {
  platform: string;
  icon: string;
  burnRate: number;
  threshold: number;
  killed?: boolean;
}

// Visual spec:
// Track: 6px tall, background: border color, border-radius: 3px
// Fill: animated width transition 1.2s cubic-bezier(0.23,1,0.32,1)
// Right side shows: "$X/hr remaining" or "BREACHED" in red
```

#### KillRing (circular progress in kill panel)

```tsx
// src/components/dashboard/KillPanel.tsx
// SVG circle with stroke-dashoffset animation
// Ring radius: 66px, stroke-width: 6
// Center: shows worst platform % + state label
// Below: Blast Radius card (shows projected 24h damage)
// Bottom: Kill Switch button (armed=red gradient, safe=green outline)
```

---

## 12. PAGES SPEC

### Dashboard (`/`)
- Grid: `grid-template-columns: 1fr 1fr 1fr 340px`
- Row 1: 3 metric cards (Total Burn Rate, Today's Spend, Lifetime Saved) + Kill Panel (spans all rows)
- Row 2: Spend chart (spans 3 cols)
- Row 3: Platform mini-cards grid + Activity feed

### Platforms (`/platforms`)
- Header: title + "Connect Platform" button
- Full cards grid: `repeat(auto-fill, minmax(340px,1fr))`
- Each card: platform icon + name + state badge + burn rate + distance gauge + action buttons (Kill / Restore / Test / Config)
- Empty state: orbital animation + "Connect First Platform" CTA

### Incidents (`/incidents`)
- Header: title + "Export CSV" button
- Stats row: 4 cards (Total Saved / Total Incidents / Avg Response / This Month)
- Filter pills: All / Active / Resolved / per-platform
- Table: Time | Platform | Trigger | Burn Rate | Duration | Saved | Status | View button
- Empty state: "No incidents. Circuit breakers armed and monitoring."

### Thresholds (`/thresholds`)
- Global Settings card (toggle switches: Auto Kill, Slack, Email, Auto Restore, Anomaly Detection, Weekly Reports)
- Per-platform cards: hourly slider + daily/monthly inputs + per-platform toggles + alert channels + Save/Reset buttons

---

## 13. AUTHENTICATION FLOW

```
1. User visits /signup
2. Supabase Auth: email + password (or magic link)
3. Email verification → redirect to /onboarding
4. Onboarding wizard (3 steps):
   Step 1: Connect first platform (wizard modal)
   Step 2: Set threshold
   Step 3: Connect Slack (optional)
5. Dashboard unlocks → 14-day free trial starts
6. Trial expires → Stripe checkout → Starter plan
```

### Middleware

```typescript
// src/middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  const isDashboard = req.nextUrl.pathname.startsWith('/') && !req.nextUrl.pathname.startsWith('/login');
  if (!session && isDashboard) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|signup|verify).*)'],
};
```

---

## 14. STRIPE PRICING

```typescript
// Plans
const PLANS = {
  STARTER: {
    priceId: process.env.STRIPE_PRICE_STARTER,
    price: 49,
    platforms: 3,       // OpenAI + AWS + Vercel
    pollInterval: 60,   // seconds
  },
  PRO: {
    priceId: process.env.STRIPE_PRICE_PRO,
    price: 149,
    platforms: 15,      // All Tier 1 + 2
    pollInterval: 30,
  },
  TEAM: {
    priceId: process.env.STRIPE_PRICE_TEAM,
    price: 299,
    platforms: 23,      // All platforms
    pollInterval: 15,
  },
};
```

---

## 15. TESTING SETUP

### Unit Tests

```typescript
// tests/unit/burn-rate.test.ts
import { describe, it, expect } from 'vitest';
import { SlidingWindowBurnRate } from '@/modules/circuit-breaker/burn-rate';

describe('SlidingWindowBurnRate', () => {
  it('returns 0 with < 2 readings', () => {
    const calc = new SlidingWindowBurnRate();
    calc.push(10, Date.now());
    expect(calc.getBurnRatePerHour()).toBe(0);
  });

  it('calculates correct burn rate', () => {
    const calc = new SlidingWindowBurnRate();
    const base = Date.now();
    calc.push(0, base);
    calc.push(10, base + 3_600_000); // $10 in 1 hour
    expect(calc.getBurnRatePerHour()).toBeCloseTo(10, 0);
  });

  it('handles circular buffer overflow', () => {
    const calc = new SlidingWindowBurnRate();
    for (let i = 0; i < 70; i++) {  // push 70 items into 60-slot buffer
      calc.push(i, Date.now() + i * 60000);
    }
    expect(calc.getBurnRatePerHour()).toBeGreaterThan(0);
  });
});
```

### E2E Kill Switch Test

```typescript
// tests/e2e/kill-switch.spec.ts
import { test, expect } from '@playwright/test';

test('kill switch fires when threshold breached', async ({ page }) => {
  // Uses TEST environment (see .env.test)
  await page.goto('/');
  await page.fill('[data-testid="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('[data-testid="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('[data-testid="login-btn"]');

  // Simulate a breach via test API
  await page.request.post('/api/test/simulate-breach', {
    data: { platformId: process.env.TEST_PLATFORM_ID, burnRate: 500 }
  });

  // Wait for kill switch UI to appear
  await expect(page.locator('[data-testid="kill-btn"]')).toHaveClass(/kill-btn-armed/, { timeout: 5000 });
  await expect(page.locator('[data-testid="system-status"]')).toContainText('BREACH');
});
```

---

## 16. DEVELOPMENT ORDER (Week by Week)

```
Week 1-2: Foundation
  ✓ Next.js + Supabase + Prisma setup
  ✓ Auth flow (login/signup/verify)
  ✓ Stripe integration
  ✓ Credential vault (crypto.ts)
  ✓ Dashboard shell + sidebar layout

Week 3: Monitoring Engine
  ✓ QStash cron setup → /api/cron/poll
  ✓ OpenAI + AWS + Vercel adapters
  ✓ Sliding window burn rate calculator
  ✓ Redis caching layer
  ✓ Dashboard real-time display

Week 4: Kill Switches
  ✓ Kill switch executor (parallel)
  ✓ Circuit breaker FSM
  ✓ Z-score anomaly detection
  ✓ Restore flow + HALF_OPEN monitoring
  ✓ Incident logging

Week 5: Alerts + Full UI
  ✓ Slack webhook alerts
  ✓ Resend email alerts (React Email templates)
  ✓ All 4 pages complete (Dashboard/Platforms/Incidents/Thresholds)
  ✓ Connect Platform wizard
  ✓ Distance-to-threshold gauge

Week 6: Testing + Launch
  ✓ Vitest unit tests (all algorithms)
  ✓ Playwright E2E (kill switch flow)
  ✓ Sentry + PostHog setup
  ✓ Vercel Pro deploy
  ✓ Product Hunt launch prep
```

---

## 17. CURSOR-SPECIFIC INSTRUCTIONS

When using this blueprint in Cursor:

1. **Start here:** `npx create-next-app@latest costguard --typescript --tailwind --app`
2. **Install deps first:** `npm install @supabase/supabase-js @supabase/auth-helpers-nextjs prisma @prisma/client @upstash/redis @upstash/qstash stripe resend @aws-sdk/client-iam @aws-sdk/client-cost-explorer zod react-hook-form @hookform/resolvers recharts framer-motion lucide-react`
3. **Setup shadcn:** `npx shadcn-ui@latest init`
4. **Ask Cursor to implement one module at a time** — don't ask for the whole app at once
5. **Order:** crypto.ts → db.ts → schema.prisma → adapters → circuit-breaker → polling engine → kill switch → API routes → UI components
6. **Reference the UI HTML prototype** (costguard-app.html) for exact visual design — copy CSS variables and component structure
7. **Never store decrypted credentials** — always pass `encrypt()` output to DB

### Cursor Prompt Template

```
I'm building CostGuard, an AI cost monitoring SaaS.
Tech stack: Next.js 14 + TypeScript + Supabase + Prisma + Upstash Redis + QStash.
Reference: CURSOR_BLUEPRINT.md for full spec.

Please implement [MODULE_NAME] as specified in section [N] of the blueprint.
Follow the exact interfaces and algorithms defined. Keep files small and single-responsibility.
```

---

## 18. QUICK REFERENCE

| Thing | Value |
|---|---|
| MVP cost | $73 one-time + $45/mo |
| Break-even | 1 customer |
| Month 12 profit | $40,000/mo |
| Gross margin | 96% at scale |
| Test cost per suite | ~$0.80 |
| Kill latency target | < 60 seconds |
| Polling interval | 60s (Starter), 30s (Pro), 15s (Team) |
| Anomaly threshold | Z-score > 3.0 (99.7% confidence) |
| Half-open window | 15 minutes |
| Redis key TTL | 2 hours (windows), 5 min (latest) |
| DB retention | 90 days SpendReadings, indefinite Incidents |
