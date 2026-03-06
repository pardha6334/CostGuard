// src/lib/redis.ts
// CostGuard — Upstash Redis client singleton (lazy-initialized to avoid build-time URL validation)

import { Redis } from '@upstash/redis'

let _redis: Redis | null = null

function getInstance(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return _redis
}

// Proxy defers construction until first method call — safe at import time
export const redis = new Proxy({} as Redis, {
  get(_target, prop: string | symbol) {
    return Reflect.get(getInstance(), prop)
  },
})
