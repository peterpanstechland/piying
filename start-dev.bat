@echo off
REM ============================================================
REM Shadow Puppet Interactive System - Development Mode
REM ============================================================

echo ============================================================
echo Starting Development Environment
echo ============================================================
echo.

REM Check if venv exists
if not exist "venv" (
    echo ERROR: Virtual environment not found.
    echo Please run setup.bat first.
    pause
    exit /b 1
)

echo Backend will start on: http://localhost:8000
echo Frontend will start on: http://localhost:5173
echo.
echo Press Ctrl+C in each window to stop the servers.
echo.

REM Start backend in new window
echo Starting backend server...
start "Backend Server" cmd /k "cd /d %~dp0 && call venv\Scripts\activate.bat && cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

REM Wait a bit for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo Starting frontend server...
start "Frontend Server" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are starting in separate windows.
echo.
pause
