@echo off
chcp 65001 >nul
title 自动开机启动设置

echo ========================================
echo   皮影互动系统 - 开机自启设置
echo ========================================
echo.

:: 获取当前目录下的 exe 文件
for /f "delims=" %%i in ('dir /b /s "皮影互动系统.exe"') do set "TARGET_PATH=%%i"

if "%TARGET_PATH%"=="" (
    echo [错误] 未找到 "皮影互动系统.exe"
    echo 请将此脚本放在应用安装目录或构建目录中运行。
    pause
    exit /b 1
)

echo 找到目标程序: %TARGET_PATH%
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_NAME=皮影互动系统.lnk"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\%SHORTCUT_NAME%"

echo 正在添加至启动文件夹:
echo %STARTUP_FOLDER%
echo.

:: 使用 PowerShell 创建快捷方式
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = '%TARGET_PATH%'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [成功] 已设置开机自动启动！
    echo.
    echo 下次开机时，系统将自动进入互动界面。
) else (
    echo [失败] 无法创建快捷方式。
)

echo.
pause



