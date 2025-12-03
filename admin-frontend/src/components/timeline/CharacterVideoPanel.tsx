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
import { useNavigate } from 'react-router-dom'
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
  baseVideoDuration: _baseVideoDuration,
  onVideoChange,
}: CharacterVideoPanelProps) {
  // baseVideoDuration reserved for future duration validation display
  void _baseVideoDuration
  const navigate = useNavigate()
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
    return `${mins}分${secs}秒`
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
    return null
  }

  return (
    <div className="character-video-panel">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,video/mp4"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

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

      {/* Character cards - horizontal layout */}
      <div className="character-video-panel__grid">
        {characters.map((character) => {
          const isUploading = uploadingCharacterId === character.character_id
          const isDeleting = deletingCharacterId === character.character_id

          return (
            <div 
              key={character.character_id} 
              className={`character-video-card ${character.has_video ? 'character-video-card--has-video' : ''}`}
            >
              <div className="character-video-card__header">
                <span className="character-video-card__name">{character.character_name}</span>
                <span className={`character-video-card__status ${character.has_video ? 'character-video-card__status--uploaded' : ''}`}>
                  {character.has_video ? '✓ 已上传' : '○ 未配置'}
                </span>
              </div>

              {character.has_video && (
                <div className="character-video-card__info">
                  <span className="character-video-card__duration">
                    时长: {formatDuration(character.video_duration)}
                  </span>
                </div>
              )}

              <div className="character-video-card__actions">
                {character.has_video ? (
                  <>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => navigate(`/storylines/${storylineId}/characters/${character.character_id}/video-editor`)}
                    >
                      ✏️ 编辑视频
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleUploadClick(character.character_id)}
                      disabled={isUploading || isDeleting}
                    >
                      更换
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDelete(character.character_id, character.character_name)}
                      disabled={isUploading || isDeleting}
                    >
                      {isDeleting ? '...' : '删除'}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => handleUploadClick(character.character_id)}
                    disabled={isUploading}
                  >
                    {isUploading ? '上传中...' : '上传'}
                  </button>
                )}
              </div>

              {isUploading && (
                <div className="character-video-card__progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="progress-text">{uploadProgress}%</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
