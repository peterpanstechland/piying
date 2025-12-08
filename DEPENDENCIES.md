# 依赖清单 - Dependencies Checklist

本文档列出了生产环境打包所需的所有依赖。

## ✅ 已处理的依赖

### 1. FFmpeg（视频处理）
- **状态**: ✅ 已配置打包
- **位置**: `electron-app/resources/ffmpeg/`
- **包含文件**:
  - `ffmpeg.exe` - 视频编码工具
  - `ffprobe.exe` - 视频信息探测工具
  - `*.dll` - 必要的动态链接库
- **打包配置**: `electron-app/package.json` 的 `extraResources`
- **准备脚本**: `download-ffmpeg.ps1` 或构建脚本自动检测

### 2. Python 后端依赖
- **状态**: ✅ 已通过 PyInstaller 打包
- **打包方式**: `build-backend-exe.bat` 使用 PyInstaller
- **包含的主要库**:
  - FastAPI, Uvicorn (Web框架)
  - OpenCV (cv2) - 图像/视频处理
  - NumPy - 数值计算
  - Pillow (PIL) - 图像处理
  - SQLAlchemy, aiosqlite - 数据库
  - 其他所有 `requirements.txt` 中的依赖
- **输出位置**: `electron-app/resources/backend/`

### 3. 前端依赖
- **状态**: ✅ 已通过 npm build 打包
- **打包方式**: `npm run build` 生成静态文件
- **输出位置**: 
  - `electron-app/resources/frontend/dist/`
  - `electron-app/resources/admin-frontend/dist/`

### 4. Electron 运行时
- **状态**: ✅ 已通过 electron-builder 打包
- **包含**: Electron 框架本身和所有 Node.js 依赖

## ⚠️ 可选依赖

### ImageMagick（仅构建时）
- **用途**: 图标格式转换（PNG → ICO）
- **状态**: ⚠️ 可选，如果不存在会使用 PNG 作为图标
- **影响**: 不影响运行时功能，只影响安装包图标格式

## 🔍 系统级依赖检查

### Windows 运行时库
生产环境可能需要以下 Windows 运行时库（通常已预装）：

1. **Visual C++ Redistributable**
   - 通常 Windows 10/11 已预装
   - 如果缺失，用户需要安装：
     - [VC++ 2015-2022 Redistributable (x64)](https://aka.ms/vs/17/release/vc_redist.x64.exe)

2. **Windows Media Foundation**
   - Windows 10/11 已内置
   - 用于视频编解码支持

### OpenCV DLL 依赖
OpenCV 的 DLL 应该已经通过 PyInstaller 自动打包，包括：
- `opencv_world*.dll`
- `opencv_videoio_ffmpeg*.dll`
- 其他 OpenCV 相关 DLL

## 📋 依赖验证清单

构建完成后，请验证以下文件存在：

```
electron-app/resources/
├── backend/
│   ├── backend.exe
│   └── _internal/          # PyInstaller 打包的所有依赖
│       ├── cv2/             # OpenCV
│       ├── numpy/           # NumPy
│       └── ...
├── ffmpeg/
│   ├── ffmpeg.exe
│   ├── ffprobe.exe
│   └── *.dll
├── frontend/dist/           # 前端静态文件
├── admin-frontend/dist/     # 管理后台静态文件
├── data/                    # 初始数据
├── assets/                  # 资源文件
└── config/                  # 配置文件
```

## 🚨 常见问题

### 问题1: FFmpeg 未找到
**症状**: 视频生成失败，错误信息 "FFmpeg not found"

**解决方案**:
1. 运行 `.\download-ffmpeg.ps1` 下载 FFmpeg
2. 或手动将 FFmpeg 复制到 `electron-app/resources/ffmpeg/`
3. 确保包含所有 DLL 文件

### 问题2: OpenCV DLL 缺失
**症状**: 后端启动失败，错误信息 "DLL load failed"

**解决方案**:
1. 检查 PyInstaller 是否正确打包了 OpenCV
2. 确保 `backend.spec` 包含了所有必要的 hidden imports
3. 如果问题持续，可能需要手动添加 OpenCV DLL 到 `extraResources`

### 问题3: Visual C++ Runtime 缺失
**症状**: 应用无法启动，提示缺少 DLL

**解决方案**:
1. 在安装包中包含 VC++ Redistributable 安装程序
2. 或在安装说明中要求用户安装

## 📝 构建后检查

运行以下命令验证所有依赖：

```powershell
# 检查 FFmpeg
Test-Path "electron-app\resources\ffmpeg\ffmpeg.exe"
Test-Path "electron-app\resources\ffmpeg\ffprobe.exe"

# 检查后端
Test-Path "electron-app\resources\backend\backend.exe"

# 检查前端
Test-Path "electron-app\resources\frontend\dist\index.html"
Test-Path "electron-app\resources\admin-frontend\dist\index.html"
```

## 🔄 更新依赖

### 更新 Python 依赖
1. 修改 `backend/requirements.txt`
2. 重新运行 `build-backend-exe.bat`

### 更新 FFmpeg
1. 删除 `electron-app/resources/ffmpeg/`
2. 运行 `.\download-ffmpeg.ps1` 或手动更新

### 更新前端依赖
1. 修改 `frontend/package.json` 或 `admin-frontend/package.json`
2. 重新运行构建脚本（会自动重新构建前端）
