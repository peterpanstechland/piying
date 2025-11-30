@echo off
echo ========================================
echo 创建离线部署包
echo Creating Offline Deployment Package
echo ========================================
echo.

set PACKAGE_NAME=shadow-puppet-offline-package
set PACKAGE_DIR=%PACKAGE_NAME%

echo 1. 清理旧的打包目录...
if exist %PACKAGE_DIR% rmdir /s /q %PACKAGE_DIR%
if exist %PACKAGE_NAME%.zip del %PACKAGE_NAME%.zip

echo 2. 创建打包目录结构...
mkdir %PACKAGE_DIR%
mkdir %PACKAGE_DIR%\installers
mkdir %PACKAGE_DIR%\dependencies

echo 3. 复制项目文件...
echo    - 复制源代码...
xcopy /E /I /Y frontend %PACKAGE_DIR%\frontend
xcopy /E /I /Y admin-frontend %PACKAGE_DIR%\admin-frontend
xcopy /E /I /Y backend %PACKAGE_DIR%\backend
xcopy /E /I /Y assets %PACKAGE_DIR%\assets
xcopy /E /I /Y config %PACKAGE_DIR%\config

echo    - 复制脚本和配置...
copy *.bat %PACKAGE_DIR%\
copy *.sh %PACKAGE_DIR%\
copy *.py %PACKAGE_DIR%\
copy .env.example %PACKAGE_DIR%\
copy requirements.txt %PACKAGE_DIR%\

echo    - 复制文档...
copy *.md %PACKAGE_DIR%\

echo 4. 清理不必要的文件...
if exist %PACKAGE_DIR%\frontend\node_modules rmdir /s /q %PACKAGE_DIR%\frontend\node_modules
if exist %PACKAGE_DIR%\admin-frontend\node_modules rmdir /s /q %PACKAGE_DIR%\admin-frontend\node_modules
if exist %PACKAGE_DIR%\backend\__pycache__ rmdir /s /q %PACKAGE_DIR%\backend\__pycache__
if exist %PACKAGE_DIR%\venv rmdir /s /q %PACKAGE_DIR%\venv

echo 5. 下载 Python 依赖包（离线安装用）...
echo    这可能需要几分钟...
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
    pip download -r backend\requirements.txt -d %PACKAGE_DIR%\dependencies\python
) else (
    pip download -r backend\requirements.txt -d %PACKAGE_DIR%\dependencies\python
)

echo 6. 创建离线安装说明...
(
echo # 离线部署安装说明
echo.
echo ## 系统要求
echo - Windows 10/11 或 Linux
echo - 至少 8GB RAM
echo - 至少 50GB 可用磁盘空间
echo - 摄像头
echo.
echo ## 安装步骤
echo.
echo ### 1. 安装 Python 3.10+
echo 从 installers 目录安装 Python，或从官网下载：
echo https://www.python.org/downloads/
echo.
echo ### 2. 安装 Node.js 18+
echo 从 installers 目录安装 Node.js，或从官网下载：
echo https://nodejs.org/
echo.
echo ### 3. 安装 Python 依赖（离线）
echo ```bash
echo # Windows
echo python -m venv venv
echo venv\Scripts\activate
echo pip install --no-index --find-links=dependencies\python -r requirements.txt
echo.
echo # Linux
echo python3 -m venv venv
echo source venv/bin/activate
echo pip install --no-index --find-links=dependencies/python -r requirements.txt
echo ```
echo.
echo ### 4. 安装前端依赖
echo 需要联网一次，或提前准备 node_modules 离线包
echo ```bash
echo cd frontend
echo npm install
echo cd ../admin-frontend
echo npm install
echo cd ..
echo ```
echo.
echo ### 5. 构建前端
echo ```bash
echo build-all.bat  # Windows
echo ./build-all.sh  # Linux
echo ```
echo.
echo ### 6. 配置环境
echo ```bash
echo copy .env.example .env
echo # 编辑 .env 文件，设置正确的 IP 地址
echo ```
echo.
echo ### 7. 启动系统
echo ```bash
echo start-production.bat  # Windows
echo ./start-production.sh  # Linux
echo ```
echo.
echo ### 8. 访问系统
echo - 用户界面: http://localhost:8000
echo - 管理面板: http://localhost:8000/admin
echo - 默认账号: admin / admin123
echo.
echo ## 详细文档
echo - QUICKSTART_DEPLOYMENT.md - 快速部署指南
echo - DEPLOYMENT.md - 完整部署文档
echo - USER_MANAGEMENT_GUIDE.md - 用户管理指南
echo - PASSWORD_RECOVERY_QUICK_GUIDE.md - 密码恢复指南
) > %PACKAGE_DIR%\OFFLINE_INSTALL.md

echo 7. 创建快速安装脚本...
(
echo @echo off
echo echo ========================================
echo echo 皮影互动系统 - 快速安装
echo echo Shadow Puppet System - Quick Install
echo echo ========================================
echo echo.
echo.
echo echo 1. 检查 Python...
echo python --version ^>nul 2^>^&1
echo if %%errorlevel%% neq 0 ^(
echo     echo [错误] 未找到 Python，请先安装 Python 3.10+
echo     echo [Error] Python not found, please install Python 3.10+
echo     pause
echo     exit /b 1
echo ^)
echo echo [成功] Python 已安装
echo echo.
echo.
echo echo 2. 检查 Node.js...
echo node --version ^>nul 2^>^&1
echo if %%errorlevel%% neq 0 ^(
echo     echo [错误] 未找到 Node.js，请先安装 Node.js 18+
echo     echo [Error] Node.js not found, please install Node.js 18+
echo     pause
echo     exit /b 1
echo ^)
echo echo [成功] Node.js 已安装
echo echo.
echo.
echo echo 3. 创建 Python 虚拟环境...
echo python -m venv venv
echo echo.
echo.
echo echo 4. 安装 Python 依赖（离线）...
echo call venv\Scripts\activate.bat
echo pip install --no-index --find-links=dependencies\python -r requirements.txt
echo echo.
echo.
echo echo 5. 复制环境配置...
echo if not exist .env copy .env.example .env
echo echo.
echo.
echo echo ========================================
echo echo 安装完成！
echo echo Installation Complete!
echo echo ========================================
echo echo.
echo echo 下一步：
echo echo 1. 编辑 .env 文件，设置正确的 IP 地址
echo echo 2. 运行 build-all.bat 构建前端
echo echo 3. 运行 start-production.bat 启动系统
echo echo.
echo pause
) > %PACKAGE_DIR%\quick-install.bat

echo 8. 打包成 ZIP 文件...
echo    注意：需要安装 7-Zip 或使用 Windows 内置压缩
powershell Compress-Archive -Path %PACKAGE_DIR% -DestinationPath %PACKAGE_NAME%.zip -Force

echo.
echo ========================================
echo 打包完成！
echo Package Created!
echo ========================================
echo.
echo 输出文件: %PACKAGE_NAME%.zip
echo 大小: 
dir %PACKAGE_NAME%.zip | findstr ".zip"
echo.
echo 下一步：
echo 1. 将 %PACKAGE_NAME%.zip 复制到目标设备
echo 2. 解压缩
echo 3. 阅读 OFFLINE_INSTALL.md
echo 4. 运行 quick-install.bat
echo.
pause
