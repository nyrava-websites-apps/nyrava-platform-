@echo off
title Nyrava Unified Platform - Local Runner
echo ========================================================
echo   Starting Nyrava Platform Services (Local Environment)
echo ========================================================

echo Starting 1. Nyrava CRM (Port 5180)...
start "Nyrava CRM (5180)" cmd /c "cd services\crm-lead-engine\crm-app && dotnet run --urls http://localhost:5180"

timeout /t 3 /nobreak > nul

echo Starting 2. Nyrava Home Evaluation Engine (Port 5190)...
start "Nyrava Home Evaluation (5190)" cmd /c "cd services\home-evaluation && npm install && node server.mjs"

timeout /t 2 /nobreak > nul

echo Starting 3. Nyrava Meet & Video Consultation (Port 5000)...
start "Nyrava Meet (5000)" cmd /c "cd services\meet-consultation && npm install && node server.mjs"

timeout /t 2 /nobreak > nul

echo Starting 4. Nyrava Web Portal Gateway (Port 3000)...
start "Nyrava Web Portal (3000)" cmd /c "cd services\web-portal && npm install && node server.mjs"

echo ========================================================
echo All Nyrava services launched!
echo Open http://localhost:3000 in your browser.
echo ========================================================
pause
