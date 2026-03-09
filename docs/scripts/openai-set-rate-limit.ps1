# CostGuard — Set OpenAI project rate limit for gpt-4o-mini via API (values from .env.local).
# Requires in .env.local:
#   OPENAI_ADMIN_KEY=sk-admin-...
#   OPENAI_PROJECT_ID=proj_...
# Run from repo root: .\docs\scripts\openai-set-rate-limit.ps1

$envFile = Join-Path $PSScriptRoot "..\..\.env.local"
if (-not (Test-Path $envFile)) { $envFile = Join-Path $PSScriptRoot "..\..\.env" }
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*OPENAI_ADMIN_KEY\s*=\s*["]?(.+?)["]?\s*$') { $env:OPENAI_ADMIN_KEY = $matches[1].Trim() }
    if ($_ -match '^\s*OPENAI_PROJECT_ID\s*=\s*["]?(.+?)["]?\s*$') { $env:OPENAI_PROJECT_ID = $matches[1].Trim() }
  }
}

$adminKey = $env:OPENAI_ADMIN_KEY
$projectId = $env:OPENAI_PROJECT_ID
if (-not $adminKey) { Write-Error "OPENAI_ADMIN_KEY not set. Add OPENAI_ADMIN_KEY=sk-admin-... to .env.local"; exit 1 }
if (-not $projectId) { Write-Error "OPENAI_PROJECT_ID not set. Add OPENAI_PROJECT_ID=proj_... to .env.local"; exit 1 }

$url = "https://api.openai.com/v1/organization/projects/$projectId/rate_limits/rl-gpt-4o-mini"
$body = '{"max_requests_per_1_minute":0,"max_tokens_per_1_minute":0}'

Write-Host "POST $url"
$resp = Invoke-RestMethod -Uri $url -Method POST -Headers @{
  "Authorization" = "Bearer $adminKey"
  "Content-Type"  = "application/json"
} -Body $body

Write-Host "OK:" ($resp | ConvertTo-Json -Compress)
