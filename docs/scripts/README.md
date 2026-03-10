# CostGuard — Scripts

## OpenAI: set rate limits per model type (smart / validated)

**Recommended.** Uses validated limits per model type; skips ft:* and *-shared. Same logic the agent runs when you ask to “set limits” or “run the command.”

| Model type | Limits |
|------------|--------|
| Sora / video | 10 req/min |
| Image (DALL·E, chatgpt-image) | 10 req/min, 5 img/min |
| Audio / TTS / whisper / transcribe | 100 req/min |
| Long-context, search-api, search-preview | 50 RPM, 5k TPM |
| Default chat | 500 RPM, 30k TPM |

**Requires in `.env.local`:** `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`

**Run from repo root (PowerShell):**

```powershell
.\docs\scripts\openai-set-rate-limits-smart.ps1
```

---

## OpenAI: set ALL rate limits to defaults (restore from 0)

Use when limits are currently 0 (e.g. after a kill) and you want to restore usage. Sets model-appropriate defaults: chat 500 req/min + 150k TPM, Sora 50 req/min, image 50 req + 20 img/min, audio 100 req/min. Skips ft:* and *-shared will fail with `rate_limit_not_updatable` (expected).

**Requires in `.env.local`:** `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`

**Run from repo root (PowerShell):**

```powershell
.\docs\scripts\openai-set-all-rate-limits-to-defaults.ps1
```

---

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
