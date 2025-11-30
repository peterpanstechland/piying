@echo off
REM ============================================================
REM Build All Frontends for Production (Windows)
REM Shadow Puppet Interactive System
REM ============================================================

echo ============================================================
echo Building All Frontends for Production
echo ============================================================
echo.

REM Track build status
set BUILD_SUCCESS=1

REM ============================================================
REM Build Main Frontend
REM ============================================================
echo [1/2] Building Main Frontend...
echo ------------------------------------------------------------

if not exist "frontend" (
    echo ERROR: frontend directory not found.
    set BUILD_SUCCESS=0
    goto :admin_build
)

cd frontend

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies.
        set BUILD_SUCCESS=0
        cd ..
        goto :admin_build
    )
)

echo Building production bundle...
call npm run build

if exist "dist\" (
    echo ✓ Main Frontend build successful!
) else (
    echo ✗ Main Frontend build failed!
    set BUILD_SUCCESS=0
)

cd ..
echo.

REM ============================================================
REM Build Admin Frontend
REM ============================================================
:admin_build
echo [2/2] Building Admin Panel Frontend...
echo ------------------------------------------------------------

if not exist "admin-frontend" (
    echo ERROR: admin-frontend directory not found.
    set BUILD_SUCCESS=0
    goto :summary
)

cd admin-frontend

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install admin-frontend dependencies.
        set BUILD_SUCCESS=0
        cd ..
        goto :summary
    )
)

echo Building production bundle...
call npm run build

if exist "dist\" (
    echo ✓ Admin Panel build successful!
) else (
    echo ✗ Admin Panel build failed!
    set BUILD_SUCCESS=0
)

cd ..
echo.

REM ============================================================
REM Summary
REM ============================================================
:summary
echo ============================================================
echo Build Summary
echo ============================================================

if exist "frontend\dist\" (
    echo ✓ Main Frontend:  frontend\dist\
) else (
    echo ✗ Main Frontend:  NOT BUILT
)

if exist "admin-frontend\dist\" (
    echo ✓ Admin Panel:    admin-frontend\dist\
) else (
    echo ✗ Admin Panel:    NOT BUILT
)

echo.

if %BUILD_SUCCESS%==1 (
    echo All builds completed successfully!
    echo.
    echo To start the production server, run:
    echo   start-production.bat
    echo.
    echo Access points:
    echo   Main App:    http://localhost:8000/
    echo   Admin Panel: http://localhost:8000/admin/
) else (
    echo Some builds failed. Please check the errors above.
    pause
    exit /b 1
)

echo.
pause
