@echo off
chcp 65001 >nul
title 皮影互动系统 - 便携版打包

echo ========================================
echo   皮影互动系统 - 便携版打包工具
echo ========================================
echo.
echo 此工具创建一个完全自包含的便携版应用
echo 甲方无需安装任何环境，双击即可运行
echo.

set PACKAGE_NAME=ShadowPuppet-Portable
set PACKAGE_DIR=%PACKAGE_NAME%

:: 步骤 1: 构建前端
echo [1/6] 检查并构建前端...
if not exist frontend\dist (
    echo       构建用户前端...
    cd frontend
    call npm install
    call npm run build
    cd ..
)
if not exist admin-frontend\dist (
    echo       构建管理后台前端...
    cd admin-frontend
    call npm install
    call npm run build
    cd ..
)
echo       前端构建完成
echo.

:: 步骤 2: 清理并创建目录
echo [2/6] 创建打包目录...
if exist %PACKAGE_DIR% rmdir /s /q %PACKAGE_DIR%
mkdir %PACKAGE_DIR%
mkdir %PACKAGE_DIR%\data
mkdir %PACKAGE_DIR%\logs
echo       目录创建完成
echo.

:: 步骤 3: 复制文件
echo [3/6] 复制应用文件...
xcopy /E /I /Y /EXCLUDE:exclude.txt backend %PACKAGE_DIR%\backend >nul 2>nul
if not exist %PACKAGE_DIR%\backend xcopy /E /I /Y backend %PACKAGE_DIR%\backend >nul
xcopy /E /I /Y frontend\dist %PACKAGE_DIR%\frontend\dist >nul
xcopy /E /I /Y admin-frontend\dist %PACKAGE_DIR%\admin-frontend\dist >nul
xcopy /E /I /Y assets %PACKAGE_DIR%\assets >nul
xcopy /E /I /Y config %PACKAGE_DIR%\config >nul
copy .env %PACKAGE_DIR%\.env >nul 2>&1
copy .env.example %PACKAGE_DIR%\.env.example >nul 2>&1
echo       文件复制完成
echo.

:: 步骤 4: 复制 Python 环境
echo [4/6] 复制 Python 环境...
if exist venv (
    xcopy /E /I /Y venv %PACKAGE_DIR%\venv >nul
    echo       Python 环境复制完成
) else (
    echo       [警告] 未找到 venv，需要手动配置 Python 环境
)
echo.

:: 步骤 5: 创建启动器
echo [5/6] 创建启动器...

:: 主启动器 - 带界面选择
(
echo @echo off
echo chcp 65001 ^>nul
echo title 皮影互动系统
echo cd /d "%%~dp0"
echo.
echo :: 检查后端是否已运行
echo netstat -ano ^| findstr ":8000" ^>nul 2^>^&1
echo if %%errorlevel%% equ 0 ^(
echo     echo 服务已在运行中...
echo     goto :menu
echo ^)
echo.
echo echo 正在启动后端服务...
echo start /B "" venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 ^>logs\backend.log 2^>^&1
echo.
echo echo 等待服务启动...
echo timeout /t 8 /nobreak ^>nul
echo.
echo :menu
echo cls
echo.
echo echo ========================================
echo echo.
echo echo         皮影互动系统
echo echo.
echo echo    Shadow Puppet Interactive System
echo echo.
echo echo ========================================
echo echo.
echo echo   [1] 开始体验 - 进入互动界面
echo echo.
echo echo   [2] 管理后台 - 系统配置管理
echo echo.
echo echo   [3] 重启服务
echo echo.
echo echo   [4] 退出程序
echo echo.
echo echo ========================================
echo echo.
echo.
echo set /p choice=请选择 [1-4]: 
echo.
echo if "%%choice%%"=="1" ^(
echo     echo 正在打开体验界面...
echo     start "" "http://localhost:8000"
echo     goto :menu
echo ^)
echo if "%%choice%%"=="2" ^(
echo     echo 正在打开管理后台...
echo     start "" "http://localhost:8000/admin"
echo     goto :menu
echo ^)
echo if "%%choice%%"=="3" ^(
echo     echo 正在重启服务...
echo     for /f "tokens=5" %%%%a in ^('netstat -ano ^^^| findstr :8000'^) do taskkill /PID %%%%a /F ^>nul 2^>^&1
echo     timeout /t 2 /nobreak ^>nul
echo     start /B "" venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 ^>logs\backend.log 2^>^&1
echo     timeout /t 8 /nobreak ^>nul
echo     echo 服务已重启！
echo     timeout /t 2 ^>nul
echo     goto :menu
echo ^)
echo if "%%choice%%"=="4" ^(
echo     echo 正在关闭服务...
echo     for /f "tokens=5" %%%%a in ^('netstat -ano ^^^| findstr :8000'^) do taskkill /PID %%%%a /F ^>nul 2^>^&1
echo     exit
echo ^)
echo.
echo goto :menu
) > %PACKAGE_DIR%\皮影互动系统.bat

:: 快捷启动器
(
echo @echo off
echo cd /d "%%~dp0"
echo start "" "皮影互动系统.bat"
) > %PACKAGE_DIR%\启动.bat

:: 停止脚本
(
echo @echo off
echo chcp 65001 ^>nul
echo echo 正在停止皮影互动系统...
echo for /f "tokens=5" %%%%a in ^('netstat -ano ^^^| findstr :8000'^) do taskkill /PID %%%%a /F ^>nul 2^>^&1
echo echo 系统已停止
echo pause
) > %PACKAGE_DIR%\停止系统.bat

echo       启动器创建完成
echo.

:: 步骤 6: 创建说明文档
echo [6/6] 创建说明文档...

(
echo ========================================
echo.
echo     皮影互动系统 使用说明
echo.
echo ========================================
echo.
echo [快速开始]
echo.
echo   1. 双击 "皮影互动系统.bat" 启动程序
echo   2. 等待服务启动（约 8 秒）
echo   3. 在菜单中选择：
echo      - [1] 开始体验：进入互动体验界面
echo      - [2] 管理后台：进入系统配置管理
echo.
echo.
echo [管理员登录]
echo.
echo   网址：http://localhost:8000/admin
echo   账号：admin
echo   密码：admin123
echo.
echo   注意：首次登录后请立即修改密码！
echo.
echo.
echo [系统要求]
echo.
echo   - Windows 10/11 （64位）
echo   - 8GB 内存以上
echo   - 50GB 可用磁盘空间
echo   - 摄像头（用于互动体验）
echo.
echo.
echo [常见问题]
echo.
echo   Q: 启动后浏览器打不开？
echo   A: 手动访问 http://localhost:8000
echo.
echo   Q: 服务无法启动？
echo   A: 检查 8000 端口是否被占用，或查看 logs\backend.log
echo.
echo   Q: 如何停止服务？
echo   A: 运行 "停止系统.bat" 或在菜单选择 [4] 退出
echo.
) > %PACKAGE_DIR%\使用说明.txt

echo       说明文档创建完成
echo.

:: 计算包大小
echo ========================================
echo   打包完成！
echo ========================================
echo.
echo 输出目录: %PACKAGE_DIR%\
echo.
echo 包含文件:
echo   - 皮影互动系统.bat  （主启动器）
echo   - 启动.bat          （快捷启动）
echo   - 停止系统.bat      （停止服务）
echo   - 使用说明.txt      （使用文档）
echo.
echo ========================================
echo   交付方式
echo ========================================
echo.
echo 将 %PACKAGE_DIR% 文件夹压缩后发送给甲方
echo.
echo 甲方使用：
echo   1. 解压文件夹
echo   2. 双击 "皮影互动系统.bat"
echo   3. 选择功能开始使用
echo.
pause
