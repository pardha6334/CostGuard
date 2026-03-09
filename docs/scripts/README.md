# CostGuard — Scripts

## OpenAI: set ALL rate limits to 0/0 (see which accept)

Tries to set `max_requests_per_1_minute` and `max_tokens_per_1_minute` to **0** for every model in the project (paginates GET, then POST per rate limit). Prints OK vs FAIL and the error code for failures (e.g. `rate_limit_not_updatable`, `invalid_rate_limit_type`).

**Requires in `.env.local`:** `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`

**Run from repo root:**

```powershell
.\docs\scripts\openai-set-all-rate-limits-to-zero.ps1
```

---

## OpenAI rate limit (set gpt-4o-mini to 0/0)

**Requires in `.env.local` (repo root):**

```env
OPENAI_ADMIN_KEY=sk-admin-...
OPENAI_PROJECT_ID=proj_...
```

**Run from repo root:**

```powershell
.\docs\scripts\openai-set-rate-limit.ps1
```

Or one-liner (PowerShell, from repo root after adding the vars to `.env.local`):

```powershell
Get-Content .env.local | ForEach-Object { if ($_ -match '^\s*OPENAI_ADMIN_KEY\s*=\s*["]?(.+?)["]?\s*$') { $env:OPENAI_ADMIN_KEY = $matches[1].Trim() }; if ($_ -match '^\s*OPENAI_PROJECT_ID\s*=\s*["]?(.+?)["]?\s*$') { $env:OPENAI_PROJECT_ID = $matches[1].Trim() } }; Invoke-RestMethod -Uri "https://api.openai.com/v1/organization/projects/$($env:OPENAI_PROJECT_ID)/rate_limits/rl-gpt-4o-mini" -Method POST -Headers @{ Authorization = "Bearer $($env:OPENAI_ADMIN_KEY)"; "Content-Type" = "application/json" } -Body '{"max_requests_per_1_minute":0,"max_tokens_per_1_minute":0}'
```
