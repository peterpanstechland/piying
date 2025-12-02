import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import './StorylineListPage.css'

interface CoverImage {
  original_path: string | null
  thumbnail_path: string | null
  medium_path: string | null
  large_path: string | null
}

interface StorylineListItem {
  id: string
  name: string
  name_en: string
  synopsis: string
  description: string
  icon: string
  icon_image: string | null
  status: 'draft' | 'published'
  display_order: number
  video_duration: number
  cover_image: CoverImage | null
  segment_count: number
  created_at: string
}

export default function StorylineListPage() {
  const navigate = useNavigate()
  const [storylines, setStorylines] = useState<StorylineListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const storylineData = await adminApi.getStorylinesExtendedList()
      setStorylines(storylineData)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load storylines'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteStoryline(id)
      setDeleteConfirm(null)
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete storyline'
      setError(errorMessage)
      setDeleteConfirm(null)
    }
  }

  const handleCreate = () => {
    navigate('/storylines/new/timeline')
  }

  const handleEdit = (id: string) => {
    navigate(`/storylines/${id}/timeline`)
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index)
    dragNodeRef.current = e.currentTarget
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    // Add dragging class after a short delay to allow the drag image to be captured
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.classList.add('dragging')
      }
    }, 0)
  }

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.classList.remove('dragging')
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
    dragNodeRef.current = null
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault()
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null)
      return
    }

    // Reorder the list locally first for immediate feedback
    const newStorylines = [...storylines]
    const [draggedItem] = newStorylines.splice(draggedIndex, 1)
    newStorylines.splice(dropIndex, 0, draggedItem)
    setStorylines(newStorylines)
    setDragOverIndex(null)

    // Save the new order to the backend
    try {
      setIsSavingOrder(true)
      const orders = newStorylines.map((s, index) => ({
        id: s.id,
        order: index
      }))
      await adminApi.reorderStorylines(orders)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save order'
      setError(errorMessage)
      // Reload to get the correct order from server
      loadData()
    } finally {
      setIsSavingOrder(false)
    }
  }

  const formatDuration = (seconds: number): string => {
    if (seconds === 0) return '未上传视频'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getCoverImageUrl = (storyline: StorylineListItem): string | null => {
    if (storyline.cover_image?.medium_path) {
      return `/api/admin/storylines/${storyline.id}/cover/medium`
    }
    return null
  }

  const truncateSynopsis = (synopsis: string, maxLength: number = 100): string => {
    if (!synopsis) return ''
    if (synopsis.length <= maxLength) return synopsis
    return synopsis.substring(0, maxLength) + '...'
  }

  if (loading) {
    return (
      <div className="storyline-list-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="storyline-list-page">
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← 返回首页
          </button>
          <h1>故事线管理</h1>
          {isSavingOrder && <span className="saving-indicator">保存中...</span>}
        </div>
        <button className="btn-primary" onClick={handleCreate}>
          + 新建故事线
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {storylines.length > 1 && (
        <div className="reorder-hint">
          <span className="hint-icon">💡</span>
          <span>拖拽故事线卡片可调整显示顺序</span>
        </div>
      )}

      {storylines.length === 0 ? (
        <div className="empty-state">
          <p>还没有创建任何故事线</p>
          <button className="btn-primary" onClick={handleCreate}>
            创建第一个故事线
          </button>
        </div>
      ) : (
        <div className="storyline-list">
          {storylines.map((storyline, index) => (
            <div
              key={storyline.id}
              className={`storyline-card ${dragOverIndex === index ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="drag-handle" title="拖拽排序">
                <span className="drag-icon">⋮⋮</span>
              </div>
              <div className="storyline-cover">
                {getCoverImageUrl(storyline) ? (
                  <img 
                    src={getCoverImageUrl(storyline)!} 
                    alt={storyline.name}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        const fallback = parent.querySelector('.cover-fallback') as HTMLElement
                        if (fallback) fallback.style.display = 'flex'
                      }
                    }}
                  />
                ) : null}
                <div 
                  className="cover-fallback" 
                  style={{ display: getCoverImageUrl(storyline) ? 'none' : 'flex' }}
                >
                  {storyline.icon_image ? (
                    <img src={storyline.icon_image} alt={storyline.name} className="icon-fallback" />
                  ) : (
                    <span className="emoji-icon">{storyline.icon}</span>
                  )}
                </div>
              </div>
              <div className="storyline-info">
                <div className="storyline-header">
                  <h3>{storyline.name}</h3>
                  <span className={`status-badge status-${storyline.status}`}>
                    {storyline.status === 'published' ? '已发布' : '草稿'}
                  </span>
                </div>
                {storyline.name_en && (
                  <p className="name-en">{storyline.name_en}</p>
                )}
                {(storyline.synopsis || storyline.description) && (
                  <p className="synopsis">
                    {truncateSynopsis(storyline.synopsis || storyline.description)}
                  </p>
                )}
                <div className="meta-row">
                  <span className="meta-item">
                    <span className="meta-label">段落:</span>
                    <span className="meta-value">{storyline.segment_count} 个</span>
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">时长:</span>
                    <span className={storyline.video_duration > 0 ? 'meta-value' : 'meta-value unbound'}>
                      {formatDuration(storyline.video_duration)}
                    </span>
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">创建:</span>
                    <span className="meta-value">{formatDate(storyline.created_at)}</span>
                  </span>
                </div>
              </div>
              <div className="storyline-actions">
                <button
                  className="btn-secondary"
                  onClick={() => handleEdit(storyline.id)}
                >
                  编辑
                </button>
                <button
                  className="btn-danger"
                  onClick={() => setDeleteConfirm(storyline.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>确认删除</h3>
            <p>确定要删除这个故事线吗？此操作将删除所有相关的视频和配置，无法撤销。</p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                取消
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(deleteConfirm)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
