# CostGuard — Set project rate limits per model type (validated limits; skips ft:* and *-shared).
# Run from repo root: .\docs\scripts\openai-set-rate-limits-smart.ps1
# Or: when asked, agent runs this same script.

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot "..\..\.env.local"
if (-not (Test-Path $envFile)) { $envFile = Join-Path $PSScriptRoot "..\..\.env" }
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*OPENAI_ADMIN_KEY\s*=\s*["]?(.+?)["]?\s*$') { $env:OPENAI_ADMIN_KEY = $matches[1].Trim() }
    if ($_ -match '^\s*OPENAI_PROJECT_ID\s*=\s*["]?(.+?)["]?\s*$') { $env:OPENAI_PROJECT_ID = $matches[1].Trim() }
  }
}

$k = $env:OPENAI_ADMIN_KEY
$p = $env:OPENAI_PROJECT_ID
if (-not $k -or -not $p) { Write-Error "Set OPENAI_ADMIN_KEY and OPENAI_PROJECT_ID in .env.local"; exit 1 }

$base = "https://api.openai.com/v1/organization/projects/$p/rate_limits"
$h = @{ "Authorization" = "Bearer $k"; "Content-Type" = "application/json" }

# Paginate GET all rate limits
$all = @()
$after = $null
do {
  $url = $base + "?limit=100"
  if ($after) { $url += "&after=" + [uri]::EscapeDataString($after) }
  $r = Invoke-RestMethod -Uri $url -Method GET -Headers $h
  $all += $r.data
  $after = if ($r.has_more -and $r.last_id) { $r.last_id } else { $null }
} while ($after)

# Skip ft:* and *-shared (CostGuard design)
$restoreable = $all | Where-Object {
  $_.model -notmatch '^ft:' -and
  $_.model -notmatch '-shared$' -and
  $_.model -notmatch '-alpha-shared$'
}

# Model-aware body (validated limits: Tier-1 safe; long-context/search need lower)
function Get-Body($model) {
  if ($model -match '^sora|video') {
    return '{"max_requests_per_1_minute":10}'
  }
  if ($model -match 'dall-e|image|chatgpt-image') {
    return '{"max_requests_per_1_minute":10,"max_images_per_1_minute":5}'
  }
  if ($model -match 'tts|whisper|transcribe|audio|speech') {
    return '{"max_requests_per_1_minute":100}'
  }
  # Long-context and search: org cap is strict — use 50 RPM, 5k TPM
  if ($model -match 'long-context|search-api|search-preview') {
    return '{"max_requests_per_1_minute":50,"max_tokens_per_1_minute":5000}'
  }
  # Default chat: Tier-1 safe (500 RPM, 30k TPM)
  return '{"max_requests_per_1_minute":500,"max_tokens_per_1_minute":30000}'
}

Write-Host "Setting rate limits for $($restoreable.Count) models (ft:* and *-shared skipped)..."
$ok = 0
$fail = 0
$failList = @()

foreach ($rl in $restoreable) {
  $body = Get-Body $rl.model
  try {
    Invoke-RestMethod -Uri "$base/$($rl.id)" -Method POST -Headers $h -Body $body | Out-Null
    $ok++
    Write-Host "OK  $($rl.model)"
  } catch {
    $errBody = $_.ErrorDetails.Message
    $code = ''
    if ($errBody) {
      try {
        $j = $errBody | ConvertFrom-Json
        $code = $j.error.code
      } catch {
        $code = $errBody.Substring(0, [Math]::Min(80, $errBody.Length))
      }
    }
    $fail++
    $failList += [pscustomobject]@{ model = $rl.model; code = $code }
    Write-Host "FAIL $($rl.model)  -> $code"
  }
  Start-Sleep -Milliseconds 150
}

Write-Host ""
Write-Host "Done. OK: $ok  Fail: $fail  Skipped: $($all.Count - $restoreable.Count)"
if ($failList.Count -gt 0) {
  Write-Host ""
  Write-Host "=== Failures by error code ==="
  $failList | Group-Object code | Sort-Object Count -Descending | ForEach-Object {
    Write-Host "  $($_.Count) x $($_.Name)"
    $_.Group | Select-Object -First 5 | ForEach-Object { Write-Host "      $($_.model)" }
    if ($_.Group.Count -gt 5) { Write-Host "      ... and $($_.Group.Count - 5) more" }
    Write-Host ""
  }
}
