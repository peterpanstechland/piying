@echo off
echo ========================================
echo Preparing Electron Desktop Application
echo ========================================
echo.

REM Step 1: Build frontend
echo [1/6] Building frontend...
call build-all.bat
if %errorlevel% neq 0 (
    echo Error: Frontend build failed
    pause
    exit /b 1
)
echo.

REM Step 2: Create electron-app directory structure
echo [2/6] Creating directory structure...
if not exist electron-app\python-backend mkdir electron-app\python-backend
if not exist electron-app\build mkdir electron-app\build
echo.

REM Step 3: Copy backend files
echo [3/6] Copying backend files...
xcopy /E /I /Y backend electron-app\python-backend\backend
xcopy /E /I /Y frontend\dist electron-app\python-backend\frontend\dist
xcopy /E /I /Y admin-frontend\dist electron-app\python-backend\admin-frontend\dist
xcopy /E /I /Y assets electron-app\python-backend\assets
xcopy /E /I /Y config electron-app\python-backend\config
copy .env.example electron-app\python-backend\.env
echo.

REM Step 4: Clean up unnecessary files
echo [4/6] Cleaning up...
if exist electron-app\python-backend\backend\__pycache__ rmdir /s /q electron-app\python-backend\backend\__pycache__
if exist electron-app\python-backend\backend\tests rmdir /s /q electron-app\python-backend\backend\tests
del /s /q electron-app\python-backend\backend\*.pyc 2>nul
echo.

REM Step 5: Create Python virtual environment
echo [5/6] Creating Python virtual environment...
cd electron-app\python-backend
python -m venv venv
call venv\Scripts\activate.bat

REM Upgrade pip first
python -m pip install --upgrade pip

REM Install dependencies without strict version requirements
pip install fastapi uvicorn[standard] pydantic opencv-python mediapipe sqlalchemy aiosqlite bcrypt python-jose apscheduler python-multipart

REM Or use existing venv if available
REM xcopy /E /I /Y ..\..\venv venv

cd ..\..
echo.

REM Step 6: Install Node.js dependencies
echo [6/6] Installing Node.js dependencies...
cd electron-app
if not exist node_modules (
    echo Installing npm packages... (this may take a few minutes)
    call npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo Warning: npm install had issues, but continuing...
    )
)
cd ..
echo.

echo ========================================
echo Preparation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. cd electron-app
echo 2. npm start (to test)
echo 3. npm run build:win (to build EXE)
echo.
echo Output will be in: electron-app\dist\
echo - ShadowPuppet-Setup-1.0.0.exe (Installer)
echo - ShadowPuppet-Portable-1.0.0.exe (Portable)
echo.
pause
