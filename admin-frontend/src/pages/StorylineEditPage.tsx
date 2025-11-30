import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import SegmentConfigurator from '../components/SegmentConfigurator'
import './StorylineEditPage.css'

interface Segment {
  index: number
  duration: number
  path_type: string
  offset_start: number[]
  offset_end: number[]
  guidance_text: string
  guidance_text_en: string
  guidance_image: string | null
}

interface Storyline {
  id: string
  name: string
  name_en: string
  description: string
  description_en: string
  icon: string
  icon_image: string | null
  base_video_path: string
  video_duration: number
  character_id: string | null
  segments: Segment[]
  created_at: string
  updated_at: string
}

interface CharacterInfo {
  id: string
  name: string
}

const DEFAULT_SEGMENTS: Segment[] = [
  { index: 0, duration: 10, path_type: 'static', offset_start: [0, 0], offset_end: [0, 0], guidance_text: '', guidance_text_en: '', guidance_image: null },
  { index: 1, duration: 10, path_type: 'static', offset_start: [0, 0], offset_end: [0, 0], guidance_text: '', guidance_text_en: '', guidance_image: null },
]

export default function StorylineEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'
  
  const [, setStoryline] = useState<Storyline | null>(null)
  const [characters, setCharacters] = useState<CharacterInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Form state
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [icon, setIcon] = useState('📖')
  const [characterId, setCharacterId] = useState<string>('')
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_SEGMENTS)
  
  // Video upload state
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Load characters for dropdown
      const characterData = await adminApi.getCharacters()
      setCharacters(characterData)
      
      if (!isNew && id) {
        const storylineData = await adminApi.getStoryline(id)
        setStoryline(storylineData)
        setName(storylineData.name)
        setNameEn(storylineData.name_en || '')
        setDescription(storylineData.description || '')
        setDescriptionEn(storylineData.description_en || '')
        setIcon(storylineData.icon || '📖')
        setCharacterId(storylineData.character_id || '')
        setVideoDuration(storylineData.video_duration || 0)
        if (storylineData.segments && storylineData.segments.length > 0) {
          setSegments(storylineData.segments)
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

  const handleSaveBasicInfo = async () => {
    if (!name.trim()) {
      setError('请输入故事线名称')
      return
    }

    try {
      setSaving(true)
      setError(null)
      
      const data = {
        name: name.trim(),
        name_en: nameEn.trim(),
        description: description.trim(),
        description_en: descriptionEn.trim(),
        icon,
        character_id: characterId || null,
      }

      if (isNew) {
        const created = await adminApi.createStoryline(data)
        setSuccess('故事线创建成功')
        // Navigate to edit page for the new storyline
        navigate(`/storylines/${created.id}/edit`, { replace: true })
      } else if (id) {
        await adminApi.updateStoryline(id, data)
        setSuccess('基本信息保存成功')
        loadData()
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id || isNew) return

    if (!file.name.toLowerCase().endsWith('.mp4')) {
      setError('请上传 MP4 格式的视频文件')
      return
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

      const result = await adminApi.uploadStorylineVideo(id, formData)
      
      clearInterval(progressInterval)
      setVideoProgress(100)
      setVideoDuration(result.video_duration)
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

  const handleSaveSegments = async (updatedSegments: Segment[]) => {
    if (!id || isNew) return

    try {
      setSaving(true)
      setError(null)
      await adminApi.updateStorylineSegments(id, updatedSegments)
      setSegments(updatedSegments)
      setSuccess('段落配置保存成功')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save segments'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    navigate('/storylines')
  }

  if (loading) {
    return (
      <div className="storyline-edit-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="storyline-edit-page">
      <div className="page-header">
        <button className="btn-back" onClick={handleBack}>
          ← 返回列表
        </button>
        <h1>{isNew ? '新建故事线' : '编辑故事线'}</h1>
      </div>

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

      {/* Basic Info Section */}
      <section className="edit-section">
        <h2>基本信息</h2>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="name">名称 (中文) *</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入故事线名称"
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label htmlFor="nameEn">名称 (英文)</label>
            <input
              id="nameEn"
              type="text"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Enter storyline name"
              maxLength={100}
            />
          </div>
          <div className="form-group full-width">
            <label htmlFor="description">描述 (中文)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入故事线描述"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="form-group full-width">
            <label htmlFor="descriptionEn">描述 (英文)</label>
            <textarea
              id="descriptionEn"
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
              placeholder="Enter storyline description"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label htmlFor="icon">图标 (Emoji)</label>
            <input
              id="icon"
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="📖"
              maxLength={10}
              className="icon-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="character">绑定人物</label>
            <select
              id="character"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
            >
              <option value="">-- 选择人物 --</option>
              {characters.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="section-actions">
          <button
            className="btn-primary"
            onClick={handleSaveBasicInfo}
            disabled={saving}
          >
            {saving ? '保存中...' : isNew ? '创建故事线' : '保存基本信息'}
          </button>
        </div>
      </section>

      {/* Video Upload Section - Only show for existing storylines */}
      {!isNew && id && (
        <section className="edit-section">
          <h2>背景视频</h2>
          <div className="video-section">
            {videoDuration > 0 ? (
              <div className="video-info">
                <span className="video-status success">✓ 已上传视频</span>
                <span className="video-duration">
                  时长: {Math.floor(videoDuration / 60)}分{Math.floor(videoDuration % 60)}秒
                </span>
              </div>
            ) : (
              <div className="video-info">
                <span className="video-status warning">⚠ 未上传视频</span>
              </div>
            )}
            
            <div className="video-upload">
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
                {videoUploading ? '上传中...' : videoDuration > 0 ? '更换视频' : '上传视频'}
              </label>
              <span className="file-hint">支持 MP4 格式 (H.264 编码)</span>
            </div>

            {videoUploading && (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
                <span className="progress-text">{videoProgress}%</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Segment Configuration - Only show for existing storylines with video */}
      {!isNew && id && videoDuration > 0 && (
        <section className="edit-section">
          <h2>段落配置</h2>
          <SegmentConfigurator
            segments={segments}
            videoDuration={videoDuration}
            onSave={handleSaveSegments}
            saving={saving}
          />
        </section>
      )}

      {!isNew && id && videoDuration === 0 && (
        <section className="edit-section">
          <h2>段落配置</h2>
          <div className="placeholder-message">
            请先上传背景视频后再配置段落
          </div>
        </section>
      )}
    </div>
  )
}
