# 用户管理指南 (User Management Guide)

## 概述

管理后台现在提供了完整的用户管理功能，支持在不联网的情况下通过后台界面管理账号。

## 功能特性

### 1. 用户列表查看
- 显示所有用户的基本信息（用户名、角色、创建时间、最后登录时间）
- 高亮显示当前登录用户
- 区分管理员和操作员角色

### 2. 创建新用户（仅管理员）
- 设置用户名（至少3个字符）
- 设置密码（至少6个字符）
- 选择角色：
  - **管理员 (Admin)**: 可以创建/删除用户，管理所有系统设置
  - **操作员 (Operator)**: 可以查看和编辑角色、剧情等内容，但不能管理用户

### 3. 修改密码（所有用户）
- 任何用户都可以修改自己的密码
- 需要输入当前密码进行验证
- 新密码至少6个字符
- 新密码不能与当前密码相同

### 4. 删除用户（仅管理员）
- 管理员可以删除其他用户
- 不能删除自己的账号
- 删除前需要二次确认

## 访问方式

1. 登录管理后台
2. 在仪表板页面点击"用户管理"卡片（仅管理员可见）
3. 或直接访问 `/users` 路径

## 使用流程

### 创建新用户
1. 点击"+ 创建新用户"按钮
2. 填写用户名、密码、确认密码
3. 选择角色（管理员或操作员）
4. 点击"创建用户"

### 修改密码（自己的密码）
1. 点击"🔑 修改密码"按钮
2. 输入当前密码
3. 输入新密码并确认
4. 点击"确认修改"

### 重置密码（管理员重置其他用户）
1. 在用户列表中找到要重置密码的用户
2. 点击"重置密码"按钮
3. 输入新密码并确认
4. 点击"确认重置"
5. **注意**：重置密码不需要知道原密码

### 删除用户
1. 在用户列表中找到要删除的用户
2. 点击"删除"按钮
3. 再次点击"确认删除？"按钮确认操作

## 技术实现

### 后端 API

- `GET /api/admin/users` - 获取用户列表
- `POST /api/admin/users` - 创建新用户（需要管理员权限）
- `DELETE /api/admin/users/{user_id}` - 删除用户（需要管理员权限）
- `PUT /api/admin/users/me/password` - 修改当前用户密码
- `PUT /api/admin/users/{user_id}/password` - 重置其他用户密码（需要管理员权限）

### 前端路由

- `/users` - 用户管理页面（需要登录）

### 数据存储

- 用户数据存储在 SQLite 数据库 (`data/admin.db`)
- 密码使用 bcrypt 加密存储
- JWT token 用于身份验证

## 安全特性

1. **密码加密**: 使用 bcrypt 算法加密存储密码
2. **JWT 认证**: 使用 JWT token 进行身份验证
3. **角色权限**: 基于角色的访问控制（RBAC）
4. **密码验证**: 修改密码时需要验证当前密码
5. **防止自删除**: 用户不能删除自己的账号
6. **二次确认**: 删除操作需要二次确认

## 默认账号

系统初始化时会自动创建默认管理员账号：
- 用户名: `admin`
- 密码: `admin123`

**重要**: 首次登录后请立即修改默认密码！

## 注意事项

1. 系统至少需要保留一个管理员账号
2. 密码长度至少6个字符，建议使用更强的密码
3. 定期修改密码以提高安全性
4. 不要与他人共享管理员账号
5. 数据库文件 `data/admin.db` 包含所有用户信息，请妥善保管

## 故障排除

### 忘记密码

#### 方法1：使用其他管理员账号重置
如果还有其他管理员账号可以登录：
1. 使用其他管理员账号登录
2. 在用户列表中找到忘记密码的用户
3. 点击"重置密码"按钮
4. 设置新密码

#### 方法2：使用紧急恢复脚本（推荐）
如果所有管理员账号都无法登录，使用紧急恢复脚本：

**Windows:**
```bash
# 重置 admin 账号为默认密码 admin123
reset-admin-password.bat

# 或指定用户名和新密码
reset-admin-password.bat admin mynewpassword
```

**Linux/macOS:**
```bash
# 重置 admin 账号为默认密码 admin123
./reset-admin-password.sh

# 或指定用户名和新密码
./reset-admin-password.sh admin mynewpassword
```

#### 方法3：删除数据库（最后手段）
⚠️ **警告**：此操作会删除所有用户数据！
```bash
# Windows
del data\admin.db

# Linux/macOS
rm data/admin.db
```
系统会在下次启动时重新创建默认管理员账号（admin / admin123）

### 无法登录
1. 检查用户名和密码是否正确
2. 确认数据库文件 `data/admin.db` 存在
3. 查看后端日志排查错误

## 相关文件

### 前端
- 用户管理页面: `admin-frontend/src/pages/UserManagementPage.tsx`
- 页面样式: `admin-frontend/src/pages/UserManagementPage.css`
- API 客户端: `admin-frontend/src/services/api.ts`

### 后端
- API 端点: `backend/app/api/admin/users.py`
- 认证服务: `backend/app/services/admin/auth_service.py`
- 用户模型: `backend/app/models/admin/user.py`
- 数据库配置: `backend/app/database.py`

### 工具脚本
- 紧急恢复脚本: `reset-admin-password.py`
- Windows 批处理: `reset-admin-password.bat`
- Linux/macOS 脚本: `reset-admin-password.sh`
- 功能测试: `test-user-management.bat`
