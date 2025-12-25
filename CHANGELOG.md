# 更新日志 / Changelog

所有重要的版本更新都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.2.29] - 2025-12-26

### 修复
- **构建错误修复**: 修复 `SystemSettingsContext` 中 `loadSettings` 函数缺少 `calibration_timeout_seconds` 字段导致的 TypeScript 编译错误

---

## [1.2.28] - 2025-12-26

### 变更
- **超时配置优化**: 移除 `inactivity_show_countdown_seconds` 配置项
  - 倒计时显示时间现在**自动计算为超时时间的一半**，无需用户单独配置

### 新增
- **校准动作超时设置**: 新增 `calibration_timeout_seconds` 配置项
  - 可通过后台管理界面配置（默认 60 秒，范围 10-300 秒）
  - 当用户在检测框内但长时间未完成校准动作时触发

---

## [1.2.27] - 2025-12-26

### 修复
- **默认姿势编辑器**: 修复切换角色朝向（左/右）时 z-index 未正确更新的问题
  - 现在切换朝向后会立即刷新所有部件的层级顺序

---

## [1.2.26] - 2025-12-26

### 修复
- **无操作返回功能**: 修复 `SegmentGuidancePage` 和 `SegmentReviewPage` 无操作倒计时返回首页功能
  - 添加倒计时显示（在超时时间一半后开始显示）
  - 优化用户体验，在返回前给予充足提示

---

## [1.2.25] - 2025-12-26

### 修复
- **编辑器分辨率**: 编辑器使用固定参考分辨率 (1920x1080)
  - 确保管理后台编辑的 scale 和位置与前端录制端完全匹配
  - 解决不同屏幕分辨率下角色显示位置不一致的问题

---

## [1.2.24] - 2025-12-25

### 改进
- **UI 倒计时优化**: 倒计时改为金色渐变，去掉灰色背景，更大更亮

---

## [1.2.23] - 2025-12-25

### 改进
- **UI 倒计时优化**: 倒计时居中显示，颜色更显眼（红色渐变 + 圆形背景）

---

## [1.2.22] - 2025-12-25

### 修复
- **校准引导**: 4 动作校准引导流程优化
- **摄像头设置**: 摄像头默认设置改进
- **FFmpeg**: 修复 overlay 格式问题

### 新增
- **开机自启动**: 添加开机自启动设置功能（仅 Electron 桌面应用）

---

## [1.2.21] - 2025-12-24

### 修复
- **动作捕捉算法**: 恢复 v1.1.7 的动作捕捉算法
  - 修复 rootOffset、headAngle、bodyAngle 计算
  - 恢复 FK/IK 逻辑

---

## [1.2.20] - 2025-12-24

### 修复
- **动作捕捉调试**: 恢复动作捕捉调试面板和管线功能
  - 之前在 v1.1.8 中被意外移除

---

## [1.2.19] - 2025-12-24

### 新增
- **卸载数据保留**: 卸载时可选择保留用户数据
- **手动备份 API**: 添加手动备份 API 接口

### 修复
- 改进网络状态检查和 Release 信息 API 错误处理
- 修复更新事件广播到 launcherWindow
- 修正 OTA 设置 API 端点路径

---

## [1.2.13-1.2.18] - 2025-12-23

### 修复
- OTA 更新相关的多个修复和优化
- GitHub Actions CI/CD 构建配置改进
- latest.yml 发布流程优化

---

## [1.2.12] - 2025-12-23

### 新增
- **OTA 自动更新功能**: 启用 `--publish always`，自动上传 `latest.yml` 到 GitHub Release
- 所有平台（Windows、macOS、Linux）的构建现在都会发布更新元数据
- 配置 `GH_TOKEN` 环境变量用于发布

---

## [1.2.11] - 2025-12-23

### 修复
- 将 `boto3` 和 `botocore` 添加到 `requirements.txt`（之前完全缺失）
- 在 CI 中显式安装 boto3 和 botocore

---

## [1.2.10] - 2025-12-23

### 修复
- 添加 `--collect-all boto3` 和 `--collect-all botocore` 到 PyInstaller

---

## [1.2.9] - 2025-12-23

### 修复
- 添加 `platformdirs` 依赖和 hidden import

---

## [1.2.8] - 2025-12-23

### 修复
- **关键修复**: 修正后端 artifact 上传路径
- PyInstaller `--onedir` 创建 `backend/dist/backend/` 结构
- 之前上传 `backend/dist/` 导致下载后路径变成 `resources/backend/backend/backend.exe`（多了一层）
- 现在上传 `backend/dist/backend/`，确保结构为 `resources/backend/backend.exe`

---

## [1.2.7] - 2025-12-23

### 修复
- 跳过 macOS DMG 构建，只生成 ZIP 文件
- 解决 GitHub Actions macOS runner 上 `hdiutil resize` 失败的问题
- 这是 electron-builder 在 GitHub Actions 环境下的已知问题

---

## [1.2.6] - 2025-12-23

### 修复
- **重要**: 在 CI 中显式安装 `jaraco.text`, `jaraco.functools`, `jaraco.context` 包
- 之前的构建失败是因为这些包没有在 CI 环境中安装，导致 PyInstaller 无法收集它们
- 优化 PyInstaller 收集选项，使用 `--collect-all` 替代 `--copy-metadata`

---

## [1.2.5] - 2025-12-23

### 修复
- **重要**: 解决 `jaraco` 命名空间包 (namespace package) 的 PyInstaller 打包问题
- 添加 `--collect-submodules jaraco` 收集所有子模块
- 添加 `--collect-data jaraco` 收集数据文件
- 添加 `--copy-metadata` 复制 jaraco 各子包的元数据
- 添加 `--collect-all pkg_resources` 确保资源加载器正常工作

---

## [1.2.4] - 2025-12-23

### 修复
- **重要**: 修正 GitHub Actions 后端 artifact 上传路径
- PyInstaller `--onedir` 模式生成 `backend/dist/backend/`，之前错误上传了 `backend/dist/` 导致路径多了一层
- 现在正确上传 `backend/dist/backend/`，确保 `backend.exe` 能被 Electron 正确找到

---

## [1.2.3] - 2025-12-23

### 修复
- **重要**: 添加 `--add-data "app:app"` 到 PyInstaller 命令，修复后端启动时 `ModuleNotFoundError: No module named 'backend'` 错误
- 确保 Python 后端的 `app` 模块被正确打包

---

## [1.2.2] - 2025-12-23

### 修复
- 修复 GitHub Actions 构建：将 PyInstaller 从 `--onefile` 改为 `--onedir` 模式
- 添加更多 jaraco 相关的 hidden imports，解决后端启动时 `ModuleNotFoundError: No module named 'jaraco'` 错误
- 添加 `--noconsole` 参数，后端运行时不显示控制台窗口

---

## [1.2.1] - 2025-12-23

### 修复
- 更新 package.json 版本号同步

---

## [1.2.0] - 2025-12-23

### 修复
- GitHub Actions 构建配置添加 `--collect-all jaraco` 和其他 hidden imports
- 修复后端 PyInstaller 打包缺少依赖的问题

---

## [1.1.9] - 2025-12-22

### 修复
- 恢复 OTA 更新设置功能到管理后台
- 修复 TypeScript 编译错误
- 恢复后端设置模型（修复 `TimeoutSettings` 属性缺失错误）
- 改进本地构建脚本 `build-electron-app.ps1`，添加自动版本同步功能

### 新增
- 管理后台系统设置页面添加 OTA 更新设置
  - 启用/禁用 OTA 更新检测
  - 启动时自动检查更新
  - 支持 GitHub Release 和自定义更新源

---

## [1.1.8] - 2025-12-22

### 修复
- 添加缺失的 IPC handlers：
  - `get-network-status` - 获取网络状态
  - `get-update-status` - 获取更新状态
  - `get-ota-settings` - 获取 OTA 设置
  - `get-release-info` - 获取 GitHub Release 信息
  - `install-update` - 安装更新
  - `refresh-ota-settings` - 刷新 OTA 设置

---

## [1.1.7] - 2025-12-22

### 修复
- 注册 `check-for-updates` handler
- 更新 CI workflow

---

## [1.1.6] - 2025-12-22

### 修复
- TypeScript 模块解析问题
- 添加 `SQUATTING` 到 `LegIntent` 枚举
- 修复 `pixi.js` 模块解析
- 创建 `shared/pixi/index.ts` 统一导出

---

## [1.1.0] - 2025-12-XX

### 新增
- Electron 桌面应用启动器
- Python 后端 PyInstaller 打包
- 管理后台前端
- 用户前端（动作捕捉体验）

### 功能
- 皮影角色管理
- 故事线/场景编辑
- 实时动作捕捉
- 视频录制和导出
- 系统设置管理

---

## [1.0.0] - 2025-12-XX

### 初始版本
- 基础项目结构
- FastAPI 后端
- React 前端
- MediaPipe 姿态检测
- PixiJS 角色渲染

---

## 版本说明

- **主版本号 (Major)**: 不兼容的 API 变更
- **次版本号 (Minor)**: 向后兼容的新功能
- **修订号 (Patch)**: 向后兼容的问题修复

## 链接

- [GitHub Releases](https://github.com/peterpanstechland/piying/releases)
- [问题追踪](https://github.com/peterpanstechland/piying/issues)

