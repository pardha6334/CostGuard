# Blocking Fine-tuned Models During Kill (App-level Integration)

CostGuard cannot block ft:* models via OpenAI's API (OpenAI restriction). If your app uses fine-tuned models, add this check so that when CostGuard kills a platform, your app stops sending requests to any ft:* model.

## How it works

When CostGuard kills a platform, it sets a Redis key:

- **Key:** `costguard:kill:{platformId}`
- **Value:** `"1"`
- **TTL:** Until restore (or 30 days)

Your app checks this key before calling any ft:* model. If kill is active → return 503 (or equivalent) instead of calling OpenAI.

When the user restores from the CostGuard dashboard, we clear the key so your app can resume ft:* calls.

## Integration (TypeScript/Node)

```typescript
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const COSTGUARD_PLATFORM_ID = 'your-platform-id-here'

async function isKillActive(): Promise<boolean> {
  try {
    const killed = await redis.get(`costguard:kill:${COSTGUARD_PLATFORM_ID}`)
    return killed === '1'
  } catch {
    return false  // fail open — don't block if Redis unavailable
  }
}

// Before any OpenAI call with ft:* model:
async function callOpenAI(model: string, messages: any[]) {
  if (model.startsWith('ft:')) {
    const killed = await isKillActive()
    if (killed) {
      throw new Error('Service temporarily suspended — cost limit reached')
    }
  }
  // proceed with OpenAI call normally
  return openai.chat.completions.create({ model, messages })
}
```

## Where the key is set and cleared

- **Set:** In CostGuard's executor, when `executeKill()` runs successfully we call  
  `await redis.set(\`costguard:kill:${platform.id}\`, '1')`.
- **Cleared:** In `executeRestore()` we call  
  `await redis.del(\`costguard:kill:${platform.id}\`)`.

Your app only needs to **read** this key; CostGuard manages set/clear.

## Getting your platform ID

Use the same platform ID you see in the CostGuard dashboard for this OpenAI project (e.g. from the platform card or API response). It is a CUID (e.g. `clxx1234abcd...`).

## Caching (optional)

To avoid calling Redis on every request, cache the "kill active" result per platform for 30–60 seconds and refresh in the background or on a timer.
