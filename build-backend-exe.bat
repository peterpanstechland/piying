@echo off
chcp 65001 >nul
title Build Backend Exe

echo ========================================
echo   Build Backend Exe (PyInstaller)
echo ========================================
echo.

echo Current Working Directory: %CD%
set "VENV_PYTHON=%CD%\venv\Scripts\python.exe"

echo Checking Python path: %VENV_PYTHON%

:: Check Python environment
if not exist "%VENV_PYTHON%" (
    echo [ERROR] Python environment not found
    echo Expected: %VENV_PYTHON%
    echo Please run setup.bat first.
    pause
    exit /b 1
)

echo Found Python environment.

:: Activate venv
call venv\Scripts\activate

:: Check PyInstaller
pip show pyinstaller >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing PyInstaller...
    pip install pyinstaller
)

:: Clean old builds
if exist backend\build rmdir /s /q backend\build
if exist backend\dist rmdir /s /q backend\dist
if exist backend.spec del backend.spec

echo Packaging backend...
echo This may take a few minutes...

:: Use PyInstaller
:: --onedir: Directory output
:: --name: Output name
:: --noconsole: No console window

pyinstaller --noconsole --onedir --name backend --clean ^
    --add-data "backend/app;app" ^
    --hidden-import=uvicorn.logging ^
    --hidden-import=uvicorn.loops ^
    --hidden-import=uvicorn.loops.auto ^
    --hidden-import=uvicorn.protocols ^
    --hidden-import=uvicorn.protocols.http ^
    --hidden-import=uvicorn.protocols.http.auto ^
    --hidden-import=uvicorn.protocols.websockets ^
    --hidden-import=uvicorn.protocols.websockets.auto ^
    --hidden-import=uvicorn.lifespan ^
    --hidden-import=uvicorn.lifespan.on ^
    --hidden-import=engineio.async_drivers.aiohttp ^
    --hidden-import=sqlalchemy.ext.asyncio ^
    --hidden-import=sqlalchemy.dialects.sqlite ^
    --hidden-import=aiosqlite ^
    --hidden-import=passlib.handlers.bcrypt ^
    --hidden-import=multipart ^
    --hidden-import=boto3 ^
    --hidden-import=botocore ^
    backend/run.py

if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo Backend build complete!
echo Output dir: dist\backend
echo.

:: Move to electron-app resources
echo Preparing Electron resources...
if not exist electron-app\resources mkdir electron-app\resources
if exist electron-app\resources\backend rmdir /s /q electron-app\resources\backend
if exist electron-app\resources\data rmdir /s /q electron-app\resources\data

:: Copy backend executable structure
xcopy /E /I /Y dist\backend electron-app\resources\backend >nul

:: Copy data directory to resources/data (ROOT/data)
if not exist electron-app\resources\data mkdir electron-app\resources\data
if not exist electron-app\resources\data\characters mkdir electron-app\resources\data\characters
if not exist electron-app\resources\data\storylines mkdir electron-app\resources\data\storylines
if not exist electron-app\resources\data\logs mkdir electron-app\resources\data\logs
if not exist electron-app\resources\data\outputs mkdir electron-app\resources\data\outputs

:: Copy initial data
xcopy /E /I /Y backend\data\characters electron-app\resources\data\characters >nul
xcopy /E /I /Y backend\data\storylines electron-app\resources\data\storylines >nul

echo Done!
