@echo off
setlocal enabledelayedexpansion
title 皮影互动系统 - 一键安装器
color 0B

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   皮影互动系统 - 一键安装器                 ║
echo  ║   Shadow Puppet System - One-Click Installer ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  此安装器将自动完成所有配置
echo  预计需要 5-10 分钟
echo.
pause

REM 切换到脚本目录
cd /d "%~dp0"

echo.
echo ════════════════════════════════════════════════
echo  步骤 1/6: 检查 Python
echo ════════════════════════════════════════════════
echo.

REM 检查系统 Python
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 检测到系统 Python
    python --version
    set PYTHON_CMD=python
    goto :python_found
)

REM 检查便携版 Python
if exist "runtime\python\python.exe" (
    echo [✓] 检测到便携版 Python
    runtime\python\python.exe --version
    set PYTHON_CMD=runtime\python\python.exe
    goto :python_found
)

REM Python 未找到
echo [✗] 未找到 Python
echo.
echo 请选择安装方式:
echo 1. 自动下载便携版 Python (推荐)
echo 2. 手动安装 Python 后重新运行
echo 3. 退出安装
echo.
choice /c 123 /n /m "请选择 (1/2/3): "

if errorlevel 3 exit /b 1
if errorlevel 2 (
    echo.
    echo 请访问 https://www.python.org/downloads/ 下载 Python 3.10+
    echo 安装时请勾选 "Add Python to PATH"
    pause
    exit /b 1
)

echo.
echo [!] 自动下载功能需要网络连接
echo [!] 如果无法联网，请手动下载 Python 便携版
echo [!] 并解压到 runtime\python 目录
echo.
pause

REM 这里可以添加自动下载逻辑
echo [!] 自动下载功能开发中...
echo 请手动下载 WinPython 或 Portable Python
pause
exit /b 1

:python_found
echo.
echo ════════════════════════════════════════════════
echo  步骤 2/6: 创建虚拟环境
echo ════════════════════════════════════════════════
echo.

if exist "venv" (
    echo [!] 虚拟环境已存在，跳过创建
) else (
    echo [→] 正在创建虚拟环境...
    %PYTHON_CMD% -m venv venv
    if %errorlevel% neq 0 (
        echo [✗] 创建虚拟环境失败
        pause
        exit /b 1
    )
    echo [✓] 虚拟环境创建成功
)

echo.
echo ════════════════════════════════════════════════
echo  步骤 3/6: 安装 Python 依赖
echo ════════════════════════════════════════════════
echo.

call venv\Scripts\activate.bat

REM 检查是否有离线包
if exist "runtime\python-packages" (
    echo [→] 使用离线包安装依赖...
    pip install --no-index --find-links=runtime\python-packages -r backend\requirements.txt
) else (
    echo [→] 从网络安装依赖...
    pip install -r backend\requirements.txt
)

if %errorlevel% neq 0 (
    echo [✗] 依赖安装失败
    pause
    exit /b 1
)
echo [✓] 依赖安装成功

echo.
echo ════════════════════════════════════════════════
echo  步骤 4/6: 配置环境
echo ════════════════════════════════════════════════
echo.

REM 创建必要的目录
if not exist "data" mkdir data
if not exist "data\sessions" mkdir data\sessions
if not exist "data\outputs" mkdir data\outputs
if not exist "data\logs" mkdir data\logs

REM 复制环境配置
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo [✓] 环境配置文件已创建
    )
)

echo [✓] 目录结构已创建

echo.
echo ════════════════════════════════════════════════
echo  步骤 5/6: 验证安装
echo ════════════════════════════════════════════════
echo.

echo [→] 测试后端启动...
start /B "" venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001 >nul 2>&1
timeout /t 5 /nobreak >nul

REM 测试端口
powershell -Command "Test-NetConnection -ComputerName localhost -Port 8001 -InformationLevel Quiet" >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 后端测试成功
    REM 停止测试服务
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001') do taskkill /PID %%a /F >nul 2>&1
) else (
    echo [!] 后端测试失败，但可能仍然可以正常使用
)

echo.
echo ════════════════════════════════════════════════
echo  步骤 6/6: 创建快捷方式
echo ════════════════════════════════════════════════
echo.

REM 创建启动脚本
call :CREATE_LAUNCHER
echo [✓] 启动脚本已创建

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║            安装完成！                        ║
echo  ║         Installation Complete!               ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  下一步:
echo  1. 双击 "启动系统.bat" 启动系统
echo  2. 系统会自动打开浏览器
echo  3. 默认管理员账号: admin / admin123
echo  4. 请立即修改默认密码！
echo.
echo  文件位置:
echo  - 启动系统.bat (启动系统)
echo  - 停止系统.bat (停止系统)
echo  - 使用说明.txt (详细说明)
echo.
pause
exit /b 0

:CREATE_LAUNCHER
(
echo @echo off
echo title 皮影互动系统
echo cd /d "%%~dp0"
echo call venv\Scripts\activate.bat
echo start /B "" venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
echo timeout /t 8 /nobreak ^>nul
echo start http://localhost:8000
echo echo.
echo echo 系统已启动！
echo echo 用户界面: http://localhost:8000
echo echo 管理面板: http://localhost:8000/admin
echo echo.
echo echo 按任意键关闭此窗口（系统将继续运行）
echo pause
) > "启动系统.bat"

(
echo @echo off
echo echo 正在停止系统...
echo for /f "tokens=5" %%%%a in ^('netstat -ano ^| findstr :8000'^) do taskkill /PID %%%%a /F ^>nul 2^>^&1
echo echo 系统已停止
echo pause
) > "停止系统.bat"

goto :eof
