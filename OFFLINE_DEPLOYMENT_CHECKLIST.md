# 离线部署检查清单 / Offline Deployment Checklist

## 📋 准备阶段检查清单（联网环境）

### ✅ 创建离线包
- [ ] 运行 `create-offline-package.bat` 或 `create-offline-package.sh`
- [ ] 确认生成了压缩包文件
- [ ] 检查压缩包大小（应该在 100-500MB）

### ✅ 下载安装程序
- [ ] Python 3.10+ 安装程序
  - Windows: `python-3.10.11-amd64.exe`
  - Linux: 确认系统包管理器可用
- [ ] Node.js 18+ 安装程序
  - Windows: `node-v18.17.0-x64.msi`
  - Linux: `node-v18.17.0-linux-x64.tar.xz`
- [ ] Visual C++ Redistributable (Windows)
  - `vc_redist.x64.exe`

### ✅ 准备 Node.js 依赖（可选）
- [ ] 在 frontend 目录运行 `npm install`
- [ ] 打包 frontend/node_modules
- [ ] 在 admin-frontend 目录运行 `npm install`
- [ ] 打包 admin-frontend/node_modules

### ✅ 准备传输介质
- [ ] USB 驱动器（至少 2GB）
- [ ] 或准备网络传输方式

---

## 📋 部署阶段检查清单（离线环境）

### ✅ 文件传输
- [ ] 将离线包复制到目标设备
- [ ] 将安装程序复制到目标设备
- [ ] 将 node_modules 包复制到目标设备（如果有）

### ✅ 解压文件
- [ ] 解压离线部署包
- [ ] 确认所有文件完整
- [ ] 检查目录结构正确

### ✅ 安装系统依赖

#### Windows
- [ ] 安装 Python 3.10+
  - [ ] 勾选 "Add Python to PATH"
  - [ ] 验证: `python --version`
- [ ] 安装 Node.js 18+
  - [ ] 验证: `node --version`
  - [ ] 验证: `npm --version`
- [ ] 安装 Visual C++ Redistributable
- [ ] 重启命令行窗口

#### Linux
- [ ] 安装 Python 3.10+
  - [ ] 验证: `python3 --version`
- [ ] 安装 pip
  - [ ] 验证: `pip3 --version`
- [ ] 安装 Node.js 18+
  - [ ] 验证: `node --version`
  - [ ] 验证: `npm --version`

### ✅ 运行快速安装
- [ ] 运行 `quick-install.bat` (Windows) 或 `./quick-install.sh` (Linux)
- [ ] 确认 Python 虚拟环境创建成功
- [ ] 确认 Python 依赖安装成功
- [ ] 确认 .env 文件已创建

### ✅ 安装前端依赖
- [ ] 方法 A: 解压预打包的 node_modules
  - [ ] frontend/node_modules
  - [ ] admin-frontend/node_modules
- [ ] 方法 B: 运行 npm install（需要联网）
  - [ ] cd frontend && npm install
  - [ ] cd admin-frontend && npm install

### ✅ 配置系统
- [ ] 获取本机 IP 地址
  - Windows: `ipconfig`
  - Linux: `ip addr show`
- [ ] 编辑 .env 文件
  - [ ] 设置 BACKEND_HOST=0.0.0.0
  - [ ] 设置 BACKEND_PORT=8000
  - [ ] 设置 VITE_API_BASE_URL=http://[本机IP]:8000
- [ ] 保存 .env 文件

### ✅ 构建前端
- [ ] 运行 `build-all.bat` (Windows) 或 `./build-all.sh` (Linux)
- [ ] 确认 frontend/dist 目录已创建
- [ ] 确认 admin-frontend/dist 目录已创建
- [ ] 检查构建日志无错误

### ✅ 启动系统
- [ ] 运行 `start-production.bat` (Windows) 或 `./start-production.sh` (Linux)
- [ ] 确认后端启动成功
- [ ] 检查控制台无错误信息

---

## 📋 验证阶段检查清单

### ✅ 基本功能测试
- [ ] 访问用户界面: `http://localhost:8000`
  - [ ] 页面正常加载
  - [ ] 无 JavaScript 错误
- [ ] 访问管理面板: `http://localhost:8000/admin`
  - [ ] 登录页面正常显示
  - [ ] 使用 admin/admin123 登录成功

### ✅ 管理面板测试
- [ ] 仪表板页面正常显示
- [ ] 统计数据正常加载
- [ ] 导航菜单正常工作

### ✅ 摄像头测试
- [ ] 进入"摄像头测试"页面
- [ ] 摄像头权限请求正常
- [ ] 摄像头画面正常显示
- [ ] 骨骼检测正常工作

### ✅ 用户管理测试
- [ ] 进入"用户管理"页面
- [ ] 用户列表正常显示
- [ ] 修改密码功能正常
- [ ] 创建新用户功能正常（管理员）

### ✅ 网络访问测试
- [ ] 从其他设备访问: `http://[服务器IP]:8000`
- [ ] 用户界面正常访问
- [ ] 管理面板正常访问
- [ ] 摄像头功能正常（HTTPS 可能需要）

---

## 📋 安全配置检查清单

### ✅ 密码安全
- [ ] 修改默认管理员密码
- [ ] 新密码至少 8 个字符
- [ ] 包含字母、数字、符号
- [ ] 记录在安全的地方

### ✅ 用户管理
- [ ] 创建至少 2 个管理员账号
- [ ] 为不同人员创建不同账号
- [ ] 删除不需要的测试账号

### ✅ 系统配置
- [ ] 检查 .env 文件权限（不要公开）
- [ ] 确认防火墙规则正确
- [ ] 确认仅在局域网内访问

---

## 📋 备份配置检查清单

### ✅ 初始备份
- [ ] 备份 data/admin.db
- [ ] 备份 config/ 目录
- [ ] 备份 .env 文件
- [ ] 记录备份位置和日期

### ✅ 定期备份计划
- [ ] 设置每周自动备份
- [ ] 或手动备份提醒
- [ ] 测试备份恢复流程

---

## 📋 文档检查清单

### ✅ 阅读文档
- [ ] OFFLINE_DEPLOYMENT_GUIDE.md - 离线部署指南
- [ ] QUICKSTART_DEPLOYMENT.md - 快速部署指南
- [ ] USER_MANAGEMENT_GUIDE.md - 用户管理指南
- [ ] PASSWORD_RECOVERY_QUICK_GUIDE.md - 密码恢复指南
- [ ] TROUBLESHOOTING.md - 故障排除指南

### ✅ 准备运维文档
- [ ] 记录服务器 IP 地址
- [ ] 记录管理员账号信息
- [ ] 记录备份位置
- [ ] 记录常见问题解决方案

---

## 📋 性能优化检查清单

### ✅ 系统资源
- [ ] 检查 CPU 使用率
- [ ] 检查内存使用率
- [ ] 检查磁盘空间
- [ ] 确认至少 50GB 可用空间

### ✅ 配置优化
- [ ] 根据需要调整 config/settings.json
- [ ] 设置合适的存储清理策略
- [ ] 设置合适的视频渲染参数

---

## 📋 培训检查清单

### ✅ 管理员培训
- [ ] 如何登录管理面板
- [ ] 如何创建和管理用户
- [ ] 如何修改系统设置
- [ ] 如何查看日志和统计
- [ ] 如何备份和恢复数据
- [ ] 如何处理常见问题

### ✅ 用户培训
- [ ] 如何使用系统
- [ ] 如何进行手势操作
- [ ] 如何下载生成的视频
- [ ] 常见问题处理

---

## 📋 上线前最终检查

### ✅ 功能完整性
- [ ] 所有核心功能正常工作
- [ ] 所有页面可以正常访问
- [ ] 摄像头和手势识别正常
- [ ] 视频生成和下载正常

### ✅ 性能稳定性
- [ ] 系统运行稳定，无崩溃
- [ ] 响应速度正常
- [ ] 内存无泄漏
- [ ] 磁盘空间充足

### ✅ 安全性
- [ ] 默认密码已修改
- [ ] 用户权限配置正确
- [ ] 网络访问限制正确
- [ ] 敏感信息已保护

### ✅ 文档和支持
- [ ] 所有文档已准备
- [ ] 运维人员已培训
- [ ] 联系方式已记录
- [ ] 应急预案已准备

---

## ✅ 部署完成

恭喜！系统已成功部署。

### 下一步
1. 监控系统运行状态
2. 定期检查日志
3. 定期备份数据
4. 收集用户反馈
5. 计划系统更新

### 紧急联系
- 技术支持文档: TROUBLESHOOTING.md
- 密码恢复: PASSWORD_RECOVERY_QUICK_GUIDE.md
- 用户管理: USER_MANAGEMENT_GUIDE.md

---

**部署日期**: _______________  
**部署人员**: _______________  
**服务器 IP**: _______________  
**备份位置**: _______________  
