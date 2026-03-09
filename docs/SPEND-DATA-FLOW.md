# Where spend and burn rate come from (UI vs SpendReading table)

## How the UI gets spend and burn rate

The dashboard **does not read from the SpendReading table** for the live numbers.

- **Source:** `GET /api/platforms` enriches each platform from **Redis** key `spend:{platformId}:latest`, which holds `{ amount, burnRate, ts }`.
- **Updated:** Every time the cron runs (`/api/cron/poll`), the polling engine writes the latest `amount` and `burnRate` to Redis. The UI (and SWR refresh) then shows that data.
- So the values you see for **spend** and **burn rate** on the UI come from **Redis**, not from the SpendReading table.

## When is SpendReading inserted?

- **On Vercel (production):** We **do not** insert into SpendReading. We skip it to avoid exhausting the Supabase connection pool (many platforms × 2 writes per poll).
- **Locally (or self-hosted when `VERCEL` is not set):** We insert one row per platform per poll: `platformId`, `amount`, `burnRate`, `recordedAt`.

So the **last time** you see in the SpendReading table (e.g. `2026-03-06 11:37:07.527`) is from a **local** (or non-Vercel) run, not from production. In production the table is not updated by the cron.

## Rounding

- **Storage (Redis and SpendReading):** We store **raw** numbers — no `Math.round` or `toFixed` when writing. Prisma stores `amount` and `burnRate` as Float.
- **Display (UI only):** We use `.toFixed(2)` for currency (e.g. `$${burnRate.toFixed(2)}/hr`, `$${spendToday.toFixed(2)}`). So rounding is display-only, not in stored data.

## Summary

| What                | Source        | When updated                          |
|---------------------|---------------|----------------------------------------|
| UI spend / burn rate| **Redis**     | Every cron poll (e.g. every 60s)      |
| SpendReading table  | DB            | Only when **not** on Vercel (e.g. local) |

If you need SpendReading to be filled in production too, we’d need a different strategy (e.g. one batched DB write per poll cycle instead of one write per platform) to avoid connection limits.
