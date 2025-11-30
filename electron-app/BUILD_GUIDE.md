# Electron 应用构建指南

## 快速开始

### 1. 准备工作

```bash
# 安装 Node.js 18+
# 下载: https://nodejs.org/

# 进入 electron-app 目录
cd electron-app

# 安装依赖
npm install
```

### 2. 准备 Python 后端

```bash
# 复制后端文件到 electron-app/python-backend/
# 目录结构:
electron-app/
└── python-backend/
    ├── backend/
    ├── frontend/dist/
    ├── admin-frontend/dist/
    ├── assets/
    ├── config/
    ├── venv/
    └── .env
```

### 3. 测试运行

```bash
# 开发模式运行
npm start
```

### 4. 打包应用

```bash
# 打包 Windows 版本
npm run build:win

# 输出文件在 dist/ 目录:
# - ShadowPuppet-Setup-1.0.0.exe (安装程序)
# - ShadowPuppet-Portable-1.0.0.exe (便携版)
```

## 详细步骤

### 步骤 1: 安装依赖

```bash
cd electron-app
npm install
```

这会安装:
- electron (桌面应用框架)
- electron-builder (打包工具)

### 步骤 2: 准备后端

#### 方法 A: 自动脚本（推荐）

创建 `prepare-backend.bat`:

```batch
@echo off
echo Preparing Python backend...

REM 创建目录
if not exist python-backend mkdir python-backend

REM 复制文件
xcopy /E /I /Y ..\backend python-backend\backend
xcopy /E /I /Y ..\frontend\dist python-backend\frontend\dist
xcopy /E /I /Y ..\admin-frontend\dist python-backend\admin-frontend\dist
xcopy /E /I /Y ..\assets python-backend\assets
xcopy /E /I /Y ..\config python-backend\config
copy ..\env python-backend\.env

REM 创建虚拟环境
cd python-backend
python -m venv venv
call venv\Scripts\activate.bat
pip install -r ..\backend\requirements.txt

echo Backend prepared!
pause
```

运行: `prepare-backend.bat`

#### 方法 B: 手动复制

1. 创建 `python-backend` 目录
2. 复制以下文件:
   - `backend/` → `python-backend/backend/`
   - `frontend/dist/` → `python-backend/frontend/dist/`
   - `admin-frontend/dist/` → `python-backend/admin-frontend/dist/`
   - `assets/` → `python-backend/assets/`
   - `config/` → `python-backend/config/`
   - `.env` → `python-backend/.env`
3. 创建虚拟环境并安装依赖

### 步骤 3: 准备图标

1. 创建 `build` 目录
2. 准备图标文件:
   - `build/icon.ico` (256x256, Windows 图标)
   - `build/icon.png` (512x512, macOS/Linux 图标)

可以使用在线工具转换:
- https://www.icoconverter.com/
- https://convertio.co/png-ico/

### 步骤 4: 测试应用

```bash
npm start
```

应该看到:
1. 启动画面
2. 后端启动日志
3. 自动打开前端界面

### 步骤 5: 打包应用

```bash
# Windows 安装程序 + 便携版
npm run build:win

# 仅安装程序
npm run build:win -- --config.win.target=nsis

# 仅便携版
npm run build:win -- --config.win.target=portable
```

### 步骤 6: 测试安装程序

1. 找到 `dist/ShadowPuppet-Setup-1.0.0.exe`
2. 双击运行
3. 按照向导安装
4. 测试应用功能

## 输出文件说明

### 安装程序 (NSIS)

```
ShadowPuppet-Setup-1.0.0.exe
大小: ~200-300MB
特点:
- 安装向导
- 选择安装位置
- 创建桌面快捷方式
- 创建开始菜单项
- 卸载程序
```

### 便携版 (Portable)

```
ShadowPuppet-Portable-1.0.0.exe
大小: ~200-300MB
特点:
- 单个 EXE 文件
- 无需安装
- 解压即用
- 适合 USB 运行
```

## 自定义配置

### 修改应用名称

编辑 `package.json`:

```json
{
  "name": "your-app-name",
  "productName": "Your App Name",
  "description": "Your app description"
}
```

### 修改版本号

编辑 `package.json`:

```json
{
  "version": "1.0.0"
}
```

### 修改图标

替换 `build/icon.ico` 和 `build/icon.png`

### 修改启动画面

编辑 `splash.html`

### 修改安装程序选项

编辑 `package.json` 的 `build.nsis` 部分:

```json
{
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "installerIcon": "build/icon.ico",
    "uninstallerIcon": "build/icon.ico",
    "license": "LICENSE.txt"
  }
}
```

## 高级功能

### 添加自动更新

1. 安装依赖:
```bash
npm install electron-updater --save
```

2. 在 `main.js` 中添加:
```javascript
const { autoUpdater } = require('electron-updater');

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

### 添加崩溃报告

1. 安装依赖:
```bash
npm install @sentry/electron --save
```

2. 配置 Sentry

### 添加应用菜单

在 `main.js` 中添加:
```javascript
const { Menu } = require('electron');

const template = [
  {
    label: 'File',
    submenu: [
      { role: 'quit' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'toggleDevTools' }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
```

## 故障排除

### 问题 1: 后端启动失败

**原因**: Python 路径不正确

**解决**:
1. 检查 `python-backend/venv/Scripts/python.exe` 是否存在
2. 检查 `main.js` 中的路径配置

### 问题 2: 打包失败

**原因**: 文件过大或路径问题

**解决**:
1. 检查 `package.json` 的 `files` 配置
2. 排除不必要的文件（测试、文档等）
3. 使用 `.gitignore` 排除文件

### 问题 3: 安装程序无法运行

**原因**: 缺少依赖或权限问题

**解决**:
1. 以管理员身份运行
2. 检查杀毒软件是否拦截
3. 查看安装日志

### 问题 4: 应用启动慢

**原因**: 后端启动需要时间

**解决**:
1. 增加启动画面显示时间
2. 优化后端启动速度
3. 使用预编译的 Python

## 优化建议

### 减小包体积

1. 排除不必要的文件:
```json
{
  "files": [
    "!**/__pycache__",
    "!**/tests",
    "!**/*.pyc",
    "!**/*.log"
  ]
}
```

2. 使用 Python 嵌入式版本
3. 压缩资源文件

### 提升启动速度

1. 使用 Python 预编译
2. 延迟加载非关键模块
3. 优化启动画面

### 提升用户体验

1. 添加进度提示
2. 添加错误处理
3. 添加日志记录
4. 添加系统托盘

## 发布清单

- [ ] 测试所有功能
- [ ] 更新版本号
- [ ] 更新图标
- [ ] 更新启动画面
- [ ] 测试安装程序
- [ ] 测试便携版
- [ ] 准备发布说明
- [ ] 创建用户手册
- [ ] 准备技术支持文档

## 交付给甲方

### 交付文件

1. `ShadowPuppet-Setup-1.0.0.exe` - 安装程序
2. `ShadowPuppet-Portable-1.0.0.exe` - 便携版
3. `用户手册.pdf` - 使用说明
4. `安装指南.pdf` - 安装步骤

### 使用说明

**安装版**:
1. 双击 `ShadowPuppet-Setup-1.0.0.exe`
2. 按照向导完成安装
3. 双击桌面图标启动

**便携版**:
1. 双击 `ShadowPuppet-Portable-1.0.0.exe`
2. 直接运行，无需安装

### 优点

- ✅ 专业的桌面应用
- ✅ 双击即可运行
- ✅ 自动管理后端
- ✅ 无需配置环境
- ✅ 支持自动更新
- ✅ 完整的安装/卸载

## 总结

使用 Electron 打包后，甲方只需要:
1. 双击 EXE 文件
2. 等待启动
3. 开始使用

就像使用游戏一样简单！
