# CostGuard — PowerShell script to generate OpenAI spend for testing burn rate / circuit breaker.
# Run from project root or docs/scripts. Uses 1s delay + Connection: close to avoid rate limit and keep-alive errors.
# Set OPENAI_API_KEY and OPENAI_PROJECT_ID (or use .env.local — never commit real keys).

$apiKey = $env:OPENAI_API_KEY
$projectId = $env:OPENAI_PROJECT_ID
if (-not $apiKey -or -not $projectId) {
  Write-Error "Set OPENAI_API_KEY and OPENAI_PROJECT_ID environment variables before running."
  exit 1
}

$body = @{
  model = "gpt-4o-mini"
  messages = @(
    @{ role = "user"; content = "List 10 best practices for cloud cost monitoring. Be concise." }
  )
  max_tokens = 500
} | ConvertTo-Json

# Connection: close — avoid "connection was closed by the server" after ~15 requests (keep-alive reuse).
# 1s delay — keeps under 50k TPM so we don't hit rate_limit_exceeded.
for ($i = 1; $i -le 75; $i++) {
  Write-Host "Call $i..."
  try {
    Invoke-RestMethod `
      -Uri "https://api.openai.com/v1/chat/completions" `
      -Method POST `
      -Headers @{
        "Authorization"    = "Bearer $apiKey"
        "Content-Type"     = "application/json"
        "OpenAI-Project"   = $projectId
        "Connection"       = "close"
      } `
      -Body $body | Out-Null
  } catch {
    Write-Host "Call $i failed: $_"
    Start-Sleep -Seconds 2
  }
  Start-Sleep -Seconds 1
}
Write-Host "Done. Wait 5–10 min then check Usage dashboard and CostGuard poll."
