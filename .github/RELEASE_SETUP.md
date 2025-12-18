# GitHub Actions 发布配置指南

本项目使用 GitHub Actions 自动构建和发布多平台 Electron 应用。

## 支持的平台

| 平台 | 架构 | 适用设备 | 文件格式 |
|------|------|----------|----------|
| Windows | x64 | PC | `.exe` (NSIS 安装程序) |
| macOS | Intel (x64) | Mac (Intel) | `.dmg`, `.zip` |
| macOS | Apple Silicon (arm64) | Mac (M1/M2/M3) | `.dmg`, `.zip` |
| Linux | x64 | PC | `.AppImage`, `.deb` |
| Linux | ARM64 | **树莓派 4/5** | `.AppImage`, `.deb` |
| Linux | ARMv7 | **树莓派 3/Zero 2** | `.AppImage`, `.deb` |

## 触发构建

### 自动触发
推送版本标签时自动触发构建和发布：

```bash
# 创建并推送版本标签
git tag v1.0.0
git push origin v1.0.0
```

### 手动触发
在 GitHub Actions 页面手动触发 "Build and Release" 工作流。

## 配置 Secrets

在 GitHub 仓库设置中添加以下 Secrets（Settings → Secrets and variables → Actions）：

### Windows 代码签名（可选）

| Secret 名称 | 说明 |
|-------------|------|
| `WINDOWS_CERTIFICATE` | Windows 代码签名证书（.pfx 文件的 Base64 编码） |
| `WINDOWS_CERTIFICATE_PASSWORD` | 证书密码 |

**生成证书 Base64：**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | Out-File cert-base64.txt
```

### macOS 代码签名和公证（可选）

| Secret 名称 | 说明 |
|-------------|------|
| `APPLE_CERTIFICATE` | Apple Developer ID 证书（.p12 文件的 Base64 编码） |
| `APPLE_CERTIFICATE_PASSWORD` | 证书密码 |
| `APPLE_ID` | Apple Developer 账号邮箱 |
| `APPLE_ID_PASSWORD` | App-specific password（应用专用密码） |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

**获取 App-specific password：**
1. 登录 https://appleid.apple.com
2. 安全 → 应用专用密码 → 生成密码

**生成证书 Base64：**
```bash
base64 -i certificate.p12 -o cert-base64.txt
```

## 不使用代码签名

如果不配置代码签名 Secrets，工作流仍会正常运行，但：
- Windows：安装时会显示 SmartScreen 警告
- macOS：用户需要右键打开或在系统偏好设置中允许

## 发布流程

1. 更新 `package.json` 中的版本号
2. 提交更改
3. 创建版本标签：`git tag v1.x.x`
4. 推送标签：`git push origin v1.x.x`
5. GitHub Actions 自动：
   - 构建所有平台的应用
   - 创建 GitHub Release
   - 上传所有安装包

## 本地测试

在本地测试构建（不发布）：

```bash
# Windows
cd electron-app
npm run build:win

# macOS (需要在 macOS 系统上)
npm run build:mac

# Linux (需要在 Linux 系统上或使用 Docker)
npm run build:linux
```

## 树莓派部署指南

### 硬件要求

| 设备 | 架构 | 内存建议 | 推荐版本 |
|------|------|----------|----------|
| 树莓派 5 | ARM64 | 4GB+ | ARM64 版本 |
| 树莓派 4 | ARM64 | 4GB+ | ARM64 版本 |
| 树莓派 3B+ | ARMv7 | 1GB+ | ARMv7 版本 |
| 树莓派 Zero 2 W | ARMv7 | 512MB | ARMv7 版本 |

### 安装步骤

1. 下载对应架构的 `.AppImage` 文件
2. 传输到树莓派
3. 赋予执行权限并运行：

```bash
chmod +x 皮影互动系统-*-linux-arm64.AppImage
./皮影互动系统-*-linux-arm64.AppImage
```

### 性能优化

- 使用 **Raspberry Pi OS (64-bit)** 以获得最佳性能
- 确保使用高速 SD 卡或 SSD
- 增加 GPU 内存分配：编辑 `/boot/config.txt` 添加 `gpu_mem=256`
- 禁用不需要的服务以释放内存

### 摄像头配置

树莓派摄像头需要启用：

```bash
sudo raspi-config
# 选择 Interface Options → Camera → Enable
sudo reboot
```

## 常见问题

### Q: 构建失败：找不到 Python 后端
**A:** 确保 `requirements.txt` 中的依赖可以正常安装。

### Q: macOS 构建失败：代码签名错误
**A:** 检查证书是否有效且未过期，确保 Team ID 正确。

### Q: Windows SmartScreen 警告
**A:** 配置 Windows 代码签名证书，或让用户点击"更多信息"→"仍然运行"。

### Q: Linux AppImage 无法运行
**A:** 确保文件有执行权限：`chmod +x *.AppImage`

### Q: 树莓派上运行缓慢
**A:** 
- 确保使用 64-bit 系统（针对 Pi 4/5）
- 增加 GPU 内存
- 关闭桌面环境，使用轻量级窗口管理器
- 降低视频分辨率

### Q: ARM 构建失败
**A:** ARM 构建使用 QEMU 模拟，可能需要较长时间（30-60分钟）。如果超时，可以增加 GitHub Actions 的超时时间。


