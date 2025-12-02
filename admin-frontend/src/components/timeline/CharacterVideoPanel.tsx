/**
 * CharacterVideoPanel Component
 * 
 * Manages character-specific background videos for storylines.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 * - Display list of characters with video upload status (4.1, 4.2)
 * - Show video thumbnail and duration for uploaded videos (4.4)
 * - Upload character-specific videos with validation (4.3)
 * - Delete character videos (4.5)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { adminApi } from '../../services/api'
import './CharacterVideoPanel.css'

interface CharacterVideoStatus {
  character_id: string
  character_name: string
  character_thumbnail: string | null
  has_video: boolean
  video_path: string | null
  video_duration: number | null
  video_thumbnail: string | null
  uploaded_at: string | null
}

interface CharacterVideoPanelProps {
  /** Storyline ID */
  storylineId: string
  /** Base video duration for validation reference */
  baseVideoDuration: number
  /** Callback when video is uploaded or deleted */
  onVideoChange?: () => void
}

/**
 * CharacterVideoPanel - Panel for managing character-specific videos
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export default function CharacterVideoPanel({
  storylineId,
  baseVideoDuration,
  onVideoChange,
}: CharacterVideoPanelProps) {
  const [characters, setCharacters] = useState<CharacterVideoStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingCharacterId, setUploadingCharacterId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [deletingCharacterId, setDeletingCharacterId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedCharacterIdRef = useRef<string | null>(null)

  // Load character video statuses
  const loadCharacterVideos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await adminApi.getCharacterVideos(storylineId)
      setCharacters(data.characters)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载角色视频失败'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [storylineId])

  useEffect(() => {
    loadCharacterVideos()
  }, [loadCharacterVideos])

  // Handle file selection for upload (Requirements 4.3)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const characterId = selectedCharacterIdRef.current
    
    if (!file || !characterId) return

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.mp4')) {
      setError('请选择 MP4 格式的视频文件 / Please select an MP4 video file')
      return
    }

    // Upload video
    try {
      setUploadingCharacterId(characterId)
      setUploadProgress(0)
      setError(null)

      const formData = new FormData()
      formData.append('file', file)

      await adminApi.uploadCharacterVideo(
        storylineId,
        characterId,
        formData,
        (progress) => setUploadProgress(progress)
      )

      setUploadProgress(100)
      await loadCharacterVideos()
      onVideoChange?.()
    } catch (err: unknown) {
      const errorObj = err as { detail?: string; message?: string }
      const errorMessage = errorObj.detail || errorObj.message || '上传失败'
      setError(errorMessage)
    } finally {
      setUploadingCharacterId(null)
      setUploadProgress(0)
      selectedCharacterIdRef.current = null
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Trigger file input for a specific character
  const handleUploadClick = (characterId: string) => {
    selectedCharacterIdRef.current = characterId
    fileInputRef.current?.click()
  }

  // Handle video deletion (Requirements 4.5)
  const handleDelete = async (characterId: string, characterName: string) => {
    const confirmed = window.confirm(
      `确定要删除 "${characterName}" 的专属视频吗？删除后将使用默认背景视频。\n` +
      `Are you sure you want to delete the video for "${characterName}"? The default video will be used after deletion.`
    )
    if (!confirmed) return

    try {
      setDeletingCharacterId(characterId)
      setError(null)
      await adminApi.deleteCharacterVideo(storylineId, characterId)
      await loadCharacterVideos()
      onVideoChange?.()
    } catch (err: unknown) {
      const errorObj = err as { detail?: string; message?: string }
      const errorMessage = errorObj.detail || errorObj.message || '删除失败'
      setError(errorMessage)
    } finally {
      setDeletingCharacterId(null)
    }
  }

  // Format duration for display
  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format date for display
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '--'
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Get character thumbnail URL
  const getCharacterThumbnailUrl = (thumbnail: string | null): string | null => {
    if (!thumbnail) return null
    return `/api/admin/${thumbnail}`
  }

  if (loading) {
    return (
      <div className="character-video-panel character-video-panel--loading">
        <div className="character-video-panel__spinner"></div>
        <p>加载角色视频配置...</p>
      </div>
    )
  }

  if (characters.length === 0) {
    return (
      <div className="character-video-panel character-video-panel--empty">
        <div className="character-video-panel__empty-icon">🎬</div>
        <p className="character-video-panel__empty-text">暂无可配置角色</p>
        <p className="character-video-panel__empty-hint">
          请先在"可选角色"中添加角色
        </p>
      </div>
    )
  }

  return (
    <div className="character-video-panel">
      <div className="character-video-panel__header">
        <h3 className="character-video-panel__title">
          角色专属视频
          <span className="character-video-panel__title-en">Character Videos</span>
        </h3>
        <span className="character-video-panel__count">
          {characters.filter(c => c.has_video).length}/{characters.length} 已配置
        </span>
      </div>

      <p className="character-video-panel__hint">
        为每个角色上传专属背景视频，视频时长需与基础视频一致（±1秒）
      </p>
      <p className="character-video-panel__hint character-video-panel__hint--en">
        Upload character-specific videos. Duration must match base video (±1s tolerance).
      </p>

      {/* Base video duration reference */}
      <div className="character-video-panel__base-info">
        <span className="character-video-panel__base-label">基础视频时长:</span>
        <span className="character-video-panel__base-value">
          {formatDuration(baseVideoDuration)}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="character-video-panel__error">
          <span className="character-video-panel__error-icon">⚠️</span>
          <span className="character-video-panel__error-text">{error}</span>
          <button
            className="character-video-panel__error-close"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,video/mp4"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Character list */}
      <div className="character-video-panel__list">
        {characters.map((character) => {
          const isUploading = uploadingCharacterId === character.character_id
          const isDeleting = deletingCharacterId === character.character_id
          const thumbnailUrl = getCharacterThumbnailUrl(character.character_thumbnail)

          return (
            <div
              key={character.character_id}
              className={`character-video-panel__item ${character.has_video ? 'character-video-panel__item--has-video' : ''} ${isUploading ? 'character-video-panel__item--uploading' : ''}`}
            >
              {/* Character info */}
              <div className="character-video-panel__character-info">
                <div className="character-video-panel__thumbnail">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={character.character_name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="character-video-panel__thumbnail-placeholder">
                      🎭
                    </div>
                  )}
                </div>
                <div className="character-video-panel__name-container">
                  <span className="character-video-panel__name">
                    {character.character_name}
                  </span>
                  <span className={`character-video-panel__status ${character.has_video ? 'character-video-panel__status--uploaded' : 'character-video-panel__status--missing'}`}>
                    {character.has_video ? '✓ 已上传' : '○ 未配置'}
                  </span>
                </div>
              </div>

              {/* Video info (Requirements 4.4) */}
              {character.has_video && (
                <div className="character-video-panel__video-info">
                  <div className="character-video-panel__video-thumbnail">
                    {character.video_thumbnail ? (
                      <img
                        src={`/api/admin/${character.video_thumbnail}`}
                        alt="Video thumbnail"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="character-video-panel__video-thumbnail-placeholder">
                        🎥
                      </div>
                    )}
                  </div>
                  <div className="character-video-panel__video-meta">
                    <span className="character-video-panel__video-duration">
                      ⏱ {formatDuration(character.video_duration)}
                    </span>
                    <span className="character-video-panel__video-date">
                      📅 {formatDate(character.uploaded_at)}
                    </span>
                  </div>
                </div>
              )}

              {/* Upload progress */}
              {isUploading && (
                <div className="character-video-panel__progress">
                  <div className="character-video-panel__progress-bar">
                    <div
                      className="character-video-panel__progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="character-video-panel__progress-text">
                    {uploadProgress}%
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="character-video-panel__actions">
                <button
                  className="character-video-panel__btn character-video-panel__btn--upload"
                  onClick={() => handleUploadClick(character.character_id)}
                  disabled={isUploading || isDeleting}
                  title={character.has_video ? '更换视频' : '上传视频'}
                >
                  {isUploading ? (
                    <>
                      <span className="character-video-panel__btn-icon">⏳</span>
                      上传中
                    </>
                  ) : (
                    <>
                      <span className="character-video-panel__btn-icon">📤</span>
                      {character.has_video ? '更换' : '上传'}
                    </>
                  )}
                </button>

                {character.has_video && (
                  <button
                    className="character-video-panel__btn character-video-panel__btn--delete"
                    onClick={() => handleDelete(character.character_id, character.character_name)}
                    disabled={isUploading || isDeleting}
                    title="删除视频"
                  >
                    {isDeleting ? (
                      <>
                        <span className="character-video-panel__btn-icon">⏳</span>
                        删除中
                      </>
                    ) : (
                      <>
                        <span className="character-video-panel__btn-icon">🗑️</span>
                        删除
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="character-video-panel__summary">
        <p className="character-video-panel__summary-text">
          {characters.filter(c => c.has_video).length === characters.length ? (
            <span className="character-video-panel__summary--complete">
              ✓ 所有角色已配置专属视频
            </span>
          ) : (
            <span className="character-video-panel__summary--incomplete">
              未配置专属视频的角色将使用默认背景视频
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
