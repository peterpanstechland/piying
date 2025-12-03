import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import BasicInfoForm, { BasicInfoFormData } from '../components/timeline/BasicInfoForm'
import '../components/timeline/BasicInfoForm.css'
import CharacterSelector from '../components/timeline/CharacterSelector'
import CoverImageManager from '../components/timeline/CoverImageManager'
import CharacterVideoPanel from '../components/timeline/CharacterVideoPanel'
import { TimelineSegment } from '../contexts/TimelineEditorContext'
import './StorylineTimelineEditorPage.css'

interface StorylineExtended {
  id: string
  name: string
  name_en: string
  synopsis: string
  synopsis_en: string
  description: string
  description_en: string
  icon: string
  status: 'draft' | 'published'
  display_order: number
  enabled: boolean
  base_video_path: string | null
  video_duration: number
  video_width: number | null
  video_height: number | null
  cover_image: {
    original_path: string
    thumbnail_path: string
    medium_path: string
    large_path: string
  } | null
  segments: TimelineSegment[]
  transitions: Array<{
    id: string
    from_segment_index: number
    to_segment_index: number
    type: string
    duration: number
  }>
  character_config: {
    character_ids: string[]
    default_character_id: string | null
    display_order: string[]
  } | null
  created_at: string
  updated_at: string
}

interface Character {
  id: string
  name: string
  description: string
  thumbnail_url?: string
}

/**
 * StorylineTimelineEditorPage - Main page for editing storylines with timeline
 * Requirements: 3.1, 1.1, 8.1, 8.2, 2.1, 2.2, 2.4, 1.2, 10.1
 */
export default function StorylineTimelineEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  // State
  const [storyline, setStoryline] = useState<StorylineExtended | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Form state for new storylines
  const [basicInfo, setBasicInfo] = useState<BasicInfoFormData>({
    name: '',
    name_en: '',
    synopsis: '',
    synopsis_en: '',
    icon: '⛏️',
  })
  const [basicInfoValid, setBasicInfoValid] = useState(false)
  
  // Video upload state
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const videoInputRef = useRef<HTMLInputElement>(null)
  
  // Character configuration state
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([])
  const [defaultCharacterId, setDefaultCharacterId] = useState<string | null>(null)
  const [characterDisplayOrder, setCharacterDisplayOrder] = useState<string[]>([])
  
  // Video playhead time for cover capture
  const [currentVideoTime] = useState(0)
  
  // Tab navigation state
  type TabType = 'basic' | 'video' | 'characters' | 'character-videos' | 'cover'
  const [activeTab, setActiveTab] = useState<TabType>('basic')

  // Load storyline and characters data
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Load all characters for selection
      const characterData = await adminApi.getCharacters()
      setCharacters(characterData)
      
      if (!isNew && id) {
        // Load existing storyline
        const storylineData = await adminApi.getStorylineExtended(id)
        setStoryline(storylineData)
        
        // Set basic info from loaded data
        setBasicInfo({
          name: storylineData.name || '',
          name_en: storylineData.name_en || '',
          synopsis: storylineData.synopsis || '',
          synopsis_en: storylineData.synopsis_en || '',
          icon: storylineData.icon || '⛏️',
        })
        
        // Set character configuration
        if (storylineData.character_config) {
          setSelectedCharacterIds(storylineData.character_config.character_ids || [])
          setDefaultCharacterId(storylineData.character_config.default_character_id)
          setCharacterDisplayOrder(storylineData.character_config.display_order || [])
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [id, isNew])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle basic info change
  const handleBasicInfoChange = useCallback((data: BasicInfoFormData, isValid: boolean) => {
    setBasicInfo(data)
    setBasicInfoValid(isValid)
  }, [])

  // Save basic info (Requirements 1.1, 8.1, 8.2)
  const handleSaveBasicInfo = async (data: BasicInfoFormData) => {
    console.log('handleSaveBasicInfo called with:', data)
    console.log('isNew:', isNew, 'id:', id)
    
    try {
      setSaving(true)
      setError(null)
      
      if (isNew) {
        console.log('Creating new storyline...')
        // Create new storyline
        const created = await adminApi.createStorylineExtended({
          name: data.name,
          name_en: data.name_en,
          synopsis: data.synopsis,
          synopsis_en: data.synopsis_en,
          icon: data.icon,
        })
        console.log('Created storyline:', created)
        setSuccess('故事线创建成功')
        // Navigate to edit page for the new storyline
        navigate(`/storylines/${created.id}/timeline`, { replace: true })
      } else if (id) {
        console.log('Updating existing storyline...')
        // Update existing storyline
        await adminApi.updateStorylineExtended(id, {
          name: data.name,
          name_en: data.name_en,
          synopsis: data.synopsis,
          synopsis_en: data.synopsis_en,
          icon: data.icon,
        })
        console.log('Update successful')
        setSuccess('基本信息保存成功')
        loadData()
      }
    } catch (err: unknown) {
      console.error('Save error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to save'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  // Handle video upload (Requirements 2.1, 2.2)
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id || isNew) return

    if (!file.name.toLowerCase().endsWith('.mp4')) {
      setError('请上传 MP4 格式的视频文件')
      return
    }

    // Warn if replacing existing video (Requirements 2.4)
    if (storyline?.base_video_path) {
      const confirmed = window.confirm(
        '更换视频将重置所有段落配置，确定要继续吗？'
      )
      if (!confirmed) {
        if (videoInputRef.current) {
          videoInputRef.current.value = ''
        }
        return
      }
    }

    try {
      setVideoUploading(true)
      setVideoProgress(0)
      setError(null)

      const formData = new FormData()
      formData.append('file', file)

      // Simulate progress (actual progress would need XMLHttpRequest)
      const progressInterval = setInterval(() => {
        setVideoProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      await adminApi.uploadStorylineVideo(id, formData)
      
      clearInterval(progressInterval)
      setVideoProgress(100)
      setSuccess('视频上传成功')
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload video'
      setError(errorMessage)
    } finally {
      setVideoUploading(false)
      setVideoProgress(0)
      if (videoInputRef.current) {
        videoInputRef.current.value = ''
      }
    }
  }

  // Handle character selection change
  const handleCharacterSelectionChange = useCallback(async (characterIds: string[]) => {
    setSelectedCharacterIds(characterIds)
    
    // Update default if current default is no longer selected
    if (defaultCharacterId && !characterIds.includes(defaultCharacterId)) {
      setDefaultCharacterId(characterIds[0] || null)
    }
    
    // Update display order
    const newOrder = characterIds.filter(id => characterDisplayOrder.includes(id))
    const addedIds = characterIds.filter(id => !characterDisplayOrder.includes(id))
    setCharacterDisplayOrder([...newOrder, ...addedIds])
  }, [defaultCharacterId, characterDisplayOrder])

  // Handle default character change
  const handleDefaultCharacterChange = useCallback((characterId: string) => {
    setDefaultCharacterId(characterId)
  }, [])

  // Handle character reorder
  const handleCharacterReorder = useCallback((orderedIds: string[]) => {
    setCharacterDisplayOrder(orderedIds)
  }, [])

  // Save character configuration
  const handleSaveCharacters = useCallback(async () => {
    if (!id || isNew || selectedCharacterIds.length === 0) return
    
    try {
      setSaving(true)
      await adminApi.updateStorylineCharacters(id, {
        character_ids: selectedCharacterIds,
        default_character_id: defaultCharacterId || selectedCharacterIds[0],
        display_order: characterDisplayOrder,
      })
      setSuccess('角色配置保存成功')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save character configuration'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }, [id, isNew, selectedCharacterIds, defaultCharacterId, characterDisplayOrder])

  // Handle cover image upload
  const handleCoverUpload = useCallback(async (file: File) => {
    if (!id || isNew) return
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      await adminApi.uploadCoverImage(id, formData)
      setSuccess('封面图片上传成功')
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload cover image'
      setError(errorMessage)
    }
  }, [id, isNew, loadData])

  // Handle cover frame capture
  const handleCoverFrameCapture = useCallback(async (time: number) => {
    if (!id || isNew) return
    
    try {
      await adminApi.captureCoverFromVideo(id, time)
      setSuccess('封面截图成功')
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to capture cover frame'
      setError(errorMessage)
    }
  }, [id, isNew, loadData])

  // Handle cover image delete
  const handleCoverDelete = useCallback(async () => {
    if (!id || isNew) return
    
    try {
      await adminApi.deleteCoverImage(id)
      setSuccess('封面图片已删除')
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete cover image'
      setError(errorMessage)
    }
  }, [id, isNew, loadData])

  // Handle publish (Requirements 1.2, 10.1)
  const handlePublish = async () => {
    if (!id || isNew) return
    
    // Validate video exists before publishing
    if (!storyline?.base_video_path) {
      setError('请先上传背景视频后再发布')
      return
    }
    
    try {
      setSaving(true)
      await adminApi.publishStoryline(id)
      setSuccess('故事线已发布')
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to publish'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  // Handle unpublish
  const handleUnpublish = async () => {
    if (!id || isNew) return
    
    try {
      setSaving(true)
      await adminApi.unpublishStoryline(id)
      setSuccess('故事线已设为草稿')
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unpublish'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  // Handle toggle enabled
  const handleToggleEnabled = async () => {
    if (!id || isNew || !storyline) return
    
    try {
      setSaving(true)
      const newEnabled = !storyline.enabled
      await adminApi.toggleStorylineEnabled(id, newEnabled)
      setSuccess(newEnabled ? '故事线已启用' : '故事线已禁用')
      loadData()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle enabled'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  // Handle save draft
  const handleSaveDraft = async () => {
    console.log('handleSaveDraft called')
    console.log('basicInfoValid:', basicInfoValid)
    console.log('basicInfo:', basicInfo)
    
    if (!basicInfoValid) {
      setError('请填写必填字段')
      return
    }
    await handleSaveBasicInfo(basicInfo)
  }

  // Navigate back
  const handleBack = () => {
    navigate('/storylines')
  }

  // Get video URL
  const getVideoUrl = () => {
    if (!id || !storyline?.base_video_path) return null
    return adminApi.getVideoUrl(id)
  }

  if (loading) {
    return (
      <div className="storyline-timeline-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="storyline-timeline-page">
      {/* Header */}
      <div className="storyline-timeline-page__header">
        <button className="btn-back" onClick={handleBack}>
          ← 返回列表
        </button>
        <h1>{isNew ? '新建故事线' : '编辑故事线'}</h1>
        
        {/* Status Badge */}
        {!isNew && storyline && (
          <span className={`status-badge ${storyline.status}`}>
            {storyline.status === 'published' ? '已发布' : '草稿'}
          </span>
        )}
        
        {/* Enable Toggle */}
        {!isNew && storyline && (
          <div className="storyline-timeline-page__enable-toggle">
            {storyline.status === 'published' ? (
              <label className="enable-switch">
                <input
                  type="checkbox"
                  checked={storyline.enabled}
                  onChange={handleToggleEnabled}
                  disabled={saving}
                />
                <span className="enable-switch__slider"></span>
                <span className="enable-switch__label">
                  {storyline.enabled ? '已启用' : '未启用'}
                </span>
              </label>
            ) : (
              <div className="enable-switch enable-switch--disabled">
                <input type="checkbox" disabled checked={false} />
                <span className="enable-switch__slider"></span>
                <span className="enable-switch__label enable-switch__label--coming-soon">
                  搭建中，敬请期待
                </span>
              </div>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="storyline-timeline-page__actions">
          <button
            className="btn-secondary"
            onClick={handleSaveDraft}
            disabled={saving || !basicInfoValid}
          >
            {saving ? '保存中...' : '保存草稿'}
          </button>
          
          {!isNew && storyline?.status === 'draft' && (
            <button
              className="btn-primary"
              onClick={handlePublish}
              disabled={saving || !storyline?.base_video_path}
              title={!storyline?.base_video_path ? '请先上传视频' : '发布故事线'}
            >
              发布
            </button>
          )}
          
          {!isNew && storyline?.status === 'published' && (
            <button
              className="btn-warning"
              onClick={handleUnpublish}
              disabled={saving}
            >
              取消发布
            </button>
          )}
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {success && (
        <div className="success-banner">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="storyline-timeline-page__tabs">
        <button
          className={`tab-btn ${activeTab === 'basic' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('basic')}
        >
          基本信息
        </button>
        <button
          className={`tab-btn ${activeTab === 'video' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('video')}
          disabled={isNew}
        >
          背景视频
        </button>
        <button
          className={`tab-btn ${activeTab === 'characters' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('characters')}
          disabled={isNew}
        >
          角色配置
        </button>
        <button
          className={`tab-btn ${activeTab === 'character-videos' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('character-videos')}
          disabled={isNew || !storyline?.base_video_path || selectedCharacterIds.length === 0}
        >
          角色专属视频
        </button>
        <button
          className={`tab-btn ${activeTab === 'cover' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('cover')}
          disabled={isNew || !storyline?.base_video_path}
        >
          封面图片
        </button>
      </div>

      <div className="storyline-timeline-page__content storyline-timeline-page__content--tabbed">
        {/* Tab Content */}
        <div className="storyline-timeline-page__tab-content">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="tab-panel">
              <BasicInfoForm
                initialData={basicInfo}
                onChange={handleBasicInfoChange}
                onSave={handleSaveBasicInfo}
                saving={saving}
                disabled={saving}
              />
            </div>
          )}

          {/* Video Tab */}
          {activeTab === 'video' && !isNew && id && (
            <div className="tab-panel">
              <div className="video-section-horizontal">
                <h3 className="section-title">默认背景视频</h3>
                <div className="video-card">
                  {storyline?.base_video_path ? (
                    <>
                      <div className="video-card__thumbnail">
                        <video
                          src={getVideoUrl() || undefined}
                          muted
                          preload="metadata"
                          onLoadedMetadata={(e) => {
                            const video = e.target as HTMLVideoElement
                            video.currentTime = 1
                          }}
                        />
                      </div>
                      <div className="video-card__info">
                        <span className="video-card__duration">
                          时长: {Math.floor((storyline.video_duration || 0) / 60)}分
                          {Math.floor((storyline.video_duration || 0) % 60)}秒
                        </span>
                        {storyline.video_width && storyline.video_height && (
                          <span className="video-card__resolution">
                            {storyline.video_width}×{storyline.video_height}
                          </span>
                        )}
                      </div>
                      <div className="video-card__actions">
                        <input
                          ref={videoInputRef}
                          type="file"
                          accept=".mp4,video/mp4"
                          onChange={handleVideoUpload}
                          disabled={videoUploading}
                          id="video-upload"
                          className="file-input"
                        />
                        <label htmlFor="video-upload" className="btn-secondary">
                          {videoUploading ? '上传中...' : '更换视频'}
                        </label>
                        <button
                          className="btn-primary"
                          onClick={() => navigate(`/storylines/${id}/video-editor`)}
                        >
                          ✏️ 编辑视频
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="video-card__empty">
                      <span className="video-card__empty-icon">🎬</span>
                      <p>未上传视频</p>
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept=".mp4,video/mp4"
                        onChange={handleVideoUpload}
                        disabled={videoUploading}
                        id="video-upload"
                        className="file-input"
                      />
                      <label htmlFor="video-upload" className="btn-primary">
                        {videoUploading ? '上传中...' : '上传视频'}
                      </label>
                      <span className="file-format-hint">支持 MP4 格式 (H.264)</span>
                    </div>
                  )}
                  {videoUploading && (
                    <div className="upload-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${videoProgress}%` }} />
                      </div>
                      <span className="progress-text">{videoProgress}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Characters Tab */}
          {activeTab === 'characters' && !isNew && id && (
            <div className="tab-panel">
              <div className="characters-section">
                <h3 className="section-title">可选角色</h3>
                <CharacterSelector
                  allCharacters={characters}
                  selectedCharacterIds={selectedCharacterIds}
                  defaultCharacterId={defaultCharacterId}
                  onSelectionChange={handleCharacterSelectionChange}
                  onDefaultChange={handleDefaultCharacterChange}
                  onReorder={handleCharacterReorder}
                />
                <div className="section-actions">
                  <button
                    className="btn-primary"
                    onClick={handleSaveCharacters}
                    disabled={saving || selectedCharacterIds.length === 0}
                  >
                    保存角色配置
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Character Videos Tab */}
          {activeTab === 'character-videos' && !isNew && id && storyline?.base_video_path && selectedCharacterIds.length > 0 && (
            <div className="tab-panel">
              <div className="character-videos-section">
                <h3 className="section-title">角色专属视频</h3>
                <p className="section-hint">为每个角色上传专属背景视频，未配置时使用默认背景视频</p>
                <CharacterVideoPanel
                  storylineId={id}
                  baseVideoDuration={storyline.video_duration || 0}
                  onVideoChange={loadData}
                />
              </div>
            </div>
          )}

          {/* Cover Tab */}
          {activeTab === 'cover' && !isNew && id && storyline?.base_video_path && (
            <div className="tab-panel">
              <CoverImageManager
                storylineId={id}
                currentCover={storyline?.cover_image || null}
                videoUrl={getVideoUrl()}
                currentTime={currentVideoTime}
                onUpload={handleCoverUpload}
                onFrameCapture={handleCoverFrameCapture}
                onDelete={handleCoverDelete}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
