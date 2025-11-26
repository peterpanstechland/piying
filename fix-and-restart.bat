@echo off
echo ============================================================
echo Fixing MediaPipe and Restarting System
echo ============================================================
echo.

echo [1/3] Reinstalling frontend dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
cd ..
echo.

echo [2/3] Restarting backend...
taskkill /FI "WINDOWTITLE eq Backend Server*" /F >nul 2>&1
timeout /t 2 /nobreak >nul
start "Backend Server" cmd /k "cd /d %~dp0 && call venv\Scripts\activate.bat && cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo Backend starting...
timeout /t 5 /nobreak >nul
echo.

echo [3/3] Restarting frontend...
taskkill /FI "WINDOWTITLE eq Frontend Server*" /F >nul 2>&1
timeout /t 2 /nobreak >nul
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
echo Please refresh your browser and allow camera permissions.
echo.
pause
