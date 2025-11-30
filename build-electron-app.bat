@echo off
chcp 65001 >nul
title 皮影互动系统 - 打包工具

echo ========================================
echo   皮影互动系统 - Electron 打包工具
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 步骤 1: 构建前端
echo [1/5] 构建用户前端...
if not exist frontend\dist (
    cd frontend
    call npm install
    call npm run build
    cd ..
    if not exist frontend\dist (
        echo [错误] 前端构建失败
        pause
        exit /b 1
    )
)
echo       用户前端构建完成 ✓
echo.

:: 步骤 2: 构建管理后台前端
echo [2/5] 构建管理后台前端...
if not exist admin-frontend\dist (
    cd admin-frontend
    call npm install
    call npm run build
    cd ..
    if not exist admin-frontend\dist (
        echo [错误] 管理后台前端构建失败
        pause
        exit /b 1
    )
)
echo       管理后台前端构建完成 ✓
echo.

:: 步骤 3: 检查 Python 虚拟环境
echo [3/5] 检查 Python 环境...
if not exist venv (
    echo [错误] 未找到 Python 虚拟环境 (venv)
    echo 请先运行 setup.bat 创建虚拟环境
    pause
    exit /b 1
)
echo       Python 环境检查完成 ✓
echo.

:: 步骤 4: 安装 Electron 依赖
echo [4/5] 安装 Electron 依赖...
cd electron-app
call npm install
if %errorlevel% neq 0 (
    echo [错误] Electron 依赖安装失败
    cd ..
    pause
    exit /b 1
)
cd ..
echo       Electron 依赖安装完成 ✓
echo.

:: 步骤 5: 创建应用图标（如果不存在）
echo [5/5] 准备打包资源...
if not exist electron-app\build\icon.ico (
    echo       创建默认图标...
    :: 使用 PowerShell 创建一个简单的图标占位符
    powershell -Command "Add-Type -AssemblyName System.Drawing; $bmp = New-Object System.Drawing.Bitmap(256,256); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::FromArgb(26,26,46)); $font = New-Object System.Drawing.Font('Segoe UI Emoji',120); $g.DrawString('🎭',$font,[System.Drawing.Brushes]::White,20,40); $bmp.Save('electron-app\build\icon.png'); $bmp.Dispose()"
    
    :: 如果有 ImageMagick，转换为 ico
    where magick >nul 2>&1
    if %errorlevel% equ 0 (
        magick electron-app\build\icon.png electron-app\build\icon.ico
    ) else (
        echo       [提示] 未找到 ImageMagick，使用 PNG 作为图标
        copy electron-app\build\icon.png electron-app\build\icon.ico >nul 2>&1
    )
)
echo       打包资源准备完成 ✓
echo.

:: 开始打包
echo ========================================
echo   开始打包 Electron 应用...
echo ========================================
echo.

cd electron-app
call npm run build:win

if %errorlevel% neq 0 (
    echo.
    echo [错误] 打包失败，请检查错误信息
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo   打包完成！
echo ========================================
echo.
echo 输出文件位置:
echo   electron-app\dist\
echo.
echo 文件列表:
dir /b electron-app\dist\*.exe 2>nul
echo.
echo 安装包可以直接发送给甲方使用！
echo.
pause
