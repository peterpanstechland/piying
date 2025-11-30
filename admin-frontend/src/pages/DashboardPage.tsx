import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../services/api'
import ActivityLogViewer from '../components/ActivityLogViewer'
import './DashboardPage.css'

interface SessionStats {
  total_sessions: number
  today_sessions: number
  pending_count: number
  processing_count: number
  done_count: number
  cancelled_count: number
  failed_count: number
}

interface VideoStats {
  total_generated: number
  success_count: number
  failed_count: number
  success_rate: number
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
}

interface DashboardStats {
  sessions: SessionStats
  videos: VideoStats
  storage: StorageStats
  timestamp: string
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => {
    loadDashboardStats()
  }, [])

  const loadDashboardStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await adminApi.getDashboardStats()
      setStats(data)
    } catch (err) {
      setError(t('dashboard.loadError'))
      console.error('Failed to load dashboard stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStorageBarColor = (percentage: number, isWarning: boolean) => {
    if (isWarning) return '#ef4444' // Red for warning
    if (percentage > 60) return '#f59e0b' // Orange for moderate
    return '#22c55e' // Green for low
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>{t('dashboard.title')}</h1>
        <div className="user-info">
          <span>{user?.username}</span>
          <button onClick={logout}>{t('dashboard.logout')}</button>
        </div>
      </header>
      <main className="dashboard-content">
        {/* Statistics Section */}
        <section className="stats-section">
          <h2>{t('dashboard.statistics')}</h2>
          {loading ? (
            <div className="loading-indicator">{t('common.loading')}</div>
          ) : error ? (
            <div className="error-message">
              {error}
              <button onClick={loadDashboardStats} className="retry-btn">
                {t('dashboard.retry')}
              </button>
            </div>
          ) : stats ? (
            <div className="stats-grid">
              {/* Today's Sessions Card */}
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.sessions.today_sessions}</div>
                  <div className="stat-label">{t('dashboard.todaySessions')}</div>
                  <div className="stat-detail">
                    {t('dashboard.totalSessions')}: {stats.sessions.total_sessions}
                  </div>
                </div>
              </div>

              {/* Video Success Rate Card */}
              <div className="stat-card">
                <div className="stat-icon">🎬</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.videos.success_rate.toFixed(1)}%</div>
                  <div className="stat-label">{t('dashboard.successRate')}</div>
                  <div className="stat-detail">
                    {stats.videos.success_count} / {stats.videos.total_generated} {t('dashboard.videos')}
                  </div>
                </div>
              </div>

              {/* Storage Usage Card */}
              <div className={`stat-card ${stats.storage.is_warning ? 'warning' : ''}`}>
                <div className="stat-icon">💾</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.storage.usage_percentage.toFixed(1)}%</div>
                  <div className="stat-label">{t('dashboard.storageUsage')}</div>
                  <div className="storage-bar">
                    <div 
                      className="storage-bar-fill"
                      style={{ 
                        width: `${Math.min(stats.storage.usage_percentage, 100)}%`,
                        backgroundColor: getStorageBarColor(stats.storage.usage_percentage, stats.storage.is_warning)
                      }}
                    />
                  </div>
                  <div className="stat-detail">
                    {stats.storage.available_space_gb.toFixed(1)} GB {t('dashboard.available')}
                  </div>
                </div>
                {stats.storage.is_warning && (
                  <div className="warning-badge">
                    ⚠️ {t('dashboard.storageWarning')}
                  </div>
                )}
              </div>

              {/* Session Status Breakdown */}
              <div className="stat-card wide">
                <div className="stat-icon">📈</div>
                <div className="stat-content">
                  <div className="stat-label">{t('dashboard.sessionStatus')}</div>
                  <div className="status-breakdown">
                    <div className="status-item">
                      <span className="status-dot pending"></span>
                      <span>{t('dashboard.pending')}: {stats.sessions.pending_count}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-dot processing"></span>
                      <span>{t('dashboard.processing')}: {stats.sessions.processing_count}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-dot done"></span>
                      <span>{t('dashboard.done')}: {stats.sessions.done_count}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-dot failed"></span>
                      <span>{t('dashboard.failed')}: {stats.sessions.failed_count}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-dot cancelled"></span>
                      <span>{t('dashboard.cancelled')}: {stats.sessions.cancelled_count}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* Activity Logs Toggle */}
        <section className="logs-section">
          <div className="logs-header">
            <h2>{t('dashboard.activityLogs')}</h2>
            <button 
              className="toggle-logs-btn"
              onClick={() => setShowLogs(!showLogs)}
            >
              {showLogs ? t('dashboard.hideLogs') : t('dashboard.showLogs')}
            </button>
          </div>
          {showLogs && <ActivityLogViewer />}
        </section>

        {/* Navigation Cards */}
        <section className="nav-section">
          <h2>{t('dashboard.quickAccess')}</h2>
          <nav className="dashboard-nav">
            <Link to="/characters" className="nav-card">
              <span className="nav-icon">🎭</span>
              <span className="nav-title">{t('dashboard.nav.characters')}</span>
              <span className="nav-desc">{t('dashboard.nav.charactersDesc')}</span>
            </Link>
            <Link to="/storylines" className="nav-card">
              <span className="nav-icon">🎬</span>
              <span className="nav-title">{t('dashboard.nav.storylines')}</span>
              <span className="nav-desc">{t('dashboard.nav.storylinesDesc')}</span>
            </Link>
            <Link to="/camera-test" className="nav-card">
              <span className="nav-icon">📷</span>
              <span className="nav-title">{t('dashboard.nav.cameraTest')}</span>
              <span className="nav-desc">{t('dashboard.nav.cameraTestDesc')}</span>
            </Link>
            <Link to="/settings/storage" className="nav-card">
              <span className="nav-icon">💾</span>
              <span className="nav-title">{t('dashboard.nav.storage')}</span>
              <span className="nav-desc">{t('dashboard.nav.storageDesc')}</span>
            </Link>
            <Link to="/settings/qrcode" className="nav-card">
              <span className="nav-icon">📱</span>
              <span className="nav-title">{t('dashboard.nav.qrcode')}</span>
              <span className="nav-desc">{t('dashboard.nav.qrcodeDesc')}</span>
            </Link>
            <Link to="/settings/system" className="nav-card">
              <span className="nav-icon">⚙️</span>
              <span className="nav-title">{t('dashboard.nav.system')}</span>
              <span className="nav-desc">{t('dashboard.nav.systemDesc')}</span>
            </Link>
            <Link to="/export-import" className="nav-card">
              <span className="nav-icon">📦</span>
              <span className="nav-title">{t('dashboard.nav.exportImport')}</span>
              <span className="nav-desc">{t('dashboard.nav.exportImportDesc')}</span>
            </Link>
            {user?.role === 'admin' && (
              <Link to="/users" className="nav-card">
                <span className="nav-icon">👥</span>
                <span className="nav-title">{t('dashboard.nav.users')}</span>
                <span className="nav-desc">{t('dashboard.nav.usersDesc')}</span>
              </Link>
            )}
          </nav>
        </section>
      </main>
    </div>
  )
}
