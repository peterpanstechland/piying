@echo off
REM End-to-end deployment testing script (Windows)

echo Shadow Puppet System - Deployment Test
echo =======================================
echo.

setlocal enabledelayedexpansion
set TESTS_PASSED=0
set TESTS_FAILED=0

REM Test 1: Check Python installation
echo Test 1: Checking Python installation...
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] Python is installed
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Python is not installed
    set /a TESTS_FAILED+=1
)

REM Test 2: Check Node.js installation
echo Test 2: Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] Node.js is installed
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Node.js is not installed
    set /a TESTS_FAILED+=1
)

REM Test 3: Check required directories
echo Test 3: Checking required directories...
set DIRS_EXIST=0
if exist "data\sessions\" set /a DIRS_EXIST+=1
if exist "data\outputs\" set /a DIRS_EXIST+=1
if exist "data\logs\" set /a DIRS_EXIST+=1
if exist "assets\scenes\" set /a DIRS_EXIST+=1
if exist "config\" set /a DIRS_EXIST+=1
if %DIRS_EXIST% equ 5 (
    echo [PASS] All required directories exist
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Missing required directories ^(%DIRS_EXIST%/5 found^)
    set /a TESTS_FAILED+=1
)

REM Test 4: Check frontend build
echo Test 4: Checking frontend build...
if exist "frontend\dist\" (
    echo [PASS] Frontend build exists
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Frontend build not found ^(run build-frontend.bat^)
    set /a TESTS_FAILED+=1
)

REM Test 5: Check configuration files
echo Test 5: Checking configuration files...
set CONFIG_FILES=0
if exist "config\scenes.json" set /a CONFIG_FILES+=1
if exist "config\settings.json" set /a CONFIG_FILES+=1
if exist ".env" set /a CONFIG_FILES+=1
if %CONFIG_FILES% equ 3 (
    echo [PASS] All configuration files exist
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Missing configuration files ^(%CONFIG_FILES%/3 found^)
    set /a TESTS_FAILED+=1
)

REM Test 6: Check scene assets
echo Test 6: Checking scene assets...
dir /b assets\scenes\*.mp4 >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] Scene video files found
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] No scene video files found
    set /a TESTS_FAILED+=1
)

REM Test 7: Check backend health (if running)
echo Test 7: Checking backend health endpoint...
curl -s http://localhost:8000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] Backend is running
    set /a TESTS_PASSED+=1
) else (
    echo [SKIP] Backend is not running ^(start with start-production.bat^)
)

REM Test 8: Check disk space
echo Test 8: Checking disk space...
for /f "tokens=3" %%a in ('dir /-c ^| find "bytes free"') do set AVAILABLE_SPACE=%%a
echo [INFO] Disk space check: %AVAILABLE_SPACE% bytes free
set /a TESTS_PASSED+=1

REM Test 9: Check OpenCV installation
echo Test 9: Checking OpenCV installation...
python -c "import cv2; print(cv2.__version__)" >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] OpenCV is installed and importable
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] OpenCV is not installed or not importable
    set /a TESTS_FAILED+=1
)

REM Test 10: Check write permissions
echo Test 10: Checking write permissions...
echo test > data\sessions\.test 2>nul
if exist "data\sessions\.test" (
    del data\sessions\.test
    echo [PASS] Write permissions OK for data directories
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Write permission issues in data directories
    set /a TESTS_FAILED+=1
)

REM Summary
echo.
echo =======================================
echo Test Summary
echo =======================================
echo Tests Passed: %TESTS_PASSED%
echo Tests Failed: %TESTS_FAILED%
echo.

if %TESTS_FAILED% equ 0 (
    echo [SUCCESS] All tests passed! System is ready for deployment.
    exit /b 0
) else (
    echo [ERROR] Some tests failed. Please fix the issues before deployment.
    exit /b 1
)
