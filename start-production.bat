@echo off
REM ============================================================
REM Shadow Puppet Interactive System - Production Mode
REM ============================================================

echo ============================================================
echo Starting Production Environment
echo ============================================================
echo.

REM Check if venv exists
if not exist "venv" (
    echo ERROR: Virtual environment not found.
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Check if required directories exist
if not exist "data\sessions\" mkdir data\sessions
if not exist "data\outputs\" mkdir data\outputs
if not exist "data\logs\" mkdir data\logs

REM Build frontend
echo [1/2] Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed.
    cd ..
    pause
    exit /b 1
)
cd ..
echo Frontend built successfully.
echo.

REM Get local IP address for QR code
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do set LOCAL_IP=%%a
set LOCAL_IP=%LOCAL_IP:~1%
if "%LOCAL_IP%"=="" set LOCAL_IP=localhost

echo System Configuration:
echo   Server: http://%LOCAL_IP%:8000
echo   QR Code URLs: http://%LOCAL_IP%:8000
echo.

REM Start backend
echo [2/2] Starting production server...
echo Press Ctrl+C to stop the server.
echo.
call venv\Scripts\activate.bat
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --log-level info

pause
