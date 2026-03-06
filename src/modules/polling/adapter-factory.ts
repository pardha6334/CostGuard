// src/modules/polling/adapter-factory.ts
// CostGuard — Maps provider string to concrete PlatformAdapter instance

import { OpenAIAdapter } from '@/modules/adapters/openai.adapter';
import { AnthropicAdapter } from '@/modules/adapters/anthropic.adapter';
import { AWSAdapter } from '@/modules/adapters/aws.adapter';
import { VercelAdapter } from '@/modules/adapters/vercel.adapter';
import { SupabaseAdapter } from '@/modules/adapters/supabase.adapter';
import type { PlatformAdapter } from '@/modules/adapters/base.adapter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
