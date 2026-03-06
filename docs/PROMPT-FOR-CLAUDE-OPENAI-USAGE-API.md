# Prompt for Claude: Get OpenAI Usage/Costs API to Return Data in Postman

Copy the text below and give it to Claude (with access to this repo or the key docs) so they can continue debugging why the OpenAI organization costs/usage API returns empty data.

---

## Context prompt (copy from here)

**Goal:** We need the OpenAI **Usage** or **Costs** API to return spend/usage data in Postman (and eventually in our app, CostGuard). Right now every request returns **200 OK** but **empty `data[].result` or `data[].results`** — no cost amounts and no token usage. The dashboard shows **$0.01** spend for the same org and period, so the data exists in the UI but not via the API.

**What we already did:**

1. **Costs API** – Tried `GET https://api.openai.com/v1/organization/costs` with:
   - `start_time`, `end_time` (March 2026 range, e.g. 1772323200 to 1772769600)
   - `project_ids=proj_ytTJJUTFkNuz9WdX0akyxA9B`
   - `group_by=line_item`, `group_by=project_id` (singly and together)
   - `limit=31`
   - Response: buckets with **`results: []`** (empty) in every bucket. The API returns **`results`** (plural), not `result` (singular); we fixed our code to read both.

2. **Usage API (completions)** – Tried `GET https://api.openai.com/v1/organization/usage/completions` with same time range, `project_ids`, `group_by=project_id`, `limit=31`. Also returns empty result/results (no token counts).

3. **User’s setup (all verified):**
   - **Organization Owner** (People & Permissions).
   - **Admin API key** from **Admin keys** page (name: "CostGuard Admin", Permissions: All, Status: Active). Used in Postman as `Authorization: Bearer <key>`. No 401 — so the key is valid for these endpoints.
   - **Single organization** (Org ID: `org-vLhgtdoIZEYGst5iaqEHpGts`). Project ID: `proj_ytTJJUTFkNuz9WdX0akyxA9B`.
   - **Dashboard** shows Total Spend $0.01, 85 requests, 1.7K tokens for date range Feb 19 – Mar 06, 2026.

4. **Code changes we made (CostGuard app):**
   - OpenAI adapter: parse **`results`** (plural) as well as `result`; added `group_by=project_id` to the costs request.
   - On Vercel we skip optional DB writes in the cron to avoid Supabase connection pool exhaustion; dashboard reads from Redis.

5. **What we did NOT do yet (suggested but user may not have tried):**
   - Use a **wider date range** in Postman so `start_time` matches the dashboard (e.g. Feb 19, 2026) in case the API attributes cost to an earlier bucket.
   - Add header **`OpenAI-Organization: org-vLhgtdoIZEYGst5iaqEHpGts`** to every request.
   - Contact OpenAI support (support@openai.com) with org ID and description of empty API vs dashboard data.

6. **Reference in repo:**  
   - **`docs/OPENAI-POSTMAN-COSTS-AND-USAGE.md`** – Contains: (a) checklist of what to enable/verify (Admin key, Org Owner, etc.), (b) a table of all final Postman URLs with filled-in variables (costs 2a–2g and usage completions), (c) notes on 200 OK but empty data (wider range, org header, contact support).  
   - **`docs/OPENAI-ZERO-SPEND.md`** – Explains why amount/burnRate can be 0 (credentials, API response shape, etc.).

**Ask for Claude:**  
Please use the above context and the docs in this repo to suggest or try the next steps so we can get **non-empty** usage or cost data from the OpenAI API in Postman (e.g. at least token counts from the usage API or `amount.value` from the costs API). If the official API simply does not return data for this account/period, suggest a fallback (e.g. approximate cost from another source or a clear message to show in the app until the API works).

---

## End of prompt
