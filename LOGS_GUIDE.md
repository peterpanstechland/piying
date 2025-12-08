# 日志查看指南

本文档说明如何查看应用程序的日志文件，以便调试和排查问题。

## 📋 日志文件位置

### 1. Electron 主进程日志

**位置：**
- Windows: `%APPDATA%\皮影互动系统\logs\main.log` 或 `%APPDATA%\RobomonPiying\logs\main.log`
- 完整路径示例: `C:\Users\<用户名>\AppData\Roaming\皮影互动系统\logs\main.log`

**内容：**
- Electron 主进程的启动、关闭、窗口管理等日志
- 后端进程的启动和关闭日志
- IPC 通信日志

**查看方式：**
- 使用启动器中的 **"📋 查看日志"** 按钮（会自动打开日志文件夹）
- 或手动导航到上述路径

### 2. Python 后端日志

**位置：**
- Windows: `%APPDATA%\RobomonPiying\data\logs\app.log`
- 完整路径示例: `C:\Users\<用户名>\AppData\Roaming\RobomonPiying\data\logs\app.log`

**内容：**
- API 请求和响应日志
- 数据库操作日志
- 业务逻辑错误日志
- 文件操作日志（包括截图、上传等功能）
- 所有 `[DEBUG]`、`[ERROR]`、`[WARNING]` 标记的日志

**查看方式：**
- 使用启动器中的 **"📋 查看日志"** 按钮
- 或手动导航到上述路径

## 🔍 如何查看日志

### 方法 1: 使用启动器的"查看日志"按钮（推荐）

1. 打开应用启动器
2. 点击底部工具栏的 **"📋 查看日志"** 按钮
3. 系统会自动打开日志文件夹（Windows 资源管理器）

### 方法 2: 手动打开日志文件夹

**Windows:**
1. 按 `Win + R` 打开运行对话框
2. 输入 `%APPDATA%\RobomonPiying\data\logs` 并按回车
3. 或输入 `%APPDATA%\皮影互动系统\logs` 查看 Electron 日志

### 方法 3: 使用开发者工具查看实时日志

1. 在启动器中点击 **"🔧 开发者工具"** 按钮
2. 打开 DevTools 控制台（Console 标签页）
3. 可以看到前端的 JavaScript 日志和错误

**注意：** 后端 Python 日志不会显示在浏览器 DevTools 中，需要查看日志文件。

## 🐛 常见问题排查

### 问题：无法上传/保存故事封面图片

**查看日志：**
1. 打开后端日志文件：`%APPDATA%\RobomonPiying\data\logs\app.log`
2. 搜索关键词：`[ERROR]`、`[DEBUG] capture_frame_as_cover`、`upload_cover_image`
3. 查看错误信息，常见问题：
   - `Video file not found` - 视频文件路径不正确
   - `Failed to create output directory` - 目录权限问题
   - `Failed to write temp frame` - OpenCV 或文件系统权限问题

### 问题：后端服务无法启动

**查看日志：**
1. 打开 Electron 日志：`%APPDATA%\皮影互动系统\logs\main.log`
2. 搜索关键词：`Backend startup`、`Failed to start`、`Error`
3. 查看后端日志：`%APPDATA%\RobomonPiying\data\logs\app.log`

### 问题：视频无法播放或渲染失败

**查看日志：**
1. 打开后端日志文件
2. 搜索关键词：`video_renderer`、`ffmpeg`、`Failed to render`
3. 查看 FFmpeg 命令和错误输出

## 📝 日志级别说明

- **DEBUG**: 详细的调试信息（包括路径、参数等）
- **INFO**: 一般信息（启动、关闭、操作成功等）
- **WARNING**: 警告信息（非致命错误，但需要注意）
- **ERROR**: 错误信息（操作失败、异常等）

## 💡 提示

1. **日志文件会持续增长**，建议定期清理旧日志
2. **遇到问题时**，先查看最新的日志条目（文件末尾）
3. **截图功能问题**，重点查看包含 `capture_frame_as_cover` 或 `upload_cover_image` 的日志行
4. **如果日志文件不存在**，可能是目录权限问题，检查 `%APPDATA%\RobomonPiying\data\logs\` 目录是否存在且有写入权限

## 🔧 快速打开日志文件夹的命令

**PowerShell:**
```powershell
# 打开后端日志文件夹
explorer "$env:APPDATA\RobomonPiying\data\logs"

# 打开 Electron 日志文件夹（如果存在）
explorer "$env:APPDATA\皮影互动系统\logs"
```

**CMD:**
```cmd
# 打开后端日志文件夹
explorer %APPDATA%\RobomonPiying\data\logs
```
