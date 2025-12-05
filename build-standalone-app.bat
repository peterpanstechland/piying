@echo off
chcp 65001 >nul
title 皮影互动系统 - 独立版打包

echo ========================================
echo   皮影互动系统 - 独立版打包工具
echo   Standalone Build Tool
echo ========================================
echo.

:: 步骤 1: 构建前端
echo [1/3] 构建前端 (Building Frontend)...
if not exist frontend\dist (
    echo       正在进入 frontend 目录构建...
    cd frontend
    call npm install
    call npm run build
    cd ..
)
if not exist admin-frontend\dist (
    echo       正在进入 admin-frontend 目录构建...
    cd admin-frontend
    call npm install
    call npm run build
    cd ..
)
echo       前端构建完成
echo.

:: 步骤 2: 构建后端 Exe
echo [2/3] 构建后端可执行文件 (Building Backend Exe)...
call build-backend-exe.bat
if %errorlevel% neq 0 (
    echo [错误] 后端构建失败
    pause
    exit /b 1
)
echo       后端构建完成
echo.

:: 步骤 3: 构建 Electron 应用
echo [3/3] 打包 Electron 应用 (Building Electron App)...
cd electron-app

echo       正在安装/更新 Electron 依赖...
call npm install

echo       正在执行打包...
call npm run build:win

cd ..

echo.
echo ========================================
echo   独立版打包完成！(Build Complete)
echo ========================================
echo.
echo 输出文件位置:
echo   electron-app\dist\
echo.
pause
