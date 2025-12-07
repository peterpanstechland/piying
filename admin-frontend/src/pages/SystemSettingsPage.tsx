import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../services/api'
import './SystemSettingsPage.css'

interface TimeoutSettings {
  idle_to_scene_select_seconds: number
  scene_select_inactivity_seconds: number
  motion_capture_inactivity_seconds: number
  final_result_auto_reset_seconds: number
  exit_gesture_duration_seconds: number
  exit_confirmation_duration_seconds: number
}

interface RenderingSettings {
  target_fps: number
  video_codec: string
  max_render_time_seconds: number
  composition_mode: string
  video_encoder: string
  encoder_preset: string
  encoder_quality: number
}

interface SystemSettings {
  theme: string
  language: string
  fallback_language: string
  timeouts: TimeoutSettings
  rendering: RenderingSettings
}

const VALID_CODECS = ['H264', 'H265', 'VP9']
const VALID_COMPOSITION_MODES = [
  { value: 'side_by_side', label: 'Side-by-Side (High Quality)' },
  { value: 'chromakey', label: 'Chromakey (Green Screen)' }
]
const VALID_ENCODERS = ['h264_nvenc', 'libx264', 'hevc_nvenc', 'libx265']
const VALID_PRESETS = ['fast', 'medium', 'slow', 'veryslow']

export default function SystemSettingsPage() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, i18n } = useTranslation()
  
  const [settings, setSettings] = useState<SystemSettings>({
    theme: 'dark',
    language: 'zh',
    fallback_language: 'en',
    timeouts: {
      idle_to_scene_select_seconds: 1,
      scene_select_inactivity_seconds: 10,
      motion_capture_inactivity_seconds: 15,
      final_result_auto_reset_seconds: 30,
      exit_gesture_duration_seconds: 3,
      exit_confirmation_duration_seconds: 2,
    },
    rendering: {
      target_fps: 30,
      video_codec: 'H264',
      max_render_time_seconds: 20,
      composition_mode: 'side_by_side',
      video_encoder: 'h264_nvenc',
      encoder_preset: 'slow',
      encoder_quality: 19,
    }
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})


  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await adminApi.getSettings()
      setSettings({
        theme: data.theme || 'dark',
        language: data.language,
        fallback_language: data.fallback_language,
        timeouts: data.timeouts,
        rendering: data.rendering,
      })
      // Sync theme with global state
      if (data.theme && data.theme !== theme) {
        setTheme(data.theme as 'light' | 'dark')
      }
    } catch (err: any) {
      setError(err.message || t('settings.system.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const validateTimeoutValue = (value: number): boolean => {
    return value >= 1 && value <= 300
  }

  const handleLanguageChange = (language: string) => {
    setSettings(prev => ({ ...prev, language }))
  }

  const handleTimeoutChange = (field: keyof TimeoutSettings, value: string) => {
    const numValue = parseInt(value) || 0
    setSettings(prev => ({
      ...prev,
      timeouts: { ...prev.timeouts, [field]: numValue },
    }))
    
    // Validate
    if (!validateTimeoutValue(numValue)) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: t('settings.system.timeoutRangeError'),
      }))
    } else {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const handleRenderingChange = (field: keyof RenderingSettings, value: string | number) => {
    setSettings(prev => ({
      ...prev,
      rendering: { ...prev.rendering, [field]: value },
    }))
  }

  const handleSave = async () => {
    // Validate all timeout values
    const timeoutFields = Object.entries(settings.timeouts)
    const invalidFields = timeoutFields.filter(([_, value]) => !validateTimeoutValue(value))
    
    if (invalidFields.length > 0) {
      setError(t('settings.system.invalidTimeouts'))
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')
      
      await adminApi.updateSettings({
        theme: theme, // Use current theme from context
        language: settings.language,
        fallback_language: settings.fallback_language,
        timeouts: settings.timeouts,
        rendering: settings.rendering,
      })
      
      // Update the UI language immediately
      i18n.changeLanguage(settings.language)
      
      setSuccess(t('settings.system.saveSuccess'))
    } catch (err: any) {
      setError(err.detail || err.message || t('settings.system.saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="system-settings-container">
        <div className="loading">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="system-settings-container">
      <header className="page-header">
        <Link to="/dashboard" className="btn-back">← {t('common.back')}</Link>
        <h1>{t('settings.system.title')}</h1>
        <div className="header-actions">
          <span className="user-name">{user?.username}</span>
          <button className="btn-secondary" onClick={logout}>{t('dashboard.logout')}</button>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* Interface Settings */}
        <div className="settings-card">
          <h2>{t('settings.system.interfaceTitle')}</h2>
          <div className="form-group">
            <label>{t('settings.system.theme')}</label>
            <div className="theme-toggle">
              <label className="radio-label">
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  checked={theme === 'dark'}
                  onChange={() => setTheme('dark')}
                />
                <span>{t('settings.system.themeDark')}</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  checked={theme === 'light'}
                  onChange={() => setTheme('light')}
                />
                <span>{t('settings.system.themeLight')}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Language Settings */}
        <div className="settings-card">
          <h2>{t('settings.system.languageTitle')}</h2>
          <div className="form-group">
            <label htmlFor="language">{t('settings.system.defaultLanguage')}</label>
            <select
              id="language"
              value={settings.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
            >
              <option value="zh">中文 (Chinese)</option>
              <option value="en">English</option>
            </select>
            <span className="field-hint">{t('settings.system.languageHint')}</span>
          </div>
        </div>

        {/* Timeout Settings */}
        <div className="settings-card">
          <h2>{t('settings.system.timeoutsTitle')}</h2>
          <p className="card-description">{t('settings.system.timeoutsDescription')}</p>
          
          <div className="timeout-grid">
            <div className="form-group">
              <label htmlFor="idle_to_scene_select">
                {t('settings.system.idleToSceneSelect')}
              </label>
              <div className="input-with-unit">
                <input
                  id="idle_to_scene_select"
                  type="number"
                  min="1"
                  max="300"
                  value={settings.timeouts.idle_to_scene_select_seconds}
                  onChange={(e) => handleTimeoutChange('idle_to_scene_select_seconds', e.target.value)}
                  className={validationErrors.idle_to_scene_select_seconds ? 'error' : ''}
                />
                <span className="unit">{t('settings.system.seconds')}</span>
              </div>
              {validationErrors.idle_to_scene_select_seconds && (
                <span className="field-error">{validationErrors.idle_to_scene_select_seconds}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="scene_select_inactivity">
                {t('settings.system.sceneSelectInactivity')}
              </label>
              <div className="input-with-unit">
                <input
                  id="scene_select_inactivity"
                  type="number"
                  min="1"
                  max="300"
                  value={settings.timeouts.scene_select_inactivity_seconds}
                  onChange={(e) => handleTimeoutChange('scene_select_inactivity_seconds', e.target.value)}
                  className={validationErrors.scene_select_inactivity_seconds ? 'error' : ''}
                />
                <span className="unit">{t('settings.system.seconds')}</span>
              </div>
              {validationErrors.scene_select_inactivity_seconds && (
                <span className="field-error">{validationErrors.scene_select_inactivity_seconds}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="motion_capture_inactivity">
                {t('settings.system.motionCaptureInactivity')}
              </label>
              <div className="input-with-unit">
                <input
                  id="motion_capture_inactivity"
                  type="number"
                  min="1"
                  max="300"
                  value={settings.timeouts.motion_capture_inactivity_seconds}
                  onChange={(e) => handleTimeoutChange('motion_capture_inactivity_seconds', e.target.value)}
                  className={validationErrors.motion_capture_inactivity_seconds ? 'error' : ''}
                />
                <span className="unit">{t('settings.system.seconds')}</span>
              </div>
              {validationErrors.motion_capture_inactivity_seconds && (
                <span className="field-error">{validationErrors.motion_capture_inactivity_seconds}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="final_result_auto_reset">
                {t('settings.system.finalResultAutoReset')}
              </label>
              <div className="input-with-unit">
                <input
                  id="final_result_auto_reset"
                  type="number"
                  min="1"
                  max="300"
                  value={settings.timeouts.final_result_auto_reset_seconds}
                  onChange={(e) => handleTimeoutChange('final_result_auto_reset_seconds', e.target.value)}
                  className={validationErrors.final_result_auto_reset_seconds ? 'error' : ''}
                />
                <span className="unit">{t('settings.system.seconds')}</span>
              </div>
              {validationErrors.final_result_auto_reset_seconds && (
                <span className="field-error">{validationErrors.final_result_auto_reset_seconds}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="exit_gesture_duration">
                {t('settings.system.exitGestureDuration')}
              </label>
              <div className="input-with-unit">
                <input
                  id="exit_gesture_duration"
                  type="number"
                  min="1"
                  max="300"
                  value={settings.timeouts.exit_gesture_duration_seconds}
                  onChange={(e) => handleTimeoutChange('exit_gesture_duration_seconds', e.target.value)}
                  className={validationErrors.exit_gesture_duration_seconds ? 'error' : ''}
                />
                <span className="unit">{t('settings.system.seconds')}</span>
              </div>
              {validationErrors.exit_gesture_duration_seconds && (
                <span className="field-error">{validationErrors.exit_gesture_duration_seconds}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="exit_confirmation_duration">
                {t('settings.system.exitConfirmationDuration')}
              </label>
              <div className="input-with-unit">
                <input
                  id="exit_confirmation_duration"
                  type="number"
                  min="1"
                  max="300"
                  value={settings.timeouts.exit_confirmation_duration_seconds}
                  onChange={(e) => handleTimeoutChange('exit_confirmation_duration_seconds', e.target.value)}
                  className={validationErrors.exit_confirmation_duration_seconds ? 'error' : ''}
                />
                <span className="unit">{t('settings.system.seconds')}</span>
              </div>
              {validationErrors.exit_confirmation_duration_seconds && (
                <span className="field-error">{validationErrors.exit_confirmation_duration_seconds}</span>
              )}
            </div>
          </div>
        </div>

        {/* Rendering Settings */}
        <div className="settings-card">
          <h2>{t('settings.system.renderingTitle')}</h2>
          
          <div className="rendering-grid">
            <div className="form-group">
              <label htmlFor="composition_mode">Composition Mode</label>
              <select
                id="composition_mode"
                value={settings.rendering.composition_mode || 'side_by_side'}
                onChange={(e) => handleRenderingChange('composition_mode', e.target.value)}
              >
                {VALID_COMPOSITION_MODES.map(mode => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
              <span className="field-hint">
                {settings.rendering.composition_mode === 'side_by_side' 
                  ? 'Uses Luma Matte for perfect transparency (requires 2x width)' 
                  : 'Uses Green Screen keying (simpler but may have artifacts)'}
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="video_encoder">FFmpeg Encoder</label>
              <select
                id="video_encoder"
                value={settings.rendering.video_encoder || 'h264_nvenc'}
                onChange={(e) => handleRenderingChange('video_encoder', e.target.value)}
              >
                {VALID_ENCODERS.map(encoder => (
                  <option key={encoder} value={encoder}>{encoder}</option>
                ))}
              </select>
              <span className="field-hint">Use nvenc for NVIDIA GPU acceleration</span>
            </div>

            <div className="form-group">
              <label htmlFor="encoder_preset">Encoder Preset</label>
              <select
                id="encoder_preset"
                value={settings.rendering.encoder_preset || 'slow'}
                onChange={(e) => handleRenderingChange('encoder_preset', e.target.value)}
              >
                {VALID_PRESETS.map(preset => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="encoder_quality">Quality (CQ/CRF)</label>
              <div className="input-with-unit">
                <input
                  id="encoder_quality"
                  type="number"
                  min="0"
                  max="51"
                  value={settings.rendering.encoder_quality ?? 19}
                  onChange={(e) => handleRenderingChange('encoder_quality', parseInt(e.target.value) || 19)}
                />
                <span className="unit">(Lower is better)</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="target_fps">{t('settings.system.targetFps')}</label>
              <div className="input-with-unit">
                <input
                  id="target_fps"
                  type="number"
                  min="15"
                  max="60"
                  value={settings.rendering.target_fps}
                  onChange={(e) => handleRenderingChange('target_fps', parseInt(e.target.value) || 30)}
                />
                <span className="unit">FPS</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="video_codec">{t('settings.system.videoCodec')}</label>
              <select
                id="video_codec"
                value={settings.rendering.video_codec}
                onChange={(e) => handleRenderingChange('video_codec', e.target.value)}
              >
                {VALID_CODECS.map(codec => (
                  <option key={codec} value={codec}>{codec}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="max_render_time">{t('settings.system.maxRenderTime')}</label>
              <div className="input-with-unit">
                <input
                  id="max_render_time"
                  type="number"
                  min="5"
                  max="120"
                  value={settings.rendering.max_render_time_seconds}
                  onChange={(e) => handleRenderingChange('max_render_time_seconds', parseInt(e.target.value) || 20)}
                />
                <span className="unit">{t('settings.system.seconds')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={saving || Object.keys(validationErrors).length > 0}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </main>
    </div>
  )
}
