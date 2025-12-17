# 调试指南 - 开发环境 vs 生产环境

本文档说明如何查看日志、调试问题，以及开发环境和生产环境的主要差异。

## 📋 如何查看日志

### 方法 1: 浏览器开发者工具（前端日志）

#### 在 Electron 应用中打开 DevTools：

1. **使用启动器的按钮**（推荐）：
   - 打开应用启动器
   - 点击底部 **"🔧 开发者工具"** 按钮
   - DevTools 窗口会自动打开

2. **使用快捷键**：
   - 在 Electron 窗口中按 `F12` 或 `Ctrl+Shift+I`（Windows/Linux）
   - 或 `Cmd+Option+I`（Mac）

3. **查看控制台日志**：
   - 打开 DevTools 后，点击 **"Console"**（控制台）标签页
   - 所有 `console.log()`、`console.error()` 等日志都会显示在这里
   - 日志会带有 `[CoverImageManager]`、`[API]`、`[StorylineEditor]` 等前缀，方便过滤

#### 过滤特定日志：
- 在控制台顶部的过滤框中输入关键词，例如：
  - `[CoverImageManager]` - 查看封面图片管理相关日志
  - `[API]` - 查看 API 调用日志
  - `[ERROR]` - 只查看错误日志

### 方法 2: 后端日志文件

#### 打开日志文件夹：

1. **使用启动器的按钮**（推荐）：
   - 打开应用启动器
   - 点击底部 **"📋 查看日志"** 按钮
   - 系统会自动打开日志文件夹

2. **手动打开**：
   - Windows: 在资源管理器中导航到 `%APPDATA%\RobomonPiying\data\logs\`
   - 打开 `app.log` 文件查看后端日志

#### 查看后端日志：
- 使用文本编辑器（如 Notepad++、VS Code）打开 `app.log`
- 搜索关键词：
  - `[DEBUG] capture_frame_as_cover` - 查看截图相关日志
  - `[ERROR]` - 查看所有错误
  - `upload_cover_image` - 查看上传相关日志

### 方法 3: Electron 主进程日志

**位置：**
- Windows: `%APPDATA%\皮影互动系统\logs\main.log`
- 或：`%APPDATA%\RobomonPiying\logs\main.log`

**内容：**
- Electron 主进程启动、窗口管理等日志
- 后端进程启动和关闭日志

## 🔍 调试截图功能问题

### 步骤 1: 打开前端 DevTools
1. 在管理后台页面按 `F12` 打开 DevTools
2. 切换到 **Console** 标签页

### 步骤 2: 尝试截图操作
1. 点击 **"截取当前帧"** 按钮
2. 观察控制台输出

### 步骤 3: 查看日志输出

**正常情况应该看到：**
```
[CoverImageManager] Starting frame capture: {storylineId: "...", timestamp: 0, ...}
[API] captureCoverFromVideo request: {storylineId: "...", timestamp: 0, ...}
[API] captureCoverFromVideo success: {message: "...", cover_image: {...}}
[StorylineEditor] Capture successful: {...}
```

**如果出错，会看到：**
```
[CoverImageManager] Failed to capture frame: Error: ...
[API] captureCoverFromVideo error: {message: "...", response: {...}, status: 400}
[StorylineEditor] Capture failed: ...
```

### 步骤 4: 查看后端日志
1. 打开后端日志文件：`%APPDATA%\RobomonPiying\data\logs\app.log`
2. 搜索最新的 `[DEBUG] capture_frame_as_cover` 或 `[ERROR]` 条目
3. 查看详细的错误信息

## 🔄 开发环境 vs 生产环境差异

### 主要差异

| 特性 | 开发环境 | 生产环境（Electron） |
|------|---------|---------------------|
| **前端代码** | 未打包的源代码（`src/`） | 打包后的静态文件（`dist/`） |
| **后端** | Python 直接运行（`python run.py`） | PyInstaller 打包的可执行文件（`backend.exe`） |
| **路径解析** | 项目根目录相对路径 | 用户数据目录（`%APPDATA%\RobomonPiying\data\`） |
| **日志输出** | 控制台直接输出 | 写入日志文件 |
| **DevTools** | 默认打开 | 需要手动打开（F12 或按钮） |
| **热重载** | 支持（Vite HMR） | 不支持，需要重新构建 |
| **错误提示** | 详细的堆栈信息 | 简化的错误消息 |

### 为什么会出现差异？

1. **打包过程**：
   - 开发环境：源代码直接运行，路径解析基于项目目录
   - 生产环境：代码被打包，路径解析基于用户数据目录

2. **文件系统权限**：
   - 开发环境：通常有完整的文件系统访问权限
   - 生产环境：可能受到 Windows 安全策略限制

3. **依赖项**：
   - 开发环境：使用系统安装的 Python、FFmpeg 等
   - 生产环境：使用打包的依赖（`backend.exe`、`ffmpeg.exe`）

4. **环境变量**：
   - 开发环境：使用开发时的环境变量
   - 生产环境：可能缺少某些环境变量

### 常见问题

#### 问题 1: 截图功能在开发环境正常，生产环境失败

**可能原因：**
- OpenCV DLL 缺失或路径不正确
- 文件系统权限不足
- 用户数据目录不存在或不可写

**解决方法：**
1. 查看后端日志：`%APPDATA%\RobomonPiying\data\logs\app.log`
2. 检查错误信息，常见错误：
   - `Failed to create output directory` - 目录权限问题
   - `Video file not found` - 视频路径不正确
   - `Failed to write temp frame` - OpenCV 或文件系统问题

#### 问题 2: 前端显示"成功"但实际未保存

**可能原因：**
- 前端 API 调用成功，但后端保存失败
- 数据库更新失败
- 文件写入失败但未抛出异常

**解决方法：**
1. 查看前端控制台：检查是否有 `[ERROR]` 日志
2. 查看后端日志：检查文件写入和数据库操作
3. 检查用户数据目录权限

#### 问题 3: 路径问题

**开发环境路径：**
```
项目根目录/backend/data/storylines/...
```

**生产环境路径：**
```
%APPDATA%/RobomonPiying/data/storylines/...
```

**解决方法：**
- 代码中已使用 `get_user_data_dir()` 统一处理路径
- 如果仍有问题，检查 `backend/app/utils/path.py`

## 🛠️ 调试技巧

### 1. 启用详细日志

前端日志已经自动记录，包括：
- `[CoverImageManager]` - 封面图片管理组件日志
- `[API]` - API 调用日志
- `[StorylineEditor]` - 故事线编辑页面日志

后端日志已启用 DEBUG 级别，包括：
- `[DEBUG] capture_frame_as_cover` - 截图功能详细日志
- `[ERROR]` - 所有错误和异常

### 2. 使用浏览器网络面板

1. 打开 DevTools
2. 切换到 **Network**（网络）标签页
3. 尝试截图操作
4. 查看 API 请求：
   - 请求 URL: `/api/admin/storylines/{id}/cover/capture`
   - 请求参数: `timestamp=0`
   - 响应状态码和内容

### 3. 检查文件系统

1. 打开日志文件夹：`%APPDATA%\RobomonPiying\data\logs\`
2. 检查故事线目录：`%APPDATA%\RobomonPiying\data\storylines\{storyline_id}\`
3. 查看是否生成了封面图片文件：
   - `cover_original.jpg`
   - `cover_thumbnail.jpg`
   - `cover_medium.jpg`
   - `cover_large.jpg`

## 📝 快速检查清单

当遇到问题时，按以下顺序检查：

1. ✅ **前端控制台**：打开 DevTools，查看是否有 JavaScript 错误
2. ✅ **网络请求**：在 Network 面板查看 API 请求是否成功（状态码 200）
3. ✅ **后端日志**：查看 `app.log` 文件，搜索 `[ERROR]` 和 `[DEBUG]`
4. ✅ **文件系统**：检查用户数据目录是否存在且有写入权限
5. ✅ **文件生成**：检查封面图片文件是否实际创建

## 💡 提示

- **开发环境测试**：在开发环境先测试功能，确保基本逻辑正确
- **生产环境验证**：在生产环境验证路径、权限等问题
- **日志是关键**：遇到问题时，首先查看日志，而不是猜测
- **逐步调试**：从最简单的操作开始，逐步排查问题

## 🔗 相关文档

- [LOGS_GUIDE.md](./LOGS_GUIDE.md) - 详细的日志查看指南
- [DEPENDENCIES.md](./DEPENDENCIES.md) - 依赖项说明








