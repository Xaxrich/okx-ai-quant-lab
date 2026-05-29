$ErrorActionPreference = "Stop"
$duration = (New-TimeSpan -Days 365)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Task 1: Fast-watch every 15 min
$action1 = New-ScheduledTaskAction -Execute "npm" -WorkingDirectory $repoRoot -Argument "run intelligence:lab:fast-watch -- --mode=standard"
$trigger1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration $duration
Register-ScheduledTask -TaskName "LAB_FastWatch" -Action $action1 -Trigger $trigger1 -Description "LAB 15min data collection" -Force -ErrorAction SilentlyContinue
Write-Host "Task 1/2: LAB_FastWatch created"

# Task 2: AI analysis + Feishu every 15 min
$runner = Join-Path $PSScriptRoot "run_ai_analysis.ps1"
$arg2 = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$action2 = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $repoRoot -Argument $arg2
$trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration $duration
Register-ScheduledTask -TaskName "LAB_AIAnalysis" -Action $action2 -Trigger $trigger2 -Description "LAB AI analysis + Feishu push" -Force -ErrorAction SilentlyContinue
Write-Host "Task 2/2: LAB_AIAnalysis created"

Write-Host ""
Write-Host "Done. Tasks:"
Get-ScheduledTask -TaskName "LAB_*" | Format-Table TaskName, State
