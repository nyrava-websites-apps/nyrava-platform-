@echo off
title Nyrava CRM + Lead Generator System
color 0A
cls

echo.
echo  ============================================================
echo    NYRAVA CRM + LEAD GENERATOR UNIFIED SUITE
echo  ============================================================
echo.

set ROOT=%~dp0

:: 1. Start Realtor CRM on http://localhost:5180
echo  [1/3] Starting Realtor CRM on http://localhost:5180 ...
start /B "" cmd /c "cd /d %ROOT%crm-app && dotnet run --urls http://localhost:5180 > "%ROOT%crm.log" 2>&1"

:: 2. Start Lead Engine on http://localhost:5173
echo  [2/3] Starting Lead Engine on http://localhost:5173 ...
start /B "" cmd /c "cd /d %ROOT%lead-engine && npm run dev > "%ROOT%lead-engine.log" 2>&1"

:: Wait for services to boot
echo  Waiting for services to initialize (8 seconds)...
timeout /t 8 /nobreak > nul

:: 3. Open browser for both tools
start "" "http://localhost:5180"
start "" "http://localhost:5173"

echo.
echo  Browser opened to:
echo    - CRM Workspace: http://localhost:5180
echo    - Lead Generator: http://localhost:5173
echo.
echo  ============================================================
echo    [3/3] FSBO Collector + Pipeline is active (syncs every 5m)
echo    Leads are routed by ZIP code to subscribed realtors.
echo    If no subscriber exists, leads are banked for review.
echo    Keep this window open to keep the pipeline running.
echo  ============================================================
echo.

:: Run lead collector in foreground
cd /d %ROOT%
node run.mjs

pause
