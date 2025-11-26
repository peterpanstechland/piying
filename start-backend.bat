@echo off
REM Start backend development server (Windows)

echo Starting Shadow Puppet Backend...

REM Check if venv exists
if not exist "venv" (
    echo ERROR: Virtual environment not found.
    echo Please run setup.bat first.
    pause
    exit /b 1
)

call venv\Scripts\activate.bat
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
