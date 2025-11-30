#!/bin/bash

echo "========================================"
echo "创建离线部署包"
echo "Creating Offline Deployment Package"
echo "========================================"
echo ""

PACKAGE_NAME="shadow-puppet-offline-package"
PACKAGE_DIR="$PACKAGE_NAME"

echo "1. 清理旧的打包目录..."
rm -rf "$PACKAGE_DIR"
rm -f "$PACKAGE_NAME.tar.gz"

echo "2. 创建打包目录结构..."
mkdir -p "$PACKAGE_DIR/installers"
mkdir -p "$PACKAGE_DIR/dependencies"

echo "3. 复制项目文件..."
echo "   - 复制源代码..."
cp -r frontend "$PACKAGE_DIR/"
cp -r admin-frontend "$PACKAGE_DIR/"
cp -r backend "$PACKAGE_DIR/"
cp -r assets "$PACKAGE_DIR/"
cp -r config "$PACKAGE_DIR/"

echo "   - 复制脚本和配置..."
cp *.bat "$PACKAGE_DIR/" 2>/dev/null || true
cp *.sh "$PACKAGE_DIR/" 2>/dev/null || true
cp *.py "$PACKAGE_DIR/" 2>/dev/null || true
cp .env.example "$PACKAGE_DIR/"
cp requirements.txt "$PACKAGE_DIR/"

echo "   - 复制文档..."
cp *.md "$PACKAGE_DIR/"

echo "4. 清理不必要的文件..."
rm -rf "$PACKAGE_DIR/frontend/node_modules"
rm -rf "$PACKAGE_DIR/admin-frontend/node_modules"
find "$PACKAGE_DIR/backend" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$PACKAGE_DIR/backend" -type d -name "*.pyc" -delete 2>/dev/null || true
rm -rf "$PACKAGE_DIR/venv"

echo "5. 下载 Python 依赖包（离线安装用）..."
echo "   这可能需要几分钟..."
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    pip download -r backend/requirements.txt -d "$PACKAGE_DIR/dependencies/python"
else
    pip3 download -r backend/requirements.txt -d "$PACKAGE_DIR/dependencies/python"
fi

echo "6. 创建离线安装说明..."
cat > "$PACKAGE_DIR/OFFLINE_INSTALL.md" << 'EOF'
# 离线部署安装说明

## 系统要求
- Ubuntu 20.04+ / CentOS 8+ / Windows 10/11
- 至少 8GB RAM
- 至少 50GB 可用磁盘空间
- 摄像头

## 安装步骤

### 1. 安装 Python 3.10+

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install python3.10 python3.10-venv python3-pip
```

**CentOS/RHEL:**
```bash
sudo yum install python3.10 python3-pip
```

**Windows:**
从 installers 目录安装，或从官网下载：https://www.python.org/downloads/

### 2. 安装 Node.js 18+

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs
```

**Windows:**
从 installers 目录安装，或从官网下载：https://nodejs.org/

### 3. 安装 Python 依赖（离线）

**Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install --no-index --find-links=dependencies/python -r requirements.txt
```

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
pip install --no-index --find-links=dependencies\python -r requirements.txt
```

### 4. 安装前端依赖

需要联网一次，或提前准备 node_modules 离线包

```bash
cd frontend
npm install
cd ../admin-frontend
npm install
cd ..
```

### 5. 构建前端

```bash
# Linux
./build-all.sh

# Windows
build-all.bat
```

### 6. 配置环境

```bash
cp .env.example .env
# 编辑 .env 文件，设置正确的 IP 地址
```

### 7. 启动系统

```bash
# Linux
./start-production.sh

# Windows
start-production.bat
```

### 8. 访问系统

- 用户界面: http://localhost:8000
- 管理面板: http://localhost:8000/admin
- 默认账号: admin / admin123

## 详细文档

- QUICKSTART_DEPLOYMENT.md - 快速部署指南
- DEPLOYMENT.md - 完整部署文档
- USER_MANAGEMENT_GUIDE.md - 用户管理指南
- PASSWORD_RECOVERY_QUICK_GUIDE.md - 密码恢复指南
EOF

echo "7. 创建快速安装脚本..."
cat > "$PACKAGE_DIR/quick-install.sh" << 'EOF'
#!/bin/bash

echo "========================================"
echo "皮影互动系统 - 快速安装"
echo "Shadow Puppet System - Quick Install"
echo "========================================"
echo ""

echo "1. 检查 Python..."
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到 Python，请先安装 Python 3.10+"
    echo "[Error] Python not found, please install Python 3.10+"
    exit 1
fi
echo "[成功] Python 已安装"
echo ""

echo "2. 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js 18+"
    echo "[Error] Node.js not found, please install Node.js 18+"
    exit 1
fi
echo "[成功] Node.js 已安装"
echo ""

echo "3. 创建 Python 虚拟环境..."
python3 -m venv venv
echo ""

echo "4. 安装 Python 依赖（离线）..."
source venv/bin/activate
pip install --no-index --find-links=dependencies/python -r requirements.txt
echo ""

echo "5. 复制环境配置..."
if [ ! -f .env ]; then
    cp .env.example .env
fi
echo ""

echo "========================================"
echo "安装完成！"
echo "Installation Complete!"
echo "========================================"
echo ""
echo "下一步："
echo "1. 编辑 .env 文件，设置正确的 IP 地址"
echo "2. 运行 ./build-all.sh 构建前端"
echo "3. 运行 ./start-production.sh 启动系统"
echo ""
EOF

chmod +x "$PACKAGE_DIR/quick-install.sh"
chmod +x "$PACKAGE_DIR"/*.sh

echo "8. 打包成 tar.gz 文件..."
tar -czf "$PACKAGE_NAME.tar.gz" "$PACKAGE_DIR"

echo ""
echo "========================================"
echo "打包完成！"
echo "Package Created!"
echo "========================================"
echo ""
echo "输出文件: $PACKAGE_NAME.tar.gz"
echo "大小: $(du -h $PACKAGE_NAME.tar.gz | cut -f1)"
echo ""
echo "下一步："
echo "1. 将 $PACKAGE_NAME.tar.gz 复制到目标设备"
echo "2. 解压: tar -xzf $PACKAGE_NAME.tar.gz"
echo "3. 进入目录: cd $PACKAGE_DIR"
echo "4. 阅读 OFFLINE_INSTALL.md"
echo "5. 运行 ./quick-install.sh"
echo ""
