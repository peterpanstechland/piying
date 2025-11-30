# 离线部署完整指南 / Offline Deployment Complete Guide

## 概述

本指南帮助你在**完全离线**的环境中部署皮影互动系统。

## 准备阶段（需要联网）

### 1. 创建离线部署包

在有网络的开发机器上运行：

**Windows:**
```bash
create-offline-package.bat
```

**Linux/macOS:**
```bash
chmod +x create-offline-package.sh
./create-offline-package.sh
```

这将创建一个包含所有必要文件的压缩包：
- `shadow-puppet-offline-package.zip` (Windows)
- `shadow-puppet-offline-package.tar.gz` (Linux/macOS)

### 2. 下载必要的安装程序

需要手动下载以下安装程序并放入 `installers` 目录：

#### Python 3.10+
- **Windows**: https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe
- **Linux**: 通常系统自带，或从发行版仓库安装

#### Node.js 18+
- **Windows**: https://nodejs.org/dist/v18.17.0/node-v18.17.0-x64.msi
- **Linux**: https://nodejs.org/dist/v18.17.0/node-v18.17.0-linux-x64.tar.xz

#### 可选：Visual C++ Redistributable (Windows)
- https://aka.ms/vs/17/release/vc_redist.x64.exe
- OpenCV 需要此运行库

### 3. 准备 Node.js 依赖（可选但推荐）

如果目标设备完全无法联网，需要提前准备 node_modules：

```bash
# 在开发机器上
cd frontend
npm install
tar -czf frontend-node_modules.tar.gz node_modules

cd ../admin-frontend
npm install
tar -czf admin-frontend-node_modules.tar.gz node_modules
```

将这两个文件也加入离线包。

---

## 部署阶段（离线环境）

### 步骤 1：传输文件

将离线部署包传输到目标设备：
- USB 驱动器
- 内部网络共享
- 直接复制

### 步骤 2：解压缩

**Windows:**
```bash
# 右键点击 ZIP 文件 -> 解压到此处
# 或使用命令行
powershell Expand-Archive shadow-puppet-offline-package.zip -DestinationPath .
```

**Linux:**
```bash
tar -xzf shadow-puppet-offline-package.tar.gz
cd shadow-puppet-offline-package
```

### 步骤 3：安装系统依赖

#### Windows

1. **安装 Python**
   ```bash
   # 从 installers 目录运行
   installers\python-3.10.11-amd64.exe
   # 勾选 "Add Python to PATH"
   ```

2. **安装 Node.js**
   ```bash
   installers\node-v18.17.0-x64.msi
   ```

3. **安装 Visual C++ Redistributable**
   ```bash
   installers\vc_redist.x64.exe
   ```

4. **重启命令行**以使环境变量生效

#### Linux (Ubuntu/Debian)

```bash
# 如果系统没有 Python 3.10
sudo apt update
sudo apt install python3.10 python3.10-venv python3-pip

# 安装 Node.js（从 tar.xz）
cd installers
tar -xf node-v18.17.0-linux-x64.tar.xz
sudo mv node-v18.17.0-linux-x64 /usr/local/nodejs
echo 'export PATH=/usr/local/nodejs/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### 步骤 4：运行快速安装脚本

**Windows:**
```bash
quick-install.bat
```

**Linux:**
```bash
chmod +x quick-install.sh
./quick-install.sh
```

这将：
- 创建 Python 虚拟环境
- 从本地依赖包安装 Python 库
- 复制环境配置文件

### 步骤 5：安装前端依赖

#### 方法 A：如果有预打包的 node_modules

```bash
# Windows
cd frontend
tar -xzf ..\frontend-node_modules.tar.gz
cd ..\admin-frontend
tar -xzf ..\admin-frontend-node_modules.tar.gz
cd ..

# Linux
cd frontend
tar -xzf ../frontend-node_modules.tar.gz
cd ../admin-frontend
tar -xzf ../admin-frontend-node_modules.tar.gz
cd ..
```

#### 方法 B：如果可以临时联网

```bash
cd frontend
npm install
cd ../admin-frontend
npm install
cd ..
```

### 步骤 6：配置环境

1. **编辑 .env 文件**
   ```bash
   # Windows
   notepad .env
   
   # Linux
   nano .env
   ```

2. **设置正确的 IP 地址**
   ```env
   # 后端配置
   BACKEND_HOST=0.0.0.0
   BACKEND_PORT=8000
   
   # 前端配置（设置为本机 IP）
   VITE_API_BASE_URL=http://192.168.1.100:8000
   ```

3. **获取本机 IP 地址**
   ```bash
   # Windows
   ipconfig
   
   # Linux
   ip addr show
   ```

### 步骤 7：构建前端

```bash
# Windows
build-all.bat

# Linux
./build-all.sh
```

### 步骤 8：启动系统

```bash
# Windows
start-production.bat

# Linux
./start-production.sh
```

### 步骤 9：验证部署

1. **访问用户界面**
   ```
   http://localhost:8000
   或
   http://192.168.1.100:8000
   ```

2. **访问管理面板**
   ```
   http://localhost:8000/admin
   默认账号: admin / admin123
   ```

3. **测试摄像头**
   - 在管理面板进入"摄像头测试"
   - 确认摄像头正常工作

---

## 故障排除

### Python 依赖安装失败

如果离线安装失败，可能是依赖包不完整：

```bash
# 在有网络的机器上重新下载
pip download -r requirements.txt -d dependencies/python --platform win_amd64
# 或
pip download -r requirements.txt -d dependencies/python --platform manylinux1_x86_64
```

### Node.js 依赖安装失败

确保 Node.js 版本正确：
```bash
node --version  # 应该是 v18.x.x
npm --version
```

### 摄像头无法访问

1. 检查浏览器权限
2. 确认摄像头驱动已安装
3. 尝试使用 Chrome 或 Edge 浏览器

### 端口被占用

修改 .env 文件中的端口：
```env
BACKEND_PORT=8001
```

---

## 系统维护

### 备份数据

重要数据位置：
- 用户数据库: `data/admin.db`
- 会话数据: `data/sessions/`
- 生成的视频: `data/outputs/`
- 配置文件: `config/`

备份命令：
```bash
# Windows
xcopy /E /I data backup\data
xcopy /E /I config backup\config

# Linux
cp -r data backup/
cp -r config backup/
```

### 更新系统

1. 在开发机器上更新代码
2. 重新创建离线部署包
3. 在目标设备上：
   - 备份数据
   - 解压新的部署包
   - 恢复数据
   - 重新构建和启动

### 日志查看

```bash
# 应用日志
cat data/logs/app.log

# 实时查看
tail -f data/logs/app.log  # Linux
Get-Content data\logs\app.log -Wait  # Windows PowerShell
```

---

## 性能优化

### 磁盘空间管理

系统会自动清理旧文件，但可以手动调整：

编辑 `config/settings.json`:
```json
{
  "storage": {
    "max_age_days": 7,
    "min_disk_space_gb": 10
  }
}
```

### 视频渲染优化

编辑 `config/settings.json`:
```json
{
  "rendering": {
    "target_fps": 30,
    "video_codec": "mp4v",
    "max_render_time_seconds": 60
  }
}
```

---

## 安全建议

1. **立即修改默认密码**
   - 登录管理面板
   - 进入用户管理
   - 修改 admin 密码

2. **创建多个管理员账号**
   - 避免单点故障
   - 不同人员使用不同账号

3. **定期备份**
   - 每周备份数据库
   - 每月备份完整系统

4. **限制网络访问**
   - 仅在局域网内使用
   - 不要暴露到公网

---

## 附录

### 离线包内容清单

```
shadow-puppet-offline-package/
├── frontend/              # 用户前端源码
├── admin-frontend/        # 管理前端源码
├── backend/               # 后端源码
├── assets/                # 资源文件
├── config/                # 配置文件
├── dependencies/          # 离线依赖包
│   └── python/           # Python 包
├── installers/            # 安装程序（需手动添加）
├── *.bat                  # Windows 脚本
├── *.sh                   # Linux 脚本
├── *.py                   # Python 工具脚本
├── .env.example           # 环境配置模板
├── requirements.txt       # Python 依赖列表
├── OFFLINE_INSTALL.md     # 快速安装说明
└── *.md                   # 各种文档
```

### 最小系统要求

- **CPU**: 4核心 (Intel i5 / AMD Ryzen 5)
- **RAM**: 8GB (推荐 16GB)
- **存储**: 50GB 可用空间
- **摄像头**: 720p 或更高
- **操作系统**: 
  - Windows 10/11 (64位)
  - Ubuntu 20.04+ / CentOS 8+
  - macOS 11+

### 推荐配置

- **CPU**: 8核心 (Intel i7 / AMD Ryzen 7)
- **RAM**: 16GB
- **存储**: 100GB SSD
- **摄像头**: 1080p
- **显示器**: 1920x1080 或更高

---

## 技术支持

如遇问题，请查看：
1. `TROUBLESHOOTING.md` - 故障排除指南
2. `DEPLOYMENT.md` - 详细部署文档
3. `USER_MANAGEMENT_GUIDE.md` - 用户管理指南
4. `PASSWORD_RECOVERY_QUICK_GUIDE.md` - 密码恢复指南
