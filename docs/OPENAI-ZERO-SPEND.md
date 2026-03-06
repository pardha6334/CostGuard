# Why amount and burnRate show 0 (OpenAI)

If the **SpendReading** table or the dashboard shows **amount** and **burnRate** as **0** for an OpenAI platform, check the following.

## 1. Correct credentials

- **Admin API Key** must be an **organization-level** key (starts with `sk-admin-...`), not a project-level key.  
  Create it in: [OpenAI API keys](https://platform.openai.com/api-keys) → Organization / Billing scope.
- **Project ID** must be the exact project ID (e.g. `proj_...`) from the OpenAI project you want to monitor.  
  Find it in the project’s URL or in the dashboard.

If the key or project is wrong, the costs API may return no data and we store 0.

## 2. Cost data from OpenAI

We call `GET /v1/organization/costs` with `project_ids=<your project>`, `group_by=project_id`, and sum `results[].amount.value` from the response. The `group_by=project_id` parameter is required for the API to return cost amounts per project; without it the API may return empty `results`.

- **No usage in range:** If the project has no usage in the current month, the API returns empty buckets and we get 0.
- **Delayed reporting:** Cost/usage can appear in the API with a short delay (e.g. a few minutes). Try again after some usage.
- **Billing/costs not enabled:** Ensure the organization has billing set up and that the project is the one you’re actually using (same project ID as in your app).

## 3. Where the 0 is written

- **On Vercel:** We do **not** write to **SpendReading** (to avoid DB pool exhaustion). So new rows with 0 in production are not created by the cron. Any rows you see in the table are from an earlier run or from a non-Vercel environment.
- **Locally / self-hosted:** We do write to **SpendReading**. If `getSpend()` returns 0 (wrong key, wrong project, or no cost data), we store amount and burnRate as 0. The dashboard still reads **lastPolledAt** and latest spend from **Redis** when available; if Redis has 0, that’s because the adapter returned 0.

## 4. Quick checks

1. In OpenAI dashboard, confirm the **project** has usage and that you’re using the **same project ID** in CostGuard.
2. Use an **organization admin** key (`sk-admin-...`); project-only keys cannot read organization costs.
3. After fixing credentials, trigger a poll (wait for the next cron or call the cron endpoint with `x-cron-secret`) and check again; cost can take a few minutes to show up.
