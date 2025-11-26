@echo off
REM ============================================================
REM Shadow Puppet Interactive System - Setup Script
REM ============================================================

echo ============================================================
echo Shadow Puppet Interactive System
echo One-Click Setup
echo ============================================================
echo.

REM Check Python 3.12
echo [1/5] Checking Python 3.12 installation...
py -3.12 --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python 3.12 not found. Please install Python 3.12 from https://www.python.org/
    echo Current Python version:
    python --version 2>nul
    pause
    exit /b 1
)
py -3.12 --version
echo.

REM Check Node.js
echo [2/5] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo.

REM Create Python virtual environment with Python 3.12
echo [3/5] Creating Python 3.12 virtual environment...
if not exist "venv" (
    py -3.12 -m venv venv
    echo Virtual environment created with Python 3.12.
) else (
    echo Virtual environment already exists.
)
echo.

REM Install Python dependencies
echo [4/5] Installing Python dependencies...
call venv\Scripts\activate.bat
pip install --upgrade pip
pip install -r backend\requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies.
    pause
    exit /b 1
)
echo Python dependencies installed.
echo.

REM Install Node.js dependencies
echo [5/5] Installing Node.js dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install Node.js dependencies.
    cd ..
    pause
    exit /b 1
)
cd ..
echo Node.js dependencies installed.
echo.

REM Create placeholder assets
echo [OPTIONAL] Creating placeholder assets...
cd assets
call ..\venv\Scripts\python.exe create_placeholder_assets.py
cd ..
echo.

echo ============================================================
echo Setup completed successfully!
echo ============================================================
echo.
echo Next steps:
echo   1. Run: start-dev.bat (for development)
echo   2. Or run: start-production.bat (for production)
echo.
pause
