# Electron 打包快速修复指南

## 问题 1: Pydantic 版本找不到

### 原因
Python 环境无法找到 pydantic 2.9.0

### 解决方案 A: 使用现有 venv（推荐）

```bash
# 使用简化脚本，直接复制现有的 venv
prepare-electron-simple.bat
```

这个脚本会直接复制你项目根目录的 `venv`，避免重新安装。

### 解决方案 B: 手动安装

```bash
cd electron-app\python-backend
python -m venv venv
venv\Scripts\activate
python -m pip install --upgrade pip
pip install fastapi uvicorn[standard] pydantic opencv-python mediapipe sqlalchemy aiosqlite bcrypt python-jose apscheduler python-multipart
```

### 解决方案 C: 不指定版本

修改 `backend/requirements.txt`，去掉版本号：
```
fastapi
uvicorn[standard]
pydantic
opencv-python
...
```

## 问题 2: npm install 卡住

### 原因
- 网络问题
- 依赖冲突
- npm 缓存问题

### 解决方案 A: 使用淘宝镜像

```bash
npm config set registry https://registry.npmmirror.com
npm install --legacy-peer-deps
```

### 解决方案 B: 清理缓存

```bash
npm cache clean --force
npm install --legacy-peer-deps
```

### 解决方案 C: 手动中断并重试

```bash
# 按 Ctrl+C 中断
# 然后重新运行
npm install --legacy-peer-deps
```

### 解决方案 D: 跳过可选依赖

```bash
npm install --legacy-peer-deps --no-optional
```

## 快速解决方案（推荐）

### 步骤 1: 使用简化脚本

```bash
prepare-electron-simple.bat
```

这个脚本会：
- ✅ 复制现有的 venv（不重新安装）
- ✅ 使用 --legacy-peer-deps 避免冲突
- ✅ 更快更稳定

### 步骤 2: 如果 npm 卡住

按 `Ctrl+C` 中断，然后：

```bash
cd electron-app
npm cache clean --force
npm install --legacy-peer-deps
```

### 步骤 3: 测试

```bash
cd electron-app
npm start
```

### 步骤 4: 打包

```bash
npm run build:win
```

## 完全手动方案

如果自动脚本都失败，手动操作：

### 1. 创建目录

```bash
mkdir electron-app\python-backend
mkdir electron-app\build
```

### 2. 复制文件

```bash
xcopy /E /I backend electron-app\python-backend\backend
xcopy /E /I frontend\dist electron-app\python-backend\frontend\dist
xcopy /E /I admin-frontend\dist electron-app\python-backend\admin-frontend\dist
xcopy /E /I assets electron-app\python-backend\assets
xcopy /E /I config electron-app\python-backend\config
xcopy /E /I venv electron-app\python-backend\venv
copy .env electron-app\python-backend\.env
```

### 3. 安装 Node.js 依赖

```bash
cd electron-app
npm install electron electron-builder --save-dev --legacy-peer-deps
```

### 4. 测试

```bash
npm start
```

## 最简单方案：不用 Electron

如果 Electron 太复杂，使用更简单的方案：

### 方案 1: 批处理转 EXE

使用工具将 `启动系统.bat` 转换为 EXE：
- Bat to Exe Converter: http://www.f2ko.de/en/b2e.php

### 方案 2: PyInstaller

将 Python 后端打包成 EXE：

```bash
pip install pyinstaller
pyinstaller --onefile --windowed start_backend.py
```

### 方案 3: NSIS 安装程序

创建专业的安装向导，但仍使用批处理脚本。

## 推荐流程

1. **先试简化脚本**: `prepare-electron-simple.bat`
2. **如果失败**: 手动复制文件
3. **如果还失败**: 考虑更简单的方案

## 常见错误

### Error: Cannot find module 'electron'

```bash
cd electron-app
npm install electron --save-dev
```

### Error: Python not found

检查路径：
```bash
cd electron-app\python-backend
dir venv\Scripts\python.exe
```

### Error: Port 8000 already in use

关闭其他后端进程：
```bash
netstat -ano | findstr :8000
taskkill /PID [进程ID] /F
```

## 获取帮助

如果所有方法都失败：

1. 检查 Python 版本: `python --version` (需要 3.10+)
2. 检查 Node.js 版本: `node --version` (需要 18+)
3. 检查网络连接
4. 查看错误日志
5. 考虑使用更简单的交付方案

## 时间估算

- 简化脚本: 5-10 分钟
- 手动操作: 15-20 分钟
- 完全重装: 30-60 分钟

选择最适合你的方案！
