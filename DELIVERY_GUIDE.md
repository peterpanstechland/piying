# 项目交付指南 / Project Delivery Guide

## 交付方案概述

为甲方提供**零配置、一键启动**的交付方案，无需手动配置环境。

## 📦 交付包内容

### 方案 A: 完整离线包（推荐）

```
ShadowPuppet-Delivery/
├── 安装.bat                    # 一键安装脚本
├── 启动系统.bat                # 启动系统
├── 停止系统.bat                # 停止系统
├── 使用说明.txt                # 快速使用指南
├── runtime/                    # 运行时环境
│   ├── python-3.10.11/        # Python 便携版（需手动添加）
│   └── python-packages/       # Python 依赖包（离线）
├── app/                        # 应用程序
│   ├── backend/               # 后端代码
│   ├── frontend/dist/         # 前端构建产物
│   ├── admin-frontend/dist/   # 管理前端构建产物
│   ├── assets/                # 资源文件
│   ├── config/                # 配置文件
│   └── .env                   # 环境配置
└── 文档/                       # 使用文档
    ├── USER_MANAGEMENT_GUIDE.md
    ├── PASSWORD_RECOVERY_QUICK_GUIDE.md
    └── TROUBLESHOOTING.md
```

### 方案 B: 在线安装包（需要网络）

更小的包，依赖在线下载。

## 🚀 创建交付包

### 步骤 1: 构建前端

```bash
# 构建用户前端和管理前端
build-all.bat
```

### 步骤 2: 创建交付包

```bash
# 运行打包脚本
create-delivery-package.bat
```

### 步骤 3: 添加 Python 便携版（可选但推荐）

下载 Python 便携版并放入 `runtime/python/` 目录：

**选项 1: WinPython (推荐)**
- 下载: https://winpython.github.io/
- 选择: WinPython 3.10.x 64bit
- 解压到: `ShadowPuppet-Delivery/runtime/python/`

**选项 2: Python Embeddable**
- 下载: https://www.python.org/downloads/windows/
- 选择: Windows embeddable package (64-bit)
- 解压到: `ShadowPuppet-Delivery/runtime/python/`

### 步骤 4: 测试交付包

1. 解压交付包到测试目录
2. 双击 "安装.bat"
3. 双击 "启动系统.bat"
4. 验证系统正常运行

### 步骤 5: 打包交付

```bash
# 压缩为 ZIP
# 文件名: ShadowPuppet-v1.0-Delivery.zip
```

## 📋 甲方安装步骤

### 超简单 3 步安装

1. **解压文件**
   - 将 `ShadowPuppet-Delivery.zip` 解压到任意目录
   - 建议: `C:\ShadowPuppet\`

2. **运行安装**
   - 双击 `安装.bat`
   - 等待安装完成（约 2-5 分钟）

3. **启动系统**
   - 双击 `启动系统.bat`
   - 浏览器会自动打开
   - 开始使用！

### 详细说明

#### 安装过程

```
安装.bat 会自动:
1. 检查 Python 环境
2. 创建虚拟环境
3. 安装所有依赖
4. 配置系统环境
5. 创建必要目录
```

#### 启动过程

```
启动系统.bat 会自动:
1. 激活 Python 环境
2. 启动后端服务
3. 等待服务就绪
4. 打开浏览器到用户界面
```

## 🎯 Kiosk 模式（展览模式）

如果需要全屏展示模式（适合展览、博物馆）：

### 使用 Kiosk 模式启动

```bash
# 双击此文件启动全屏模式
launch-kiosk-mode.bat
```

特点:
- ✅ 自动全屏
- ✅ 隐藏浏览器工具栏
- ✅ 沉浸式体验
- ✅ 按 Alt+F4 或 F11 退出全屏

### 设置开机自启动

1. 按 `Win + R`
2. 输入 `shell:startup`
3. 将 `启动系统.bat` 的快捷方式复制到此文件夹
4. 重启电脑测试

## 🔧 高级配置

### 修改端口

编辑 `app/.env` 文件:
```env
BACKEND_PORT=8000  # 改为其他端口
```

### 修改 IP 地址

编辑 `app/.env` 文件:
```env
VITE_API_BASE_URL=http://192.168.1.100:8000  # 改为实际 IP
```

### 配置自动清理

编辑 `app/config/settings.json`:
```json
{
  "storage": {
    "max_age_days": 7,
    "min_disk_space_gb": 10
  }
}
```

## 📱 创建桌面快捷方式

### 方法 1: 手动创建

1. 右键桌面 -> 新建 -> 快捷方式
2. 位置: `C:\ShadowPuppet\启动系统.bat`
3. 名称: `皮影互动系统`
4. 可选: 更改图标

### 方法 2: 自动创建（PowerShell）

```powershell
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$Home\Desktop\皮影互动系统.lnk")
$Shortcut.TargetPath = "C:\ShadowPuppet\启动系统.bat"
$Shortcut.WorkingDirectory = "C:\ShadowPuppet"
$Shortcut.Save()
```

## 🎨 自定义启动画面

可以修改 `启动系统.bat` 中的 ASCII 艺术字和颜色:

```batch
color 0A  # 黑底绿字
color 0B  # 黑底青字
color 0C  # 黑底红字
color 0E  # 黑底黄字
```

## 📊 系统监控

### 查看运行状态

```bash
# 检查后端是否运行
netstat -ano | findstr :8000

# 查看日志
type app\data\logs\app.log
```

### 性能监控

- CPU 使用率: 任务管理器
- 内存使用: 任务管理器
- 磁盘空间: 管理面板 -> 仪表板

## 🆘 故障排除

### 问题 1: Python 未找到

**解决方案**:
1. 确认 `runtime/python/` 目录存在
2. 或安装系统 Python 3.10+
3. 重新运行 `安装.bat`

### 问题 2: 端口被占用

**解决方案**:
```bash
# 查找占用进程
netstat -ano | findstr :8000

# 终止进程
taskkill /PID [进程ID] /F

# 或修改端口
编辑 app\.env 文件
```

### 问题 3: 浏览器未自动打开

**解决方案**:
手动访问: `http://localhost:8000`

### 问题 4: 摄像头无法访问

**解决方案**:
1. 检查浏览器权限
2. 使用 Chrome 或 Edge
3. 检查摄像头驱动

## 📝 交付清单

### 必须交付

- [ ] `ShadowPuppet-Delivery.zip` (完整安装包)
- [ ] `使用说明.txt` (快速指南)
- [ ] `USER_MANAGEMENT_GUIDE.md` (用户管理指南)
- [ ] `PASSWORD_RECOVERY_QUICK_GUIDE.md` (密码恢复指南)
- [ ] `TROUBLESHOOTING.md` (故障排除指南)

### 可选交付

- [ ] 培训视频
- [ ] 远程支持联系方式
- [ ] 系统维护合同
- [ ] 备份恢复指南

## 🎓 甲方培训要点

### 基础操作

1. 如何启动系统
2. 如何停止系统
3. 如何访问管理面板
4. 如何修改密码

### 管理操作

1. 如何创建用户
2. 如何配置场景
3. 如何查看统计
4. 如何备份数据

### 维护操作

1. 如何查看日志
2. 如何清理存储
3. 如何更新系统
4. 如何恢复密码

## 📞 技术支持

### 支持方式

- 📧 邮件支持
- 📱 电话支持
- 💬 远程协助
- 📚 在线文档

### 支持时间

- 工作日: 9:00 - 18:00
- 响应时间: 4 小时内
- 紧急支持: 24/7

## 🔄 更新和维护

### 系统更新

1. 备份当前数据
2. 下载新版本
3. 解压覆盖（保留 data 目录）
4. 重新运行安装
5. 恢复数据

### 定期维护

- 每周: 检查日志
- 每月: 清理旧数据
- 每季度: 备份系统
- 每年: 更新密码

## ✅ 交付验收标准

### 功能验收

- [ ] 系统可以正常启动
- [ ] 摄像头正常工作
- [ ] 手势识别正常
- [ ] 视频生成正常
- [ ] 二维码下载正常
- [ ] 管理面板正常

### 性能验收

- [ ] 摄像头帧率 ≥ 20 FPS
- [ ] 视频渲染 ≤ 20 秒
- [ ] 系统响应 ≤ 1 秒
- [ ] 连续运行 ≥ 8 小时

### 文档验收

- [ ] 安装文档完整
- [ ] 使用文档清晰
- [ ] 故障排除文档详细
- [ ] 培训材料充分

---

**交付日期**: _______________
**交付人员**: _______________
**验收人员**: _______________
**验收日期**: _______________
