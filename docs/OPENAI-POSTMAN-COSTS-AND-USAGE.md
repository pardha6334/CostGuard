# OpenAI: Get spend / cost in Postman (no code changes)

Use these requests in Postman to see which combination returns data. **Do not change app code until one of these returns the expected spend.**

Base: **`https://api.openai.com/v1`**  
Auth: **Header `Authorization: Bearer YOUR_ADMIN_KEY`** (must be `sk-admin-...`).

Your project ID from the screenshot: **`proj_ytTJJUTFkNuz9WdX0akyxA9B`**.

**Auth (all requests):** Header `Authorization: Bearer YOUR_ADMIN_KEY` (replace with your `sk-admin-...` key).

---

## Quick reference – all final URLs (copy into Postman)

| # | Scenario | Goal | Full URL |
|---|----------|------|----------|
| **2a** | Costs – minimal | Org-level, no filter | `https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31` |
| **2b** | Costs – group_by line_item | Doc example cost breakdown | `https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=line_item` |
| **2c** | Costs – line_item + project | Your project only | `https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=line_item&project_ids=proj_ytTJJUTFkNuz9WdX0akyxA9B` |
| **2d** | Costs – group_by project_id | Cost per project | `https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=project_id` |
| **2e** | Costs – both group_by | line_item + project_id | `https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=line_item&group_by=project_id` |
| **2f** | Costs – project + both group_by | Your project, both groupings | `https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&project_ids=proj_ytTJJUTFkNuz9WdX0akyxA9B&group_by=line_item&group_by=project_id` |
| **2g** | Costs – with org header | Same as 2a or 2b; add header | Use **2a** or **2b** URL + header `OpenAI-Organization: YOUR_ORG_ID` |
| **3** | Usage – completions | Token usage (not $), verify key/project | `https://api.openai.com/v1/organization/usage/completions?start_time=1772323200&end_time=1772769600&project_ids=proj_ytTJJUTFkNuz9WdX0akyxA9B&group_by=project_id&limit=31` |

**Timestamps used:** `start_time=1772323200` (Mar 1, 2026 00:00 UTC), `end_time=1772769600` (Mar 6, 2026 12:00 UTC). For “now”, replace `end_time` with `Math.floor(Date.now()/1000)` from the browser console.

---

## What to enable / verify (if you get no or empty response)

The Usage and Costs APIs only work when the following are true. Go through this checklist:

| # | Check | What to do |
|---|--------|------------|
| 1 | **You are an Organization Owner** | Only **Organization Owners** can create Admin API keys and access usage/costs. If you’re a project member only, the APIs will not return data. Check: [Organization settings](https://platform.openai.com/settings/organization/general) → Members → your role. |
| 2 | **Use an Admin API key (not a project key)** | The key must be an **Admin API key** created from the **Admin keys** page, not a normal project API key. Create it: open [Admin keys](https://platform.openai.com/organization/admin-keys) (or **Settings → Organization → Admin keys**), click **Create new admin key**, copy the key once (it starts with `sk-admin-...` and is shown only once). Use this key in Postman as `Authorization: Bearer <that_key>`. |
| 3 | **Correct dashboard** | Usage/cost in the UI: use [Usage](https://platform.openai.com/usage) or [Organization usage](https://platform.openai.com/settings/organization/usage). Some users see $ only at the second link. |
| 4 | **Optional: OpenAI-Organization header** | If the account has **multiple organizations**, add header **`OpenAI-Organization: YOUR_ORG_ID`**. Org ID: [Organization settings → General](https://platform.openai.com/settings/organization/general). Then retry the same URLs. |
| 5 | **API key usage tracking (for the keys that generate usage)** | The keys you use to call the API (e.g. in your app) should have usage tracking on. Keys created after Dec 20, 2023 usually do by default. Older keys: in the dashboard, check the key’s settings and enable usage tracking if available. |
| 6 | **Billing / credits** | You already see $0.01 in the dashboard, so billing is active. If the API still returns empty, it’s almost always (1) not an Admin key or (2) not an Organization Owner. |

**Most common cause of “no response” or empty data:** using a **project API key** instead of an **Admin API key** from [Admin keys](https://platform.openai.com/organization/admin-keys). Create a new key there and use it in Postman.

**If you get 200 OK but empty `data[].result` / `data[].results`:** Auth is fine (wrong key would return 401). The API accepts your Admin key but returns no cost rows. Try: (1) **Wider date range** — e.g. if the dashboard shows "Feb 19 – Mar 06", set `start_time` to the first day of that range (Feb 19, 2026 → use [epochconverter.com](https://www.epochconverter.com/) for Unix seconds). (2) **Add header** — set **`OpenAI-Organization: org-vLhgtdoIZEYGst5iaqEHpGts`** and retry. (3) **Contact OpenAI** — if the dashboard shows spend but the API always returns empty, it can be delay or account-specific; ask [support@openai.com](mailto:support@openai.com).

---

## 1. Timestamps (use these in all URLs below)

- **Start of current month (UTC):** e.g. March 2026 → **`1772323200`** (March 1, 2026 00:00:00 UTC).  
  For another month: [epochconverter.com](https://www.epochconverter.com/) → e.g. “2026-03-01 00:00:00 UTC”.
- **End = now (UTC):** use **current** Unix seconds, e.g. in browser console: **`Math.floor(Date.now()/1000)`**, or e.g. March 6, 2026 12:00 UTC → `1772769600`.

In the URLs below, **start_time** is set to March 2026 (`1772323200`). For **end_time** use your current time: run `Math.floor(Date.now()/1000)` in the browser console and paste the result, or use e.g. `1772769600` for March 6, 2026 noon UTC. Replace if your “today” is different.

---

## 2. Costs API – variants to try (in this order)

Try each URL; check whether `data[].result` or `data[].results` has any items with `amount.value`.

### 2a) Minimal (org-level, no project filter)

**Goal:** See if the costs endpoint returns any cost at all.

```
GET https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31
```

- No `project_ids`, no `group_by`.
- If this returns empty `result`/`results` in every bucket, the problem may be delay or account, not project.

---

### 2b) With `group_by=line_item` only (doc example uses this)

**Goal:** Costs API doc example shows `CostsResult` with `line_item` (e.g. "Image models").

```
GET https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=line_item
```

- Still no `project_ids`.
- Check buckets for `result` or `results` and objects with `object: "organization.costs.result"` and `amount.value`.

---

### 2c) With `group_by=line_item` and `project_ids`

**Goal:** Restrict to your project.

```
GET https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=line_item&project_ids=proj_ytTJJUTFkNuz9WdX0akyxA9B
```

- If 2b had data but 2c is empty, the project filter might be the cause (e.g. wrong id or no cost attributed to that project yet).

---

### 2d) With `group_by=project_id` only

**Goal:** Some docs say cost breakdown per project uses `group_by=project_id`.

```
GET https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=project_id
```

- No `project_ids` filter.
- Check for `result`/`results` and `amount.value` per project.

---

### 2e) With both `group_by` (array style: two params)

**Goal:** OpenAPI allows array; some clients send multiple `group_by` values.

```
GET https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&group_by=line_item&group_by=project_id
```

- Same as above but both groupings.

---

### 2f) With `project_ids` + `group_by=line_item` and `group_by=project_id`

**Goal:** Filter to your project and ask for both groupings.

```
GET https://api.openai.com/v1/organization/costs?start_time=1772323200&end_time=1772769600&limit=31&project_ids=proj_ytTJJUTFkNuz9WdX0akyxA9B&group_by=line_item&group_by=project_id
```

---

### 2g) Optional: `OpenAI-Organization` header

If your account has multiple orgs, set:

- **Key:** `OpenAI-Organization`  
- **Value:** your org ID from [Organization settings](https://platform.openai.com/settings/organization/general)

Then retry 2a and 2b. Some users need this for org-level endpoints.

---

## 3. Usage API (completions) – token usage, not dollars

**Goal:** Confirm the key and project are valid and that usage exists. This returns **tokens**, not dollar amount. If this returns data but costs always returns empty, the issue is specific to the costs endpoint (e.g. delay or grouping).

```
GET https://api.openai.com/v1/organization/usage/completions?start_time=1772323200&end_time=1772769600&project_ids=proj_ytTJJUTFkNuz9WdX0akyxA9B&group_by=project_id&limit=31
```

- Look for `data[].result` or `data[].results` with `input_tokens`, `output_tokens`, `num_model_requests`.
- If you see non-zero tokens here, key and project are correct; cost can then be approximated (tokens × price) or we wait for costs API to populate.

---

## 4. What to check in each response

- **Costs API:**  
  - Does the response have `data` as an array?  
  - Does each bucket have **`result`** or **`results`**?  
  - Is there any element with `"object": "organization.costs.result"` and **`amount.value`** (e.g. 0.01)?
- **Usage API:**  
  - Any bucket with non-zero `input_tokens` or `output_tokens`?

---

## 5. Notes from docs and community

- Official schema (mintlify) uses **`result`** (singular) on the bucket; your real response had **`results`** (plural). Check both in the JSON.
- Costs can lag: dashboard may show $0.01 before the costs API has it; try again after some time or the next day.
- Dashboard vs API: some users see cost at [platform.openai.com/settings/organization/usage](https://platform.openai.com/settings/organization/usage) while the main usage page or API shows zero.
- 404 on `/v1/organization/costs` has been reported before; it was fixed by OpenAI. If you get 404, try again later or add `OpenAI-Organization` if you have multiple orgs.

Once one of the **costs** URLs returns `amount.value` in Postman, we can align the app with that exact URL and parameters (no code changes until then).
