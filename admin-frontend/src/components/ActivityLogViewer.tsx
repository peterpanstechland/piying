import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../services/api'
import './ActivityLogViewer.css'

interface ActivityLogEntry {
  timestamp: string
  level: string
  logger_name: string
  message: string
  module?: string
  function?: string
  line?: number
  context?: Record<string, unknown>
  exception?: {
    type?: string
    message?: string
    traceback?: string
  }
}

interface LogsResponse {
  logs: ActivityLogEntry[]
  total: number
  limit: number
  offset: number
}

export default function ActivityLogViewer() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [levelFilter, setLevelFilter] = useState<string>('')
  const pageSize = 20

  useEffect(() => {
    loadLogs()
  }, [page, levelFilter])

  const loadLogs = async () => {
    try {
      setLoading(true)
      setError(null)
      const response: LogsResponse = await adminApi.getDashboardLogs(page + 1, pageSize)
      setLogs(response.logs)
      setHasMore(response.logs.length === pageSize)
    } catch (err) {
      setError(t('dashboard.logs.loadError'))
      console.error('Failed to load logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index)
  }

  const getLevelClass = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'level-error'
      case 'WARNING':
        return 'level-warning'
      case 'INFO':
        return 'level-info'
      case 'DEBUG':
        return 'level-debug'
      default:
        return 'level-default'
    }
  }

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return timestamp
    }
  }

  const handlePrevPage = () => {
    if (page > 0) {
      setPage(page - 1)
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      setPage(page + 1)
    }
  }

  return (
    <div className="activity-log-viewer">
      {/* Filters */}
      <div className="log-filters">
        <select 
          value={levelFilter} 
          onChange={(e) => {
            setLevelFilter(e.target.value)
            setPage(0)
          }}
          className="level-filter"
        >
          <option value="">{t('dashboard.logs.allLevels')}</option>
          <option value="ERROR">{t('dashboard.logs.error')}</option>
          <option value="WARNING">{t('dashboard.logs.warning')}</option>
          <option value="INFO">{t('dashboard.logs.info')}</option>
          <option value="DEBUG">{t('dashboard.logs.debug')}</option>
        </select>
        <button onClick={loadLogs} className="refresh-btn">
          🔄 {t('dashboard.logs.refresh')}
        </button>
      </div>

      {/* Log List */}
      {loading ? (
        <div className="log-loading">{t('common.loading')}</div>
      ) : error ? (
        <div className="log-error">{error}</div>
      ) : logs.length === 0 ? (
        <div className="log-empty">{t('dashboard.logs.noLogs')}</div>
      ) : (
        <div className="log-list">
          {logs.map((log, index) => (
            <div 
              key={`${log.timestamp}-${index}`}
              className={`log-entry ${expandedIndex === index ? 'expanded' : ''}`}
            >
              <div 
                className="log-summary"
                onClick={() => toggleExpand(index)}
              >
                <span className={`log-level ${getLevelClass(log.level)}`}>
                  {log.level}
                </span>
                <span className="log-timestamp">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className="log-message">
                  {log.message}
                </span>
                <span className="log-expand-icon">
                  {expandedIndex === index ? '▼' : '▶'}
                </span>
              </div>
              
              {expandedIndex === index && (
                <div className="log-details">
                  <div className="log-detail-row">
                    <span className="detail-label">{t('dashboard.logs.logger')}:</span>
                    <span className="detail-value">{log.logger_name}</span>
                  </div>
                  {log.module && (
                    <div className="log-detail-row">
                      <span className="detail-label">{t('dashboard.logs.module')}:</span>
                      <span className="detail-value">{log.module}</span>
                    </div>
                  )}
                  {log.function && (
                    <div className="log-detail-row">
                      <span className="detail-label">{t('dashboard.logs.function')}:</span>
                      <span className="detail-value">{log.function}</span>
                    </div>
                  )}
                  {log.line && (
                    <div className="log-detail-row">
                      <span className="detail-label">{t('dashboard.logs.line')}:</span>
                      <span className="detail-value">{log.line}</span>
                    </div>
                  )}
                  {log.context && Object.keys(log.context).length > 0 && (
                    <div className="log-detail-section">
                      <span className="detail-label">{t('dashboard.logs.context')}:</span>
                      <pre className="detail-code">
                        {JSON.stringify(log.context, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.exception && (
                    <div className="log-detail-section exception-section">
                      <span className="detail-label">{t('dashboard.logs.exception')}:</span>
                      {log.exception.type && (
                        <div className="exception-type">{log.exception.type}</div>
                      )}
                      {log.exception.message && (
                        <div className="exception-message">{log.exception.message}</div>
                      )}
                      {log.exception.traceback && (
                        <pre className="exception-traceback">
                          {log.exception.traceback}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && logs.length > 0 && (
        <div className="log-pagination">
          <button 
            onClick={handlePrevPage} 
            disabled={page === 0}
            className="pagination-btn"
          >
            ← {t('dashboard.logs.prev')}
          </button>
          <span className="pagination-info">
            {t('dashboard.logs.page')} {page + 1}
          </span>
          <button 
            onClick={handleNextPage} 
            disabled={!hasMore}
            className="pagination-btn"
          >
            {t('dashboard.logs.next')} →
          </button>
        </div>
      )}
    </div>
  )
}
