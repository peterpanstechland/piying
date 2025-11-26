@echo off
echo ============================================================
echo System Diagnosis
echo ============================================================
echo.

echo [1] Checking Python...
python --version
echo.

echo [2] Checking virtual environment...
if exist "venv\Scripts\python.exe" (
    echo Virtual environment exists
    venv\Scripts\python.exe --version
) else (
    echo ERROR: Virtual environment not found
)
echo.

echo [3] Checking backend dependencies...
call venv\Scripts\activate.bat
pip show fastapi uvicorn
echo.

echo [4] Testing backend import...
cd backend
python -c "from app.main import app; print('✓ Backend imports successfully')" 2>&1
cd ..
echo.

echo [5] Checking config files...
if exist "config\scenes.json" (
    echo ✓ config\scenes.json exists
) else (
    echo ERROR: config\scenes.json not found
)
echo.

echo [6] Checking port 8000...
powershell -Command "Test-NetConnection -ComputerName localhost -Port 8000 -InformationLevel Quiet"
if %ERRORLEVEL% EQU 0 (
    echo ✓ Port 8000 is in use
) else (
    echo ✗ Port 8000 is not in use
)
echo.

echo [7] Testing backend endpoint...
curl http://localhost:8000/ 2>nul
echo.
echo.

echo [8] Testing config endpoint...
curl http://localhost:8000/config/scenes.json 2>nul
echo.
echo.

pause
