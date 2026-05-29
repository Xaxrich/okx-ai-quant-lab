$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $repoRoot ".env"

if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $parts = $line -split "=", 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

if (-not $env:NO_ARKHAM_MODE) { $env:NO_ARKHAM_MODE = "true" }
if (-not $env:FEISHU_ENABLED) { $env:FEISHU_ENABLED = "true" }

Set-Location $repoRoot
npm run intelligence:lab:ai-analysis
