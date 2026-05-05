Unregister-ScheduledTask -TaskName "LAB_AIAnalysis" -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute "E:\quant\okx-ai-quant-lab\scripts\run_ai_analysis.bat" -WorkingDirectory "E:\quant\okx-ai-quant-lab"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 365)
Register-ScheduledTask -TaskName "LAB_AIAnalysis" -Action $action -Trigger $trigger -Description "LAB AI analysis + Feishu push" -Force
Write-Host "Updated LAB_AIAnalysis"
Get-ScheduledTask -TaskName "LAB_*" | Format-Table TaskName, State
