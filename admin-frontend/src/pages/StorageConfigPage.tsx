import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../services/api'
import './StorageConfigPage.css'

interface StorageSettings {
  mode: 'local' | 's3'
  local_path: string
  auto_cleanup_enabled: boolean
  auto_cleanup_threshold: number
  s3_bucket: string | null
  s3_region: string | null
  s3_access_key: string | null
  s3_secret_key: string | null
}

interface StorageStats {
  total_space_gb: number
  used_space_gb: number
  available_space_gb: number
  usage_percentage: number
  warning_threshold: number
  is_warning: boolean
  session_files_count: number
  video_files_count: number
  total_data_size_mb: number
  absolute_path: string
}

export default function StorageConfigPage() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  
  const [settings, setSettings] = useState<StorageSettings>({
    mode: 'local',
    local_path: 'data/outputs',
    auto_cleanup_enabled: false,
    auto_cleanup_threshold: 24,
    s3_bucket: null,
    s3_region: null,
    s3_access_key: null,
    s3_secret_key: null,
  })
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [activeTab, setActiveTab] = useState<'config' | 'cleanup'>('config')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const [settingsData, statsData] = await Promise.all([
        adminApi.getStorageSettings(),
        adminApi.getStorageUsage()
      ])
      setSettings(settingsData)
      setStats(statsData.storage)
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


  const handleManualCleanup = async () => {
    if (!window.confirm(t('settings.storage.confirmCleanup', { defaultValue: 'Are you sure you want to delete ALL generated video files?' }))) {
      return
    }

    try {
      setCleaning(true)
      const result = await adminApi.cleanupStorage(0) // 0 means delete all
      setSuccess(t('settings.storage.cleanupSuccess', { 
        count: result.files_deleted, 
        size: result.space_freed_mb,
        defaultValue: `Cleanup completed: ${result.files_deleted} files deleted, ${result.space_freed_mb} MB freed`
      }))
      // Reload stats after cleanup
      const statsData = await adminApi.getStorageUsage()
      setStats(statsData.storage)
    } catch (err: any) {
      setError(err.message || t('settings.storage.cleanupError', { defaultValue: 'Cleanup failed' }))
    } finally {
      setCleaning(false)
    }
  }

  const handleInputChange = (field: keyof StorageSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }))
    setTestResult(null)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      
      await adminApi.updateStorageSettings(settings as unknown as Record<string, unknown>)
      setSuccess(t('settings.storage.saveSuccess'))
      
      // Reload stats after save
      const statsData = await adminApi.getStorageUsage()
      setStats(statsData.storage)
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

  const handleSelectFolder = async () => {
    try {
      // Only available in Electron environment with access to dialog API
      // Since this is a web app served by Python backend, we need a backend API to open the dialog
      const response = await adminApi.browseStoragePath();
      if (response.path) {
        handleInputChange('local_path', response.path);
      }
    } catch (err: any) {
      // If backend browsing fails (e.g. not supported on headless server), show error
      console.error('Failed to browse folder:', err);
      // Fallback or error message could be shown here
      alert(t('settings.storage.browseError') || 'Failed to open folder browser. Please enter path manually.');
    }
  };

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
        <Link to="/dashboard" className="btn-back">← {t('common.back')}</Link>
        <h1>{t('settings.storage.title')}</h1>
        <div className="header-actions">
          <span className="user-name">{user?.username}</span>
          <button className="btn-secondary" onClick={logout}>{t('dashboard.logout')}</button>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="tabs-container" style={{ marginBottom: '20px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: '20px' }}>
          <button 
            className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
            style={{ 
              padding: '10px 20px', 
              background: 'none', 
              border: 'none', 
              borderBottom: activeTab === 'config' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'config' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 500
            }}
          >
            {t('settings.storage.title')}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'cleanup' ? 'active' : ''}`}
            onClick={() => setActiveTab('cleanup')}
            style={{ 
              padding: '10px 20px', 
              background: 'none', 
              border: 'none', 
              borderBottom: activeTab === 'cleanup' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'cleanup' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 500
            }}
          >
            {t('settings.storage.cleanupManagement', { defaultValue: 'Cleanup Management' })}
          </button>
        </div>

        {activeTab === 'config' && (
          <>
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
              <>
                <div className="settings-card">
                  <h2>{t('settings.storage.storageStats')}</h2>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <div className="stat-label">{t('settings.storage.currentLocation')}</div>
                      {/* Show absolute path as primary, relative path as detail */}
                      {stats?.absolute_path ? (
                        <>
                          <div className="stat-value small" style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>
                            {stats.absolute_path}
                          </div>
                          {settings.local_path && settings.local_path !== stats.absolute_path && (
                            <div className="stat-detail" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-all' }}>
                              ({settings.local_path})
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="stat-value small" style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>
                          {settings.local_path || 'data'}
                        </div>
                      )}
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">{t('settings.storage.totalFiles')}</div>
                      <div className="stat-value">
                        {stats ? (stats.session_files_count + stats.video_files_count) : 0}
                      </div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">{t('settings.storage.totalSize')}</div>
                      <div className="stat-value">
                        {stats ? stats.total_data_size_mb.toFixed(2) : 0} MB
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-card">
                  <h2>{t('settings.storage.localConfig')}</h2>
                  <div className="form-group">
                    <label htmlFor="local_path">{t('settings.storage.localPath')}</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        id="local_path"
                        type="text"
                        value={settings.local_path}
                        onChange={(e) => handleInputChange('local_path', e.target.value)}
                        placeholder="data/outputs"
                        style={{ flex: 1 }}
                      />
                      <button 
                        type="button"
                        className="btn-secondary"
                        onClick={handleSelectFolder}
                        style={{ whiteSpace: 'nowrap', padding: '0.75rem 1.5rem' }}
                      >
                        {t('settings.storage.browse') || 'Select Folder'}
                      </button>
                    </div>
                    <span className="field-hint">{t('settings.storage.localPathHint')}</span>
                  </div>
                </div>
              </>
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
          </>
        )}

        {activeTab === 'cleanup' && (
          <div className="settings-card">
            <h2>{t('settings.storage.cleanupManagement', { defaultValue: 'Cleanup Management' })}</h2>
            <div className="storage-grid">
              <div className="form-group" style={{ marginBottom: '30px' }}>
                 <label style={{ fontSize: '1.1rem', marginBottom: '10px' }}>{t('settings.storage.manualCleanup', { defaultValue: 'Manual Cleanup' })}</label>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                   <button 
                     className="btn-danger" 
                     onClick={handleManualCleanup}
                     disabled={cleaning}
                     style={{ 
                       padding: '10px 20px', 
                       backgroundColor: 'var(--error)', 
                       color: 'white', 
                       border: 'none', 
                       borderRadius: '6px', 
                       cursor: cleaning ? 'not-allowed' : 'pointer',
                       opacity: cleaning ? 0.7 : 1
                     }}
                   >
                     {cleaning ? t('common.processing', { defaultValue: 'Processing...' }) : t('settings.storage.cleanAllFiles', { defaultValue: 'Clean All Generated Files' })}
                   </button>
                   <span className="field-hint" style={{ margin: 0 }}>{t('settings.storage.manualCleanupHint', { defaultValue: 'Immediately delete all locally cached generated video files' })}</span>
                 </div>
              </div>

              <div className="form-group" style={{ borderTop: '1px solid var(--divider)', paddingTop: '20px' }}>
                <label style={{ fontSize: '1.1rem', marginBottom: '15px' }}>{t('settings.storage.autoCleanup', { defaultValue: 'Auto Cleanup' })}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.auto_cleanup_enabled}
                      onChange={(e) => handleInputChange('auto_cleanup_enabled', e.target.checked)}
                    />
                    <span className="slider round"></span>
                  </label>
                  <span className="switch-label">
                    {settings.auto_cleanup_enabled 
                      ? t('common.enabled', { defaultValue: 'Enabled' }) 
                      : t('common.disabled', { defaultValue: 'Disabled' })}
                  </span>
                </div>
              </div>

              {settings.auto_cleanup_enabled && (
                <div className="form-group">
                  <label htmlFor="auto_cleanup_threshold">
                    {t('settings.storage.cleanupThreshold', { defaultValue: 'Cleanup Threshold' })}
                  </label>
                  <div className="input-with-unit">
                    <input
                      id="auto_cleanup_threshold"
                      type="number"
                      min="1"
                      value={settings.auto_cleanup_threshold}
                      onChange={(e) => handleInputChange('auto_cleanup_threshold', parseInt(e.target.value) || 1)}
                    />
                    <span className="unit">{t('common.hours', { defaultValue: 'Hours' })}</span>
                  </div>
                  <span className="field-hint">
                    {t('settings.storage.cleanupThresholdHint', { defaultValue: 'Files older than this will be automatically deleted' })}
                  </span>
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
