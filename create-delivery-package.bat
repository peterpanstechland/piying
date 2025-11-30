@echo off
chcp 65001 >nul
echo ========================================
echo Creating Delivery Package
echo ========================================
echo.

set PACKAGE_NAME=ShadowPuppet-Delivery
set PACKAGE_DIR=%PACKAGE_NAME%

echo [1/8] Cleaning old package directory...
if exist %PACKAGE_DIR% rmdir /s /q %PACKAGE_DIR%
if exist %PACKAGE_NAME%.zip del %PACKAGE_NAME%.zip

echo [2/8] 创建目录结构...
mkdir %PACKAGE_DIR%
mkdir %PACKAGE_DIR%\runtime
mkdir %PACKAGE_DIR%\app

echo [3/8] 复制应用文件...
xcopy /E /I /Y backend %PACKAGE_DIR%\app\backend
xcopy /E /I /Y frontend\dist %PACKAGE_DIR%\app\frontend\dist
xcopy /E /I /Y admin-frontend\dist %PACKAGE_DIR%\app\admin-frontend\dist
xcopy /E /I /Y assets %PACKAGE_DIR%\app\assets
xcopy /E /I /Y config %PACKAGE_DIR%\app\config
copy .env.example %PACKAGE_DIR%\app\.env

echo [4/8] 清理不必要的文件...
if exist %PACKAGE_DIR%\app\backend\__pycache__ rmdir /s /q %PACKAGE_DIR%\app\backend\__pycache__
if exist %PACKAGE_DIR%\app\backend\tests rmdir /s /q %PACKAGE_DIR%\app\backend\tests
del /s /q %PACKAGE_DIR%\app\backend\*.pyc 2>nul

echo [5/8] 下载 Python 依赖...
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
    pip download -r backend\requirements.txt -d %PACKAGE_DIR%\runtime\python-packages
) else (
    pip download -r backend\requirements.txt -d %PACKAGE_DIR%\runtime\python-packages
)

echo [6/8] 创建启动脚本...
call :CREATE_INSTALL_SCRIPT
call :CREATE_START_SCRIPT
call :CREATE_STOP_SCRIPT
call :CREATE_README

echo [7/8] 复制文档...
copy USER_MANAGEMENT_GUIDE.md %PACKAGE_DIR%\
copy PASSWORD_RECOVERY_QUICK_GUIDE.md %PACKAGE_DIR%\
copy TROUBLESHOOTING.md %PACKAGE_DIR%\

echo [8/8] 打包...
powershell Compress-Archive -Path %PACKAGE_DIR% -DestinationPath %PACKAGE_NAME%.zip -Force

echo.
echo ========================================
echo 打包完成！
echo Package Created!
echo ========================================
echo.
echo 输出文件: %PACKAGE_NAME%.zip
dir %PACKAGE_NAME%.zip | findstr ".zip"
echo.
echo 交付说明:
echo 1. 将 %PACKAGE_NAME%.zip 交付给甲方
echo 2. 甲方解压后双击 "安装.bat" 进行安装
echo 3. 安装完成后双击 "启动系统.bat" 启动系统
echo 4. 系统会自动打开浏览器
echo.
echo 注意: 需要手动下载并放入 runtime 目录:
echo - Python 3.10+ 安装程序 (python-3.10.11-amd64.exe)
echo - 或使用便携版 Python (WinPython/Portable Python)
echo.
pause
goto :eof

:CREATE_INSTALL_SCRIPT
(
echo @echo off
echo echo ========================================
echo echo 皮影互动系统 - 安装程序
echo echo Shadow Puppet System - Installer
echo echo ========================================
echo echo.
echo.
echo echo [1/5] 检查 Python...
echo python --version ^>nul 2^>^&1
echo if %%errorlevel%% neq 0 ^(
echo     echo [错误] 未找到 Python
echo     echo.
echo     echo 请先安装 Python 3.10+
echo     echo 下载地址: https://www.python.org/downloads/
echo     echo.
echo     echo 或者将 Python 便携版放入 runtime\python 目录
echo     pause
echo     exit /b 1
echo ^)
echo echo [成功] Python 已安装
echo python --version
echo echo.
echo.
echo echo [2/5] 创建虚拟环境...
echo cd app
echo python -m venv venv
echo echo.
echo.
echo echo [3/5] 安装依赖包...
echo call venv\Scripts\activate.bat
echo pip install --no-index --find-links=..\runtime\python-packages -r backend\requirements.txt
echo echo.
echo.
echo echo [4/5] 配置环境...
echo if not exist data mkdir data
echo if not exist data\sessions mkdir data\sessions
echo if not exist data\outputs mkdir data\outputs
echo if not exist data\logs mkdir data\logs
echo echo.
echo.
echo echo [5/5] 创建桌面快捷方式...
echo cd ..
echo echo.
echo.
echo echo ========================================
echo echo 安装完成！
echo echo Installation Complete!
echo echo ========================================
echo echo.
echo echo 下一步:
echo echo 1. 双击 "启动系统.bat" 启动系统
echo echo 2. 系统会自动打开浏览器
echo echo 3. 默认管理员账号: admin / admin123
echo echo.
echo pause
) > %PACKAGE_DIR%\安装.bat
goto :eof

:CREATE_START_SCRIPT
(
echo @echo off
echo title 皮影互动系统
echo echo ========================================
echo echo 皮影互动系统 - 启动中...
echo echo Shadow Puppet System - Starting...
echo echo ========================================
echo echo.
echo.
echo cd app
echo.
echo REM 激活虚拟环境
echo call venv\Scripts\activate.bat
echo.
echo REM 启动后端
echo echo [1/2] 启动后端服务...
echo start /B python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
echo.
echo REM 等待后端启动
echo echo [2/2] 等待服务启动...
echo timeout /t 5 /nobreak ^>nul
echo.
echo REM 打开浏览器
echo echo 正在打开浏览器...
echo start http://localhost:8000
echo.
echo echo.
echo echo ========================================
echo echo 系统已启动！
echo echo System Started!
echo echo ========================================
echo echo.
echo echo 用户界面: http://localhost:8000
echo echo 管理面板: http://localhost:8000/admin
echo echo 默认账号: admin / admin123
echo echo.
echo echo 按任意键关闭此窗口（系统将继续运行）
echo echo 要停止系统，请运行 "停止系统.bat"
echo echo.
echo pause
) > %PACKAGE_DIR%\启动系统.bat
goto :eof

:CREATE_STOP_SCRIPT
(
echo @echo off
echo echo ========================================
echo echo 停止系统...
echo echo Stopping System...
echo echo ========================================
echo echo.
echo.
echo REM 查找并终止 Python 进程
echo for /f "tokens=2" %%%%a in ^('tasklist ^| findstr "python.exe"'^) do ^(
echo     taskkill /PID %%%%a /F ^>nul 2^>^&1
echo ^)
echo.
echo echo 系统已停止
echo echo System Stopped
echo echo.
echo pause
) > %PACKAGE_DIR%\停止系统.bat
goto :eof

:CREATE_README
(
echo # 皮影互动系统 - 使用说明
echo.
echo ## 快速开始
echo.
echo ### 1. 安装
echo 双击 **安装.bat** 进行安装
echo.
echo ### 2. 启动
echo 双击 **启动系统.bat** 启动系统
echo.
echo ### 3. 使用
echo - 用户界面会自动在浏览器中打开
echo - 访问地址: http://localhost:8000
echo - 管理面板: http://localhost:8000/admin
echo - 默认账号: admin / admin123
echo.
echo ### 4. 停止
echo 双击 **停止系统.bat** 停止系统
echo.
echo ## 系统要求
echo.
echo - Windows 10/11 ^(64位^)
echo - 至少 8GB 内存
echo - 至少 50GB 可用磁盘空间
echo - 摄像头
echo - Python 3.10+ ^(安装程序会检查^)
echo.
echo ## 首次使用
echo.
echo 1. 运行安装程序
echo 2. 启动系统
echo 3. 浏览器会自动打开用户界面
echo 4. 如需管理，访问 http://localhost:8000/admin
echo 5. 使用默认账号登录: admin / admin123
echo 6. **立即修改默认密码！**
echo.
echo ## 故障排除
echo.
echo ### Python 未安装
echo - 下载 Python 3.10+: https://www.python.org/downloads/
echo - 安装时勾选 "Add Python to PATH"
echo.
echo ### 端口被占用
echo - 关闭占用 8000 端口的程序
echo - 或修改 app\.env 文件中的端口
echo.
echo ### 摄像头无法访问
echo - 检查浏览器权限
echo - 使用 Chrome 或 Edge 浏览器
echo - 检查摄像头驱动
echo.
echo ## 详细文档
echo.
echo - USER_MANAGEMENT_GUIDE.md - 用户管理指南
echo - PASSWORD_RECOVERY_QUICK_GUIDE.md - 密码恢复指南
echo - TROUBLESHOOTING.md - 故障排除指南
echo.
echo ## 技术支持
echo.
echo 如遇问题，请查看详细文档或联系技术支持。
) > %PACKAGE_DIR%\使用说明.txt
goto :eof
