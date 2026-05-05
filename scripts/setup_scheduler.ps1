$ErrorActionPreference = "Stop"
$duration = (New-TimeSpan -Days 365)

# Task 1: Fast-watch every 15 min
$action1 = New-ScheduledTaskAction -Execute "npm" -WorkingDirectory "E:\quant\okx-ai-quant-lab" -Argument "run intelligence:lab:fast-watch -- --mode=standard"
$trigger1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration $duration
Register-ScheduledTask -TaskName "LAB_FastWatch" -Action $action1 -Trigger $trigger1 -Description "LAB 15min data collection" -Force -ErrorAction SilentlyContinue
Write-Host "Task 1/2: LAB_FastWatch created"

# Task 2: AI analysis + Feishu every 15 min
$arg2 = "-Command `"`$env:NO_ARKHAM_MODE='true'; `$env:FEISHU_ENABLED='true'; `$env:FEISHU_APP_ID='cli_a973175eca70dbc8'; `$env:FEISHU_APP_SECRET='ksV0EvWoWNJv2LWOCefGgVo4fQ2Kfwie'; `$env:FEISHU_CHAT_ID='oc_8c3aa3bc0fcabecc0038a2ab2ed1d3c5'; `$env:COINGECKO_PRO_API_KEY='CG-Bwrm2zgikzk5gNbpEEZru9jw'; `$env:COINGLASS_API_KEY='2741af669a2e4ff8a161cbeb3bbd038a'; npm run intelligence:lab:ai-analysis`""
$action2 = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory "E:\quant\okx-ai-quant-lab" -Argument $arg2
$trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration $duration
Register-ScheduledTask -TaskName "LAB_AIAnalysis" -Action $action2 -Trigger $trigger2 -Description "LAB AI analysis + Feishu push" -Force -ErrorAction SilentlyContinue
Write-Host "Task 2/2: LAB_AIAnalysis created"

Write-Host ""
Write-Host "Done. Tasks:"
Get-ScheduledTask -TaskName "LAB_*" | Format-Table TaskName, State
