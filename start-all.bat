@echo off
echo ============================================================
echo Restarting Shadow Puppet System
echo ============================================================
echo.

echo [1/3] Stopping all services...
taskkill /FI "WINDOWTITLE eq Backend Server*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend Server*" /F >nul 2>&1
echo Waiting for processes to stop...
timeout /t 3 /nobreak >nul
echo.

echo [2/3] Starting backend...
start "Backend Server" cmd /k "cd /d %~dp0 && call venv\Scripts\activate.bat && cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo Backend starting... waiting 8 seconds for initialization
timeout /t 8 /nobreak >nul
echo.

echo [3/3] Starting frontend...
start "Frontend Server" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Frontend starting...
echo.

echo ============================================================
echo System restarted!
echo ============================================================
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Please wait 10 seconds, then refresh your browser.
echo Make sure to allow camera permissions.
echo.
pause
