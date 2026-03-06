// src/lib/backoff.ts
// CostGuard — Exponential backoff with jitter and retry helper

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
