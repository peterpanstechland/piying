@echo off
echo ========================================
echo 紧急密码重置工具
echo Emergency Password Reset Tool
echo ========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python
    echo [Error] Python not found
    pause
    exit /b 1
)

REM Check if virtual environment exists
if exist venv\Scripts\activate.bat (
    echo 激活虚拟环境...
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
)

REM Run the reset script
if "%~1"=="" (
    echo 使用默认账号: admin / admin123
    echo Using default account: admin / admin123
    echo.
    python reset-admin-password.py
) else (
    python reset-admin-password.py %1 %2
)

echo.
pause
