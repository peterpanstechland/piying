import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import './UserManagementPage.css'

interface User {
  id: string
  username: string
  role: string
  created_at: string
  last_login: string | null
}

interface CreateUserForm {
  username: string
  password: string
  confirmPassword: string
  role: string
}

interface PasswordChangeForm {
  oldPassword: string
  newPassword: string
  confirmNewPassword: string
}

interface ResetPasswordForm {
  newPassword: string
  confirmNewPassword: string
}

export default function UserManagementPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: '',
    password: '',
    confirmPassword: '',
    role: 'operator'
  })
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [passwordForm, setPasswordForm] = useState<PasswordChangeForm>({
    oldPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetForm, setResetForm] = useState<ResetPasswordForm>({
    newPassword: '',
    confirmNewPassword: ''
  })
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await adminApi.getUsers()
      setUsers(data)
    } catch (err: any) {
      setError(err.detail || err.message || '加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    // Validation
    if (!createForm.username.trim()) {
      setCreateError('用户名不能为空')
      return
    }
    if (createForm.username.length < 3) {
      setCreateError('用户名至少需要3个字符')
      return
    }
    if (!createForm.password) {
      setCreateError('密码不能为空')
      return
    }
    if (createForm.password.length < 6) {
      setCreateError('密码至少需要6个字符')
      return
    }
    if (createForm.password !== createForm.confirmPassword) {
      setCreateError('两次输入的密码不一致')
      return
    }

    try {
      await adminApi.createUser({
        username: createForm.username,
        password: createForm.password,
        role: createForm.role
      })
      
      // Reset form and reload users
      setCreateForm({
        username: '',
        password: '',
        confirmPassword: '',
        role: 'operator'
      })
      setShowCreateForm(false)
      await loadUsers()
    } catch (err: any) {
      setCreateError(err.detail || err.message || '创建用户失败')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (deleteConfirm !== userId) {
      setDeleteConfirm(userId)
      return
    }

    try {
      await adminApi.deleteUser(userId)
      setDeleteConfirm(null)
      await loadUsers()
    } catch (err: any) {
      setError(err.detail || err.message || '删除用户失败')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '从未登录'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }

  const isCurrentUser = (userId: string) => {
    // currentUser from AuthContext has 'sub' field from JWT token
    return (currentUser as any)?.sub === userId
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    // Validation
    if (!passwordForm.oldPassword) {
      setPasswordError('请输入当前密码')
      return
    }
    if (!passwordForm.newPassword) {
      setPasswordError('请输入新密码')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('新密码至少需要6个字符')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }
    if (passwordForm.oldPassword === passwordForm.newPassword) {
      setPasswordError('新密码不能与当前密码相同')
      return
    }

    try {
      await adminApi.changePassword(passwordForm.oldPassword, passwordForm.newPassword)
      
      // Reset form and show success
      setPasswordForm({
        oldPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      })
      setPasswordSuccess(true)
      setTimeout(() => {
        setShowPasswordChange(false)
        setPasswordSuccess(false)
      }, 2000)
    } catch (err: any) {
      setPasswordError(err.detail || err.message || '修改密码失败')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError(null)
    setResetSuccess(false)

    if (!resetUserId) return

    // Validation
    if (!resetForm.newPassword) {
      setResetError('请输入新密码')
      return
    }
    if (resetForm.newPassword.length < 6) {
      setResetError('新密码至少需要6个字符')
      return
    }
    if (resetForm.newPassword !== resetForm.confirmNewPassword) {
      setResetError('两次输入的新密码不一致')
      return
    }

    try {
      await adminApi.resetUserPassword(resetUserId, resetForm.newPassword)
      
      // Reset form and show success
      setResetForm({
        newPassword: '',
        confirmNewPassword: ''
      })
      setResetSuccess(true)
      setTimeout(() => {
        setResetUserId(null)
        setResetSuccess(false)
      }, 2000)
    } catch (err: any) {
      setResetError(err.detail || err.message || '重置密码失败')
    }
  }

  const openResetDialog = (userId: string) => {
    setResetUserId(userId)
    setResetForm({
      newPassword: '',
      confirmNewPassword: ''
    })
    setResetError(null)
    setResetSuccess(false)
  }

  const closeResetDialog = () => {
    setResetUserId(null)
    setResetForm({
      newPassword: '',
      confirmNewPassword: ''
    })
    setResetError(null)
    setResetSuccess(false)
  }

  if (loading) {
    return (
      <div className="user-management-page">
        <div className="loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="user-management-page">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          ← 返回
        </button>
        <h1>用户管理</h1>
        <div className="header-actions">
          <button 
            className="password-button"
            onClick={() => setShowPasswordChange(!showPasswordChange)}
          >
            {showPasswordChange ? '取消' : '🔑 修改密码'}
          </button>
          {currentUser?.role === 'admin' && (
            <button 
              className="create-button"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              {showCreateForm ? '取消' : '+ 创建新用户'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {showPasswordChange && (
        <div className="password-change-container">
          <h2>修改密码</h2>
          <form onSubmit={handlePasswordChange}>
            <div className="form-group">
              <label>当前密码</label>
              <input
                type="password"
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                placeholder="输入当前密码"
                autoComplete="current-password"
              />
            </div>

            <div className="form-group">
              <label>新密码</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="至少6个字符"
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label>确认新密码</label>
              <input
                type="password"
                value={passwordForm.confirmNewPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmNewPassword: e.target.value })}
                placeholder="再次输入新密码"
                autoComplete="new-password"
              />
            </div>

            {passwordError && (
              <div className="form-error">{passwordError}</div>
            )}

            {passwordSuccess && (
              <div className="form-success">密码修改成功！</div>
            )}

            <div className="form-actions">
              <button type="submit" className="submit-button">
                确认修改
              </button>
              <button 
                type="button" 
                className="cancel-button"
                onClick={() => {
                  setShowPasswordChange(false)
                  setPasswordError(null)
                  setPasswordSuccess(false)
                  setPasswordForm({
                    oldPassword: '',
                    newPassword: '',
                    confirmNewPassword: ''
                  })
                }}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {showCreateForm && (
        <div className="create-form-container">
          <h2>创建新用户</h2>
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label>用户名</label>
              <input
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="至少3个字符"
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="至少6个字符"
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label>确认密码</label>
              <input
                type="password"
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                placeholder="再次输入密码"
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label>角色</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              >
                <option value="operator">操作员 (Operator)</option>
                <option value="admin">管理员 (Admin)</option>
              </select>
              <small>管理员可以创建和删除用户，操作员只能查看和编辑内容</small>
            </div>

            {createError && (
              <div className="form-error">{createError}</div>
            )}

            <div className="form-actions">
              <button type="submit" className="submit-button">
                创建用户
              </button>
              <button 
                type="button" 
                className="cancel-button"
                onClick={() => {
                  setShowCreateForm(false)
                  setCreateError(null)
                }}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="users-list">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>角色</th>
              <th>创建时间</th>
              <th>最后登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={isCurrentUser(user.id) ? 'current-user' : ''}>
                <td>
                  {user.username}
                  {isCurrentUser(user.id) && <span className="badge">当前用户</span>}
                </td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role === 'admin' ? '管理员' : '操作员'}
                  </span>
                </td>
                <td>{formatDate(user.created_at)}</td>
                <td>{formatDate(user.last_login)}</td>
                <td>
                  <div className="action-buttons">
                    {currentUser?.role === 'admin' && !isCurrentUser(user.id) && (
                      <>
                        <button
                          className="reset-password-button"
                          onClick={() => openResetDialog(user.id)}
                        >
                          重置密码
                        </button>
                        <button
                          className={`delete-button ${deleteConfirm === user.id ? 'confirm' : ''}`}
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          {deleteConfirm === user.id ? '确认删除？' : '删除'}
                        </button>
                      </>
                    )}
                    {isCurrentUser(user.id) && (
                      <span className="no-action">-</span>
                    )}
                    {currentUser?.role !== 'admin' && (
                      <span className="no-action">无权限</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="empty-state">
            暂无用户
          </div>
        )}
      </div>

      {/* Reset Password Dialog */}
      {resetUserId && (
        <div className="modal-overlay" onClick={closeResetDialog}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>重置用户密码</h2>
            <p className="modal-description">
              为用户 <strong>{users.find(u => u.id === resetUserId)?.username}</strong> 设置新密码
            </p>
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label>新密码</label>
                <input
                  type="password"
                  value={resetForm.newPassword}
                  onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                  placeholder="至少6个字符"
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label>确认新密码</label>
                <input
                  type="password"
                  value={resetForm.confirmNewPassword}
                  onChange={(e) => setResetForm({ ...resetForm, confirmNewPassword: e.target.value })}
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                />
              </div>

              {resetError && (
                <div className="form-error">{resetError}</div>
              )}

              {resetSuccess && (
                <div className="form-success">密码重置成功！</div>
              )}

              <div className="form-actions">
                <button type="submit" className="submit-button">
                  确认重置
                </button>
                <button 
                  type="button" 
                  className="cancel-button"
                  onClick={closeResetDialog}
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="help-section">
        <h3>💡 使用说明</h3>
        <ul>
          <li><strong>管理员</strong>可以创建新用户、删除用户、重置密码，以及管理所有系统设置</li>
          <li><strong>操作员</strong>可以查看和编辑角色、剧情等内容，但不能管理用户</li>
          <li>点击"修改密码"按钮可以修改自己的密码，需要输入当前密码验证</li>
          <li>管理员可以点击"重置密码"为其他用户设置新密码，无需知道原密码</li>
          <li>不能删除自己的账号，请使用其他管理员账号操作</li>
          <li>如果唯一的管理员忘记密码，请参考文档中的紧急恢复方法</li>
        </ul>
      </div>
    </div>
  )
}
