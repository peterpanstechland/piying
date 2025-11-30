import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import './StorylineListPage.css'

interface StorylineListItem {
  id: string
  name: string
  name_en: string
  description: string
  icon: string
  icon_image: string | null
  video_duration: number
  character_id: string | null
  segment_count: number
  created_at: string
}

interface CharacterInfo {
  id: string
  name: string
}

export default function StorylineListPage() {
  const navigate = useNavigate()
  const [storylines, setStorylines] = useState<StorylineListItem[]>([])
  const [characters, setCharacters] = useState<CharacterInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [storylineData, characterData] = await Promise.all([
        adminApi.getStorylines(),
        adminApi.getCharacters()
      ])
      setStorylines(storylineData)
      setCharacters(characterData)
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
    navigate('/storylines/new')
  }

  const handleEdit = (id: string) => {
    navigate(`/storylines/${id}/edit`)
  }

  const getCharacterName = (characterId: string | null): string => {
    if (!characterId) return '未绑定'
    const character = characters.find(c => c.id === characterId)
    return character ? character.name : '未知人物'
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
        <h1>故事线管理</h1>
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

      {storylines.length === 0 ? (
        <div className="empty-state">
          <p>还没有创建任何故事线</p>
          <button className="btn-primary" onClick={handleCreate}>
            创建第一个故事线
          </button>
        </div>
      ) : (
        <div className="storyline-list">
          {storylines.map((storyline) => (
            <div key={storyline.id} className="storyline-card">
              <div className="storyline-icon">
                {storyline.icon_image ? (
                  <img src={storyline.icon_image} alt={storyline.name} />
                ) : (
                  <span className="emoji-icon">{storyline.icon}</span>
                )}
              </div>
              <div className="storyline-info">
                <h3>{storyline.name}</h3>
                {storyline.name_en && (
                  <p className="name-en">{storyline.name_en}</p>
                )}
                {storyline.description && (
                  <p className="description">{storyline.description}</p>
                )}
                <div className="meta-row">
                  <span className="meta-item">
                    <span className="meta-label">人物:</span>
                    <span className={storyline.character_id ? 'meta-value' : 'meta-value unbound'}>
                      {getCharacterName(storyline.character_id)}
                    </span>
                  </span>
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
