import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../services/api'
import './QRCodeConfigPage.css'

interface QRCodeSettings {
  auto_detect_ip: boolean
  manual_ip: string | null
  port: number
}

export default function QRCodeConfigPage() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  
  const [settings, setSettings] = useState<QRCodeSettings>({
    auto_detect_ip: true,
    manual_ip: null,
    port: 8000,
  })
  const [currentIp, setCurrentIp] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const [allSettings, lanIpData] = await Promise.all([
        adminApi.getSettings(),
        adminApi.getLanIp(),
      ])
      setSettings(allSettings.qr_code)
      setCurrentIp(lanIpData.ip)
    } catch (err: any) {
      setError(err.message || t('settings.qrcode.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleAutoDetectChange = (autoDetect: boolean) => {
    setSettings(prev => ({ ...prev, auto_detect_ip: autoDetect }))
  }


  const handleInputChange = (field: keyof QRCodeSettings, value: string | number) => {
    setSettings(prev => ({ ...prev, [field]: value || null }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      
      // Validate manual IP if not using auto-detect
      if (!settings.auto_detect_ip && settings.manual_ip) {
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
        if (!ipPattern.test(settings.manual_ip)) {
          setError(t('settings.qrcode.invalidIp'))
          setSaving(false)
          return
        }
      }
      
      await adminApi.updateSettings({ qr_code: settings })
      
      // Refresh the current IP display
      const lanIpData = await adminApi.getLanIp()
      setCurrentIp(lanIpData.ip)
      
      setSuccess(t('settings.qrcode.saveSuccess'))
    } catch (err: any) {
      setError(err.detail || err.message || t('settings.qrcode.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const getQRCodeUrl = () => {
    const ip = settings.auto_detect_ip ? currentIp : (settings.manual_ip || currentIp)
    return `http://${ip}:${settings.port}/download/`
  }

  if (loading) {
    return (
      <div className="qrcode-config-container">
        <div className="loading">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="qrcode-config-container">
      <header className="page-header">
        <div className="header-left">
          <Link to="/dashboard" className="back-link">← {t('common.back')}</Link>
          <h1>{t('settings.qrcode.title')}</h1>
        </div>
        <div className="user-info">
          <span>{user?.username}</span>
          <button onClick={logout}>{t('dashboard.logout')}</button>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="settings-card">
          <h2>{t('settings.qrcode.currentIp')}</h2>
          <div className="current-ip-display">
            <span className="ip-value">{currentIp}</span>
            <span className="ip-label">
              {settings.auto_detect_ip 
                ? t('settings.qrcode.autoDetected') 
                : t('settings.qrcode.manuallySet')}
            </span>
          </div>
        </div>

        <div className="settings-card">
          <h2>{t('settings.qrcode.ipConfig')}</h2>
          
          <div className="toggle-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={settings.auto_detect_ip}
                onChange={(e) => handleAutoDetectChange(e.target.checked)}
              />
              <span className="toggle-text">{t('settings.qrcode.autoDetectIp')}</span>
            </label>
            <span className="toggle-hint">{t('settings.qrcode.autoDetectHint')}</span>
          </div>

          {!settings.auto_detect_ip && (
            <div className="form-group">
              <label htmlFor="manual_ip">{t('settings.qrcode.manualIp')}</label>
              <input
                id="manual_ip"
                type="text"
                value={settings.manual_ip || ''}
                onChange={(e) => handleInputChange('manual_ip', e.target.value)}
                placeholder="192.168.1.100"
              />
              <span className="field-hint">{t('settings.qrcode.manualIpHint')}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="port">{t('settings.qrcode.port')}</label>
            <input
              id="port"
              type="number"
              min="1"
              max="65535"
              value={settings.port}
              onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 8000)}
            />
          </div>
        </div>

        <div className="settings-card">
          <h2>{t('settings.qrcode.preview')}</h2>
          <div className="qr-preview">
            <div className="qr-placeholder">
              <span className="qr-icon">📱</span>
              <span className="qr-text">{t('settings.qrcode.sampleQr')}</span>
            </div>
            <div className="qr-url">
              <label>{t('settings.qrcode.encodedUrl')}</label>
              <code>{getQRCodeUrl()}</code>
            </div>
          </div>
        </div>

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
