@echo off
chcp 65001 >nul
title 清理构建目录

echo ========================================
echo   清理 Electron 构建目录
echo ========================================
echo.

:: 关闭可能运行的 Electron 进程
echo [1/3] 关闭 Electron 进程...
taskkill /F /IM electron.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo       已关闭 electron.exe
) else (
    echo       未发现运行中的 electron.exe
)

taskkill /F /IM "皮影互动系统.exe" >nul 2>&1
if %errorlevel% equ 0 (
    echo       已关闭 皮影互动系统.exe
) else (
    echo       未发现运行中的 皮影互动系统.exe
)

timeout /t 2 /nobreak >nul
echo.

:: 清理 dist_v4 目录
echo [2/3] 清理 dist_v4 目录...
if exist electron-app\dist_v4 (
    echo       正在删除 electron-app\dist_v4...
    :: 使用 PowerShell 强制删除
    powershell -Command "$path = 'electron-app\dist_v4'; if (Test-Path $path) { Get-ChildItem -Path $path -Recurse -Force | ForEach-Object { $_.Attributes = 'Normal' }; Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue }"
    timeout /t 1 /nobreak >nul
    
    if exist electron-app\dist_v4 (
        rmdir /s /q electron-app\dist_v4 >nul 2>&1
        timeout /t 1 /nobreak >nul
    )
    
    if exist electron-app\dist_v4 (
        echo       [错误] 无法删除 dist_v4 目录
        echo       请手动关闭以下程序后重试：
        echo         - OneDrive 同步
        echo         - 文件资源管理器（如果打开了该目录）
        echo         - 其他可能使用该目录的程序
        echo.
        echo       或手动删除：electron-app\dist_v4
    ) else (
        echo       dist_v4 目录已删除 ✓
    )
) else (
    echo       dist_v4 目录不存在，无需清理
)
echo.

:: 清理其他构建目录（可选）
echo [3/3] 清理其他构建目录...
if exist electron-app\dist (
    echo       正在删除 electron-app\dist...
    rmdir /s /q electron-app\dist >nul 2>&1
    if exist electron-app\dist (
        echo       [警告] 无法删除 dist 目录
    ) else (
        echo       dist 目录已删除 ✓
    )
) else (
    echo       dist 目录不存在，无需清理
)

if exist electron-app\dist_v2 (
    echo       正在删除 electron-app\dist_v2...
    rmdir /s /q electron-app\dist_v2 >nul 2>&1
    if exist electron-app\dist_v2 (
        echo       [警告] 无法删除 dist_v2 目录
    ) else (
        echo       dist_v2 目录已删除 ✓
    )
) else (
    echo       dist_v2 目录不存在，无需清理
)

if exist electron-app\dist_v3 (
    echo       正在删除 electron-app\dist_v3...
    rmdir /s /q electron-app\dist_v3 >nul 2>&1
    if exist electron-app\dist_v3 (
        echo       [警告] 无法删除 dist_v3 目录
    ) else (
        echo       dist_v3 目录已删除 ✓
    )
) else (
    echo       dist_v3 目录不存在，无需清理
)
echo.

echo ========================================
echo   清理完成！
echo ========================================
echo.
pause






















