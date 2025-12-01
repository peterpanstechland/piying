@echo off
echo ============================================================
echo Shadow Puppet System - Development Mode
echo ============================================================
echo.
echo This script starts all services with HOT-RELOAD for development.
echo Code changes will auto-refresh in browser.
echo.
echo For production deployment, use: start-production.bat
echo.

echo [1/4] Stopping existing services...
taskkill /FI "WINDOWTITLE eq Backend Server*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend Server*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Admin Frontend*" /F >nul 2>&1
echo Waiting for processes to stop...
timeout /t 3 /nobreak >nul
echo.

echo [2/4] Starting backend (with hot-reload)...
start "Backend Server" cmd /k "cd /d %~dp0 && call venv\Scripts\activate.bat && cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo Backend starting... waiting 8 seconds for initialization
timeout /t 8 /nobreak >nul
echo.

echo [3/4] Starting user frontend (Vite dev server)...
start "Frontend Server" cmd /k "cd /d %~dp0frontend && npm run dev"
echo User frontend starting...
echo.

echo [4/4] Starting admin frontend (Vite dev server)...
start "Admin Frontend" cmd /k "cd /d %~dp0admin-frontend && npm run dev"
echo Admin frontend starting...
echo.

echo ============================================================
echo Development servers started!
echo ============================================================
echo.
echo   Backend API:     http://localhost:8000/api
echo   User Frontend:   http://localhost:5173  (Vite hot-reload)
echo   Admin Panel:     http://localhost:3001  (Vite hot-reload)
echo.
echo Note: 8000 port also serves built static files, but they may be outdated.
echo       Use 5173/3001 for development with live updates.
echo.
pause
