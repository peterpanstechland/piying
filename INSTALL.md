# 皮影互动短片生成系统 - 安装指南

## 系统要求

- Windows 10/11
- **Python 3.12**（推荐，兼容性最佳）
- Node.js 18 或更高版本
- 摄像头（720p 或更高分辨率）
- 至少 8GB 内存
- 至少 50GB 可用磁盘空间

## 快速安装（客户端部署）

### 1. 安装前置软件

#### Python 3.12
1. 访问 https://www.python.org/downloads/
2. 下载并安装 **Python 3.12.x**（推荐使用 3.12 以获得最佳兼容性）
3. **重要**：安装时勾选 "Add Python to PATH"
4. 如果已安装其他版本，可以同时安装 3.12，使用 `py -3.12` 调用

#### Node.js 18+
1. 访问 https://nodejs.org/
2. 下载并安装 LTS 版本（推荐 18.x 或 20.x）

### 2. 一键安装

双击运行 `setup.bat`

脚本会自动：
- 检查 Python 和 Node.js 安装
- 创建 Python 虚拟环境
- 安装所有后端依赖
- 安装所有前端依赖
- 生成占位符资源文件

安装过程需要 5-10 分钟，取决于网络速度。

### 3. 启动系统

#### 开发模式（用于测试）
双击运行 `start-dev.bat`

- 后端：http://localhost:8000
- 前端：http://localhost:5173
- 支持热重载，代码修改后自动刷新

#### 生产模式（用于展览）
双击运行 `start-production.bat`

- 访问：http://localhost:8000
- 优化性能，适合长时间运行

## 故障排除

### Python 未找到
```
错误：'python' 不是内部或外部命令
```
**解决方案**：重新安装 Python，确保勾选 "Add Python to PATH"

### Node.js 未找到
```
错误：'node' 不是内部或外部命令
```
**解决方案**：重新安装 Node.js，或手动添加到系统 PATH

### 依赖安装失败
```
错误：Failed to install dependencies
```
**解决方案**：
1. 检查网络连接
2. 尝试使用国内镜像：
   ```cmd
   pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
   npm config set registry https://registry.npmmirror.com
   ```

### 摄像头无法访问
**解决方案**：
1. 检查摄像头是否被其他程序占用
2. 在浏览器中允许摄像头权限
3. 检查 Windows 隐私设置中的摄像头权限

### 端口被占用
```
错误：Address already in use
```
**解决方案**：
1. 关闭占用 8000 或 5173 端口的程序
2. 或修改 `.env` 文件中的端口配置

## 手动安装（高级用户）

### 后端
```cmd
python -m venv venv
call venv\Scripts\activate.bat
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端
```cmd
cd frontend
npm install
npm run dev
```

## 验证安装

1. 启动系统后，浏览器访问 http://localhost:5173（开发模式）或 http://localhost:8000（生产模式）
2. 允许摄像头权限
3. 站在摄像头前，系统应该自动检测到人体
4. 举起手进行手势交互测试

## 更新系统

```cmd
git pull
call setup.bat
```

## 卸载

删除整个项目文件夹即可。虚拟环境和所有依赖都在项目目录内。

## 技术支持

如遇问题，请查看：
- `README.md` - 项目概述
- `DEPLOYMENT.md` - 详细部署文档
- `PROJECT_STRUCTURE.md` - 项目结构说明
