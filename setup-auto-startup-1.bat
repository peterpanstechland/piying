@echo off
setlocal
chcp 65001 >nul
title 自动开机启动设置

echo ========================================
echo   皮影互动系统 - 开机自启设置
echo ========================================
echo.

:: 在当前目录及子目录中查找 exe
set "TARGET_PATH="
for /f "delims=" %%i in ('dir /b /s "皮影互动系统.exe" 2^>nul') do (
    set "TARGET_PATH=%%i"
)

if "%TARGET_PATH%"=="" (
    echo [错误] 未找到 "皮影互动系统.exe"
    echo 请将此脚本放在應用安裝目錄或其上層目錄中運行。
    echo.
    pause
    exit /b 1
)

echo 找到目标程序:
echo   %TARGET_PATH%
echo.

:: 取 exe 所在目录作為工作目錄
for %%i in ("%TARGET_PATH%") do set "WORKING_DIR=%%~dpi"

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_NAME=皮影互动系统.lnk"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\%SHORTCUT_NAME%"

echo 启动文件夹:
echo   %STARTUP_FOLDER%
echo.

:: 如果已有旧快捷方式，先删除
if exist "%SHORTCUT_PATH%" (
    echo 检测到已有同名快捷方式，正在删除旧的...
    del "%SHORTCUT_PATH%" >nul 2>&1
)

echo 正在创建开机启动快捷方式...

:: 使用 PowerShell 创建快捷方式
powershell -NoProfile -Command ^
 "$WshShell = New-Object -ComObject WScript.Shell; ^
  $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); ^
  $Shortcut.TargetPath = '%TARGET_PATH%'; ^
  $Shortcut.WorkingDirectory = '%WORKING_DIR%'; ^
  $Shortcut.WindowStyle = 1; ^
  $Shortcut.Save()"

if exist "%SHORTCUT_PATH%" (
    echo.
    echo [成功] 已设置开机自动启动！
    echo 下次开机时，系统将自动进入互动界面。
) else (
    echo.
    echo [失败] 无法创建快捷方式，请检查是否有权限或 PowerShell 是否可用。
)

echo.
pause
endlocal
