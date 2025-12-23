# 更新日志 / Changelog

所有重要的版本更新都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

