# 离线部署快速参考 / Offline Deployment Quick Reference

## 📦 准备阶段（有网络）

```bash
# 1. 创建离线包
create-offline-package.bat  # Windows
./create-offline-package.sh  # Linux

# 2. 下载安装程序（手动）
- Python 3.10+: https://www.python.org/downloads/
- Node.js 18+: https://nodejs.org/
- VC++ Redist: https://aka.ms/vs/17/release/vc_redist.x64.exe

# 3. 可选：打包 node_modules
cd frontend && npm install && tar -czf ../frontend-nm.tar.gz node_modules
cd ../admin-frontend && npm install && tar -czf ../admin-nm.tar.gz node_modules
```

---

## 🚀 部署阶段（无网络）

### 1. 传输文件
- 复制离线包到目标设备
- 复制安装程序到目标设备

### 2. 解压
```bash
# Windows
powershell Expand-Archive shadow-puppet-offline-package.zip
cd shadow-puppet-offline-package

# Linux
tar -xzf shadow-puppet-offline-package.tar.gz
cd shadow-puppet-offline-package
```

### 3. 安装依赖
```bash
# 安装 Python、Node.js、VC++ Redist
# 重启命令行
```

### 4. 快速安装
```bash
quick-install.bat  # Windows
./quick-install.sh  # Linux
```

### 5. 前端依赖
```bash
# 方法 A: 解压预打包
cd frontend && tar -xzf ../frontend-nm.tar.gz
cd ../admin-frontend && tar -xzf ../admin-nm.tar.gz

# 方法 B: npm install（需联网）
cd frontend && npm install
cd ../admin-frontend && npm install
```

### 6. 配置
```bash
# 编辑 .env
notepad .env  # Windows
nano .env     # Linux

# 设置 IP
VITE_API_BASE_URL=http://192.168.1.100:8000
```

### 7. 构建
```bash
build-all.bat  # Windows
./build-all.sh  # Linux
```

### 8. 启动
```bash
start-production.bat  # Windows
./start-production.sh  # Linux
```

---

## ✅ 验证

- 用户界面: http://localhost:8000
- 管理面板: http://localhost:8000/admin
- 默认账号: admin / admin123

---

## 🔧 常用命令

```bash
# 查看 IP
ipconfig           # Windows
ip addr show       # Linux

# 查看日志
type data\logs\app.log              # Windows
cat data/logs/app.log               # Linux
tail -f data/logs/app.log           # Linux 实时

# 重启系统
restart-all.bat    # Windows
./restart-all.sh   # Linux

# 重置密码
reset-admin-password.bat admin newpass  # Windows
./reset-admin-password.sh admin newpass  # Linux

# 备份数据
xcopy /E /I data backup\data        # Windows
cp -r data backup/                  # Linux
```

---

## 📋 检查清单

### 准备阶段
- [ ] 创建离线包
- [ ] 下载安装程序
- [ ] 打包 node_modules（可选）

### 部署阶段
- [ ] 传输文件
- [ ] 解压文件
- [ ] 安装依赖
- [ ] 运行快速安装
- [ ] 安装前端依赖
- [ ] 配置 .env
- [ ] 构建前端
- [ ] 启动系统

### 验证阶段
- [ ] 访问用户界面
- [ ] 访问管理面板
- [ ] 测试摄像头
- [ ] 修改默认密码

---

## 🆘 紧急情况

### 忘记密码
```bash
reset-admin-password.bat  # Windows
./reset-admin-password.sh  # Linux
```

### 端口被占用
编辑 .env，修改 BACKEND_PORT=8001

### 摄像头无法访问
- 检查浏览器权限
- 使用 Chrome/Edge
- 检查摄像头驱动

### 系统无法启动
```bash
# 查看日志
cat data/logs/app.log

# 检查依赖
python --version  # 应该是 3.10+
node --version    # 应该是 18+
```

---

## 📞 获取帮助

- 完整指南: OFFLINE_DEPLOYMENT_GUIDE.md
- 详细检查清单: OFFLINE_DEPLOYMENT_CHECKLIST.md
- 故障排除: TROUBLESHOOTING.md
- 密码恢复: PASSWORD_RECOVERY_QUICK_GUIDE.md
- 用户管理: USER_MANAGEMENT_GUIDE.md

---

**提示**: 打印此页面作为快速参考！
