# Test $1 recharge → trip and kill (real-time)

Use **one real platform** (e.g. OpenAI) with **$1 hourly limit** and **$1 daily budget**. When usage pushes burn rate over the limit, the circuit trips and the kill switch fires.

---

## 1. Configure the platform for $1 limits

### Option A: New connection (recommended)

1. Open **CostGuard** (production or local) → **Platforms** → **+ CONNECT PLATFORM**.
2. Choose **OpenAI** (or another provider you have an API key for).
3. Enter your **API key** and any required fields (e.g. org ID if needed).
4. In **Step 3 (Thresholds)** set:
   - **Hourly Limit ($):** `1`
   - **Daily Budget ($):** `1`
5. Leave **Auto-kill** on (default).
6. Complete the flow and connect.

### Option B: Existing platform

1. Go to **Thresholds**.
2. Select the platform you want to test.
3. Set **Hourly limit** to `1` and **Daily budget** to `1`.
4. Save. Ensure **Auto-kill** is enabled for that platform.

---

## 2. Ensure polling is running (production)

The circuit only evaluates when the **poll cycle** runs and sees new spend.

- **Production:** In **Upstash QStash** create a schedule that **POST**s to:
  `https://<your-vercel-url>/api/cron/poll`
  e.g. every **1 minute** (`* * * * *`).  
  Use the same QStash signing keys you set in Vercel env.
- **Local:** Use the dev toolbar **Run Poll Cycle + Reload** (or call the cron route with `x-cron-secret`).

Without polling, spend never updates and the breaker never trips.

---

## 3. Add $1 and generate usage

1. In your **OpenAI** (or chosen provider) account, add **$1** credit.
2. Generate usage that crosses that $1 (e.g. run API calls until you’ve used about $1).
3. As you do that, CostGuard’s poll will periodically fetch spend and update the **burn rate** (recent spend per hour).

**When the trip happens**

- The circuit compares **burn rate** to **hourly limit**.
- Kill runs when: **burn rate > hourly limit** and (**anomaly** or **burn rate > 1.5 × limit**) and **auto-kill** is on.
- With **$1/hr** limit, a burn rate above **$1.50/hr** always qualifies; between $1 and $1.50/hr the anomaly detector can still trigger the kill.

So: recharge $1, use it (e.g. within 30–60 minutes). Once the reported burn rate exceeds the limit (and the condition above is met), the circuit opens and the kill runs.

---

## 4. Where to observe (distance to empty and trip)

### Dashboard (real time)

- **Distance gauge (per platform)**  
  Shows **burn rate vs hourly limit** and “$X/hr left” (or BREACHED/KILLED).  
  As usage grows, the fill moves right; when it crosses the limit you’ll see **BREACHED** and then **KILLED** after the kill runs.

- **Kill panel**  
  Lists platforms by risk; when a platform is killed it appears there with **OPEN** and a **RESTORE** action.

- **Platform cards**  
  Status changes from **SAFE** to **OPEN** (killed) and “Not polled yet” is replaced by live burn/spend once polling has run.

### After the trip

- **Incidents**  
  **Incidents** page shows the new incident: trigger type (e.g. HOURLY_LIMIT or SPIKE_DETECTED), burn rate at kill, threshold ($1), estimated saved.
- **Alerts**  
  If email/Slack is configured, you’ll get the kill alert.

---

## 5. Quick checklist

| Step | Action |
|------|--------|
| 1 | Connect one platform (e.g. OpenAI) with **Hourly limit = 1**, **Daily budget = 1**, **Auto-kill = on**. |
| 2 | In production, set **QStash** to POST to `/api/cron/poll` every minute. |
| 3 | Add **$1** to the provider account and use the API until you’ve used about $1. |
| 4 | Watch **Dashboard**: distance gauge “$X/hr left” → BREACHED → KILLED; Kill panel and platform cards update. |
| 5 | Confirm **Incidents** and (if configured) email/Slack for the kill. |

---

## 6. Restore after test

- In the dashboard **Kill panel**, use **RESTORE** for that platform to move the circuit to **HALF_OPEN**; after the 15‑minute stable window it goes back to **CLOSED**.
- Or use the platform card **RESTORE** if shown there.
