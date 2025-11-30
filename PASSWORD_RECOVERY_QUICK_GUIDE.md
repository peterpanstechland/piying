# 密码恢复快速指南 / Password Recovery Quick Guide

## 场景 1：忘记自己的密码，但有其他管理员账号

### 解决方案：管理员重置
1. 使用其他管理员账号登录
2. 进入"用户管理"页面
3. 找到忘记密码的用户
4. 点击"重置密码"
5. 输入新密码并确认

---

## 场景 2：唯一的管理员账号忘记密码

### 解决方案：使用紧急恢复脚本

#### Windows:
```bash
# 方法 1：使用默认密码（admin123）
reset-admin-password.bat

# 方法 2：指定新密码
reset-admin-password.bat admin mynewpassword
```

#### Linux/macOS:
```bash
# 方法 1：使用默认密码（admin123）
./reset-admin-password.sh

# 方法 2：指定新密码
./reset-admin-password.sh admin mynewpassword
```

#### 使用 Python 直接运行:
```bash
# 激活虚拟环境（如果有）
source venv/bin/activate  # Linux/macOS
venv\Scripts\activate.bat  # Windows

# 运行脚本
python reset-admin-password.py admin mynewpassword
```

---

## 场景 3：数据库损坏或无法访问

### 解决方案：重建数据库

⚠️ **警告**：此操作会删除所有用户数据！

#### Windows:
```bash
del data\admin.db
```

#### Linux/macOS:
```bash
rm data/admin.db
```

系统会在下次启动时自动创建默认管理员账号：
- 用户名：`admin`
- 密码：`admin123`

---

## 紧急恢复脚本说明

### 功能
- 直接操作数据库重置用户密码
- 无需登录系统
- 需要服务器物理访问权限或 SSH 访问

### 使用场景
- 所有管理员账号都无法登录
- 忘记唯一管理员密码
- 需要快速恢复访问权限

### 安全性
- 需要服务器文件系统访问权限
- 操作会记录在系统日志中
- 建议重置后立即修改为强密码

---

## 预防措施

1. **创建多个管理员账号** - 避免单点故障
2. **定期备份数据库** - `data/admin.db`
3. **使用强密码** - 至少 8 个字符，包含字母、数字、符号
4. **记录密码** - 使用密码管理器或安全的方式记录
5. **定期更换密码** - 建议每 3-6 个月更换一次

---

## 常见问题

### Q: 紧急恢复脚本在哪里？
A: 项目根目录下的 `reset-admin-password.py`、`reset-admin-password.bat`（Windows）或 `reset-admin-password.sh`（Linux/macOS）

### Q: 脚本需要什么权限？
A: 需要读写 `data/admin.db` 文件的权限

### Q: 可以重置任何用户的密码吗？
A: 是的，脚本可以重置任何用户的密码，只需指定用户名

### Q: 重置后原密码还能用吗？
A: 不能，密码会被立即替换为新密码

### Q: 如何查看所有用户？
A: 登录管理面板后进入"用户管理"页面，或使用数据库工具查看 `data/admin.db`

---

## 技术支持

如果以上方法都无法解决问题，请：
1. 检查 `data/logs/app.log` 查看错误日志
2. 确认数据库文件 `data/admin.db` 存在且可访问
3. 确认 Python 环境和依赖包已正确安装
4. 查看 `USER_MANAGEMENT_GUIDE.md` 获取详细文档
