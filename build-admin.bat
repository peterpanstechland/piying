@echo off
REM ============================================================
REM Build Admin Panel Frontend for Production (Windows)
REM ============================================================

echo ============================================================
echo Building Admin Panel Frontend for production...
echo ============================================================
echo.

REM Check if admin-frontend directory exists
if not exist "admin-frontend" (
    echo ERROR: admin-frontend directory not found.
    echo Please ensure the admin panel project exists.
    pause
    exit /b 1
)

cd admin-frontend

REM Check if node_modules exists, if not install dependencies
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies.
        cd ..
        pause
        exit /b 1
    )
)

REM Run TypeScript compilation and Vite build
echo Building production bundle...
call npm run build

REM Check if build was successful
if exist "dist\" (
    echo.
    echo ============================================================
    echo Admin Panel build successful!
    echo Build output: admin-frontend\dist\
    echo ============================================================
    
    REM Show build contents
    echo.
    echo Build contents:
    dir dist /s /b 2>nul | find /c /v "" 
    echo files generated.
) else (
    echo.
    echo ERROR: Admin Panel build failed!
    cd ..
    pause
    exit /b 1
)

cd ..
echo.
echo Admin Panel build complete.
echo The admin panel will be served at /admin/ when the backend starts.
