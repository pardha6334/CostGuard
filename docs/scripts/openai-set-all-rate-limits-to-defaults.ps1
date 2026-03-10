# CostGuard — Set ALL project rate limits to default (non-zero) values.
# Use when current limits are 0 and you want to restore usage (e.g. after a kill).
# Requires in .env.local: OPENAI_ADMIN_KEY, OPENAI_PROJECT_ID
# Run from repo root: .\docs\scripts\openai-set-all-rate-limits-to-defaults.ps1

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
if (-not $adminKey) { Write-Error "OPENAI_ADMIN_KEY not set. Add to .env.local"; exit 1 }
if (-not $projectId) { Write-Error "OPENAI_PROJECT_ID not set. Add to .env.local"; exit 1 }

# Model-aware default body (same shape as kill, but non-zero)
function Get-DefaultBody($model) {
  if ($model -match '^sora|video') {
    return '{"max_requests_per_1_minute":50}'
  }
  if ($model -match 'dall-e|image|chatgpt-image-latest') {
    return '{"max_requests_per_1_minute":50,"max_images_per_1_minute":20}'
  }
  if ($model -match 'tts|whisper|transcribe|audio|speech') {
    return '{"max_requests_per_1_minute":100}'
  }
  # Standard chat/text
  return '{"max_requests_per_1_minute":500,"max_tokens_per_1_minute":150000}'
}

$baseUrl = "https://api.openai.com/v1/organization/projects/$projectId/rate_limits"
$headers = @{
  "Authorization" = "Bearer $adminKey"
  "Content-Type"  = "application/json"
}

# 1) Paginate GET to collect all rate limit entries
$all = @()
$after = $null
$page = 0
do {
  $page++
  $url = $baseUrl + "?limit=100"
  if ($after) { $url += "&after=" + [uri]::EscapeDataString($after) }
  Write-Host "Fetching page $page..."
  try {
    $resp = Invoke-RestMethod -Uri $url -Method GET -Headers $headers
  } catch {
    Write-Error "GET rate_limits failed: $_"
    exit 1
  }
  $all += $resp.data
  $after = $null
  if ($resp.has_more -and $resp.last_id) { $after = $resp.last_id }
} while ($after)

Write-Host "Total rate limits to update: $($all.Count)"
Write-Host ""

# 2) For each entry, POST default body and record result
$ok = @()
$fail = @()
$i = 0
foreach ($rl in $all) {
  $i++
  $id = $rl.id
  $model = $rl.model
  $url = "$baseUrl/$id"
  $body = Get-DefaultBody $model
  try {
    $null = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body
    $ok += [pscustomobject]@{ model = $model; id = $id }
    Write-Host "[$i/$($all.Count)] OK  $model"
  } catch {
    $errBody = $_.ErrorDetails.Message
    $code = ""
    if ($errBody) {
      try {
        $j = $errBody | ConvertFrom-Json
        $code = $j.error.code
      } catch { $code = $errBody.Substring(0, [Math]::Min(60, $errBody.Length)) }
    }
    $fail += [pscustomobject]@{ model = $model; id = $id; code = $code }
    Write-Host "[$i/$($all.Count)] FAIL $model  -> $code"
  }
  Start-Sleep -Milliseconds 150
}

Write-Host ""
Write-Host "=== Summary ==="
Write-Host "Set to defaults OK: $($ok.Count)"
Write-Host "Failed/skipped:     $($fail.Count)"
if ($fail.Count -gt 0) {
  Write-Host ""
  Write-Host "Failed models (model / error code):"
  $fail | ForEach-Object { Write-Host "  $($_.model)  -> $($_.code)" }
}
