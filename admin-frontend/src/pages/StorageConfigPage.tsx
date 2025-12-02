import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../services/api'
import './StorageConfigPage.css'

interface StorageSettings {
  mode: 'local' | 's3'
  local_path: string
  s3_bucket: string | null
  s3_region: string | null
  s3_access_key: string | null
  s3_secret_key: string | null
}

export default function StorageConfigPage() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  
  const [settings, setSettings] = useState<StorageSettings>({
    mode: 'local',
    local_path: 'data/outputs',
    s3_bucket: null,
    s3_region: null,
    s3_access_key: null,
    s3_secret_key: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await adminApi.getStorageSettings()
      setSettings(data)
    } catch (err: any) {
      setError(err.message || t('settings.storage.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleModeChange = (mode: 'local' | 's3') => {
    setSettings(prev => ({ ...prev, mode }))
    setTestResult(null)
  }


  const handleInputChange = (field: keyof StorageSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value || null }))
    setTestResult(null)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      
      await adminApi.updateStorageSettings(settings as unknown as Record<string, unknown>)
      setSuccess(t('settings.storage.saveSuccess'))
    } catch (err: any) {
      setError(err.detail || err.message || t('settings.storage.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (!settings.s3_bucket || !settings.s3_region || !settings.s3_access_key || !settings.s3_secret_key) {
      setTestResult({ success: false, message: t('settings.storage.s3FieldsRequired') })
      return
    }

    try {
      setTesting(true)
      setTestResult(null)
      
      const result = await adminApi.testS3Connection({
        bucket: settings.s3_bucket,
        region: settings.s3_region,
        access_key: settings.s3_access_key,
        secret_key: settings.s3_secret_key,
      })
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ 
        success: false, 
        message: err.detail || err.message || t('settings.storage.testError') 
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="storage-config-container">
        <div className="loading">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="storage-config-container">
      <header className="page-header">
        <Link to="/dashboard" className="btn-back">← 返回首页</Link>
        <h1>{t('settings.storage.title')}</h1>
        <div className="header-actions">
          <span className="user-name">{user?.username}</span>
          <button className="btn-secondary" onClick={logout}>{t('dashboard.logout')}</button>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="settings-card">
          <h2>{t('settings.storage.modeTitle')}</h2>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${settings.mode === 'local' ? 'active' : ''}`}
              onClick={() => handleModeChange('local')}
            >
              <span className="mode-icon">💾</span>
              <span className="mode-label">{t('settings.storage.localMode')}</span>
            </button>
            <button
              className={`mode-btn ${settings.mode === 's3' ? 'active' : ''}`}
              onClick={() => handleModeChange('s3')}
            >
              <span className="mode-icon">☁️</span>
              <span className="mode-label">{t('settings.storage.s3Mode')}</span>
            </button>
          </div>
        </div>

        {settings.mode === 'local' && (
          <div className="settings-card">
            <h2>{t('settings.storage.localConfig')}</h2>
            <div className="form-group">
              <label htmlFor="local_path">{t('settings.storage.localPath')}</label>
              <input
                id="local_path"
                type="text"
                value={settings.local_path}
                onChange={(e) => handleInputChange('local_path', e.target.value)}
                placeholder="data/outputs"
              />
              <span className="field-hint">{t('settings.storage.localPathHint')}</span>
            </div>
          </div>
        )}

        {settings.mode === 's3' && (
          <div className="settings-card">
            <h2>{t('settings.storage.s3Config')}</h2>
            
            <div className="form-group">
              <label htmlFor="s3_bucket">{t('settings.storage.s3Bucket')} *</label>
              <input
                id="s3_bucket"
                type="text"
                value={settings.s3_bucket || ''}
                onChange={(e) => handleInputChange('s3_bucket', e.target.value)}
                placeholder="my-bucket-name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="s3_region">{t('settings.storage.s3Region')} *</label>
              <input
                id="s3_region"
                type="text"
                value={settings.s3_region || ''}
                onChange={(e) => handleInputChange('s3_region', e.target.value)}
                placeholder="us-east-1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="s3_access_key">{t('settings.storage.s3AccessKey')} *</label>
              <input
                id="s3_access_key"
                type="text"
                value={settings.s3_access_key || ''}
                onChange={(e) => handleInputChange('s3_access_key', e.target.value)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
              />
            </div>

            <div className="form-group">
              <label htmlFor="s3_secret_key">{t('settings.storage.s3SecretKey')} *</label>
              <input
                id="s3_secret_key"
                type="password"
                value={settings.s3_secret_key || ''}
                onChange={(e) => handleInputChange('s3_secret_key', e.target.value)}
                placeholder="••••••••••••••••"
              />
            </div>

            <div className="test-connection">
              <button
                className="test-btn"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? t('settings.storage.testing') : t('settings.storage.testConnection')}
              </button>
              {testResult && (
                <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.success ? '✓' : '✗'} {testResult.message}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="action-buttons">
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </main>
    </div>
  )
}
