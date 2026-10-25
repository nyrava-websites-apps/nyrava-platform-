Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NYRAVA UNIFIED REALTOR CRM + LEAD ENGINE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`nStarting Realtor CRM on http://localhost:5180..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\crm-app'; dotnet run --urls http://localhost:5180`"" -WindowStyle Normal

Start-Sleep -Seconds 4

Write-Host "Starting Lead Engine on http://localhost:5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\lead-engine'; npm run dev`"" -WindowStyle Normal

Start-Sleep -Seconds 4

Write-Host "Starting Lead Collector & Bridge Pipeline..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root'; node run.mjs`"" -WindowStyle Normal

Start-Sleep -Seconds 2

Start-Process "http://localhost:5180"
Start-Process "http://localhost:5173"

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " All services started!" -ForegroundColor Green
Write-Host " CRM:           http://localhost:5180" -ForegroundColor Green
Write-Host " Lead Engine:   http://localhost:5173" -ForegroundColor Green
Write-Host " Auto Pipeline: Active (routing leads by ZIP code)" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green
