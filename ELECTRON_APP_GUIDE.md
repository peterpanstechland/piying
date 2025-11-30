# Electron 桌面应用打包方案

## 概述

将皮影互动系统打包成独立的桌面应用程序（.exe），就像游戏一样：
- ✅ 双击 EXE 启动
- ✅ 自动启动后端
- ✅ 自动打开前端
- ✅ 无需配置环境
- ✅ 专业的安装程序

## 方案对比

### 方案 A: Electron + Python 后端（推荐）

**优点**:
- 完整的桌面应用体验
- 自动管理后端进程
- 可以打包成单个安装程序
- 支持自动更新
- 专业的图标和界面

**缺点**:
- 包体积较大（~200-300MB）
- 需要学习 Electron

### 方案 B: PyInstaller 打包（简单）

**优点**:
- 纯 Python 方案
- 打包简单
- 包体积较小

**缺点**:
- 界面不如 Electron 专业
- 需要额外处理前端

### 方案 C: NSIS 安装程序（最简单）

**优点**:
- 专业的安装向导
- 创建桌面快捷方式
- 注册表集成
- 卸载程序

**缺点**:
- 仍需要批处理脚本
- 不是单个 EXE

## 推荐方案：Electron 桌面应用

### 项目结构

```
electron-app/
├── package.json
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── renderer/            # 渲染进程（前端）
├── python-backend/      # Python 后端
│   ├── backend/
│   ├── venv/
│   └── start.py
├── assets/
│   ├── icon.ico        # 应用图标
│   └── splash.png      # 启动画面
└── build/              # 构建配置
    ├── icon.ico
    └── installer.nsh
```

### 实现步骤

#### 1. 创建 Electron 项目

```bash
mkdir electron-app
cd electron-app
npm init -y
npm install electron electron-builder --save-dev
```

#### 2. 创建主进程文件

见下方 `main.js` 文件

#### 3. 配置 package.json

见下方配置

#### 4. 打包命令

```bash
# 开发模式
npm start

# 打包 Windows 版本
npm run build:win

# 打包所有平台
npm run build
```

### 输出结果

```
dist/
├── ShadowPuppet-Setup-1.0.0.exe    # 安装程序（推荐）
└── ShadowPuppet-1.0.0-win.zip      # 便携版
```

## 详细实现

### 文件清单

1. `electron-app/package.json` - 项目配置
2. `electron-app/main.js` - Electron 主进程
3. `electron-app/preload.js` - 预加载脚本
4. `electron-app/start-backend.js` - 后端启动脚本
5. `electron-app/build-electron.bat` - 构建脚本

### 特性

- ✅ 启动画面（Splash Screen）
- ✅ 系统托盘图标
- ✅ 自动启动后端
- ✅ 自动打开前端
- ✅ 优雅退出（自动关闭后端）
- ✅ 错误处理和日志
- ✅ 自动更新支持
- ✅ 开机自启动选项

### 用户体验

```
1. 双击 ShadowPuppet.exe
2. 显示启动画面
3. 后台启动 Python 后端
4. 自动打开前端界面
5. 开始使用！
```

### 安装程序特性

- 选择安装位置
- 创建桌面快捷方式
- 创建开始菜单项
- 添加到系统路径
- 卸载程序
- 安装进度显示

## 替代方案：NSIS 安装程序

如果不想使用 Electron，可以使用 NSIS 创建专业的安装程序。

### 优点

- 更小的体积
- 更快的启动速度
- 专业的安装向导
- 广泛使用（很多软件都用）

### 实现

见下方 `installer.nsi` 文件

## 最简单方案：批处理转 EXE

使用 Bat to Exe Converter 将批处理文件转换为 EXE。

### 工具

- Bat to Exe Converter: http://www.f2ko.de/en/b2e.php
- Advanced BAT to EXE Converter: https://www.battoexeconverter.com/

### 步骤

1. 下载工具
2. 导入 `启动系统.bat`
3. 设置图标
4. 转换为 EXE

### 优点

- 最简单
- 无需编程
- 快速实现

### 缺点

- 功能有限
- 不够专业
- 可能被杀毒软件误报

## 推荐实施方案

### 短期方案（1-2天）

使用 **NSIS 安装程序**：
- 创建专业的安装向导
- 自动创建快捷方式
- 包含卸载程序
- 体积小，速度快

### 长期方案（1周）

使用 **Electron 桌面应用**：
- 完整的桌面应用体验
- 自动管理后端进程
- 支持自动更新
- 更专业的用户体验

## 下一步

我可以为你创建：

1. **Electron 完整项目** - 包含所有必要文件
2. **NSIS 安装脚本** - 创建专业安装程序
3. **PyInstaller 打包脚本** - 将 Python 打包成 EXE
4. **批处理转 EXE 指南** - 最简单的方案

你想要哪个方案？我推荐从 **NSIS 安装程序**开始，因为它最快实现且效果专业。
