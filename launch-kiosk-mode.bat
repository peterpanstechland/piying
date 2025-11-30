@echo off
REM 皮影互动系统 - Kiosk 模式启动
REM 自动启动后端并以全屏模式打开前端

title 皮影互动系统
color 0A

echo.
echo  ╔════════════════════════════════════════╗
echo  ║     皮影互动系统 - 正在启动...        ║
echo  ║  Shadow Puppet System - Starting...   ║
echo  ╚════════════════════════════════════════╝
echo.

REM 切换到应用目录
cd /d "%~dp0"

REM 检查虚拟环境
if not exist "venv\Scripts\python.exe" (
    echo [错误] 虚拟环境未找到，请先运行安装程序
    pause
    exit /b 1
)

REM 激活虚拟环境并启动后端
echo [1/3] 启动后端服务...
start /B "" venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000

REM 等待后端启动
echo [2/3] 等待服务初始化...
timeout /t 8 /nobreak >nul

REM 检测浏览器并以 Kiosk 模式启动
echo [3/3] 启动用户界面...

REM 尝试使用 Chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --app=http://localhost:8000
    goto :started
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk --app=http://localhost:8000
    goto :started
)

REM 尝试使用 Edge
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --app=http://localhost:8000
    goto :started
)

if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --kiosk --app=http://localhost:8000
    goto :started
)

REM 如果没有找到 Chrome 或 Edge，使用默认浏览器
start http://localhost:8000

:started
echo.
echo  ╔════════════════════════════════════════╗
echo  ║         系统已启动！                   ║
echo  ║       System Started!                  ║
echo  ╚════════════════════════════════════════╝
echo.
echo  用户界面: http://localhost:8000
echo  管理面板: http://localhost:8000/admin
echo.
echo  提示: 按 Alt+F4 或 F11 退出全屏模式
echo  提示: 运行 "停止系统.bat" 停止后端服务
echo.
echo  此窗口可以最小化，不要关闭
echo.

REM 保持窗口打开
pause >nul
