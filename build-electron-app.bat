@echo off
REM 确保在 cmd.exe 中运行，而不是 PowerShell
if "%COMSPEC%"=="" set COMSPEC=%SystemRoot%\system32\cmd.exe
chcp 65001 >nul 2>&1
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
echo [1/6] 构建用户前端...
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
echo [2/6] 构建管理后台前端...
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

:: 步骤 3: 构建后端
echo [3/6] 构建 Python 后端...
call build-backend-exe.bat
if %errorlevel% neq 0 (
    echo [错误] 后端构建失败
    pause
    exit /b 1
)
echo       Python 后端构建完成 ✓
echo.

:: 步骤 4: 安装 Electron 依赖
echo [4/6] 安装 Electron 依赖...
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
echo [5/6] 准备打包资源...
if not exist electron-app\build (
    mkdir electron-app\build
)
if not exist electron-app\build\icon.ico (
    echo       创建默认图标...
    :: 使用 PowerShell 创建一个简单的图标占位符
    (
        echo Add-Type -AssemblyName System.Drawing
        echo $bmp = New-Object System.Drawing.Bitmap(256,256^)
        echo $g = [System.Drawing.Graphics]::FromImage($bmp^)
        echo $g.Clear([System.Drawing.Color]::FromArgb(26,26,46^)^)
        echo $font = New-Object System.Drawing.Font('Segoe UI Emoji',120^)
        echo $g.DrawString([char]0x1F3AD,$font,[System.Drawing.Brushes]::White,20,40^)
        echo $bmp.Save('electron-app\build\icon.png'^)
        echo $bmp.Dispose(^)
        echo $g.Dispose(^)
    ) > "%TEMP%\create-icon.ps1"
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\create-icon.ps1"
    del "%TEMP%\create-icon.ps1" >nul 2>&1
    
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

:: 步骤 6: 清理旧的构建目录
echo [6/6] 清理旧的构建目录...
echo       正在关闭可能运行的 Electron 进程...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "皮影互动系统.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo       正在删除旧的构建目录...
if exist electron-app\dist_v4 (
    :: 使用 PowerShell 强制删除，处理文件占用问题
    :: 先尝试解除文件只读属性，然后删除
    (
        echo $path = 'electron-app\dist_v4'
        echo if (Test-Path $path^) {
        echo     Get-ChildItem -Path $path -Recurse -Force ^| ForEach-Object { $_.Attributes = 'Normal' }
        echo     Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
        echo }
    ) > "%TEMP%\remove-dist.ps1"
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\remove-dist.ps1"
    del "%TEMP%\remove-dist.ps1" >nul 2>&1
    :: 等待一下让系统释放文件句柄
    timeout /t 1 /nobreak >nul
    :: 如果 PowerShell 删除失败，尝试使用 rmdir
    if exist electron-app\dist_v4 (
        rmdir /s /q electron-app\dist_v4 >nul 2>&1
        timeout /t 1 /nobreak >nul
    )
    :: 再次检查，如果还存在则提示
    if exist electron-app\dist_v4 (
        echo       [警告] 无法完全删除 dist_v4 目录，某些文件可能被占用
        echo       可能的原因：
        echo         - OneDrive 正在同步文件
        echo         - 文件资源管理器正在访问该目录
        echo         - 其他程序正在使用该目录中的文件
        echo.
        echo       建议操作：
        echo         1. 关闭 OneDrive 同步（临时）
        echo         2. 关闭文件资源管理器中打开的该目录
        echo         3. 手动删除 electron-app\dist_v4 目录
        echo.
        echo       是否继续构建？(Y/N)
        choice /C YN /N /M "继续"
        if errorlevel 2 (
            echo [取消] 构建已取消
            pause
            exit /b 1
        )
    ) else (
        echo       旧构建目录已清理 ✓
    )
) else (
    echo       无需清理（目录不存在）✓
)
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
