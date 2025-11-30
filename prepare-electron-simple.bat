@echo off
echo ========================================
echo Preparing Electron App (Simple Method)
echo ========================================
echo.

REM Step 1: Build frontend
echo [1/5] Building frontend...
if not exist frontend\dist (
    echo Building user frontend...
    cd frontend
    call npm run build
    cd ..
)

if not exist admin-frontend\dist (
    echo Building admin frontend...
    cd admin-frontend
    call npm run build
    cd ..
)
echo Frontend ready!
echo.

REM Step 2: Create directory structure
echo [2/5] Creating directory structure...
if not exist electron-app\python-backend mkdir electron-app\python-backend
if not exist electron-app\build mkdir electron-app\build
echo.

REM Step 3: Copy files
echo [3/5] Copying files...
echo Copying backend...
xcopy /E /I /Y backend electron-app\python-backend\backend >nul

echo Copying frontend...
xcopy /E /I /Y frontend\dist electron-app\python-backend\frontend\dist >nul

echo Copying admin-frontend...
xcopy /E /I /Y admin-frontend\dist electron-app\python-backend\admin-frontend\dist >nul

echo Copying assets...
xcopy /E /I /Y assets electron-app\python-backend\assets >nul

echo Copying config...
xcopy /E /I /Y config electron-app\python-backend\config >nul

echo Copying environment...
copy .env electron-app\python-backend\.env >nul
echo.

REM Step 4: Copy existing venv (much faster!)
echo [4/5] Copying Python environment...
if exist venv (
    echo Using existing venv...
    xcopy /E /I /Y venv electron-app\python-backend\venv >nul
    echo Python environment ready!
) else (
    echo Warning: No venv found in project root
    echo You need to create one manually in electron-app\python-backend\
    pause
)
echo.

REM Step 5: Install Node.js dependencies
echo [5/5] Installing Node.js dependencies...
cd electron-app

if not exist package.json (
    echo Error: package.json not found!
    echo Please make sure electron-app files are created.
    cd ..
    pause
    exit /b 1
)

if not exist node_modules (
    echo This may take 2-5 minutes...
    call npm install --legacy-peer-deps
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
echo Output: electron-app\dist\ShadowPuppet-Setup-1.0.0.exe
echo.
pause
