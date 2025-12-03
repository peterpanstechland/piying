/**
 * VideoEditorPage - Dedicated page for video timeline editing
 * 
 * This page provides a full-screen video editing experience with:
 * - Large video preview
 * - Timeline editor for segments
 * - Guidance image configuration
 * 
 * Routes:
 * - /storylines/:storylineId/video-editor - Edit base video
 * - /storylines/:storylineId/characters/:characterId/video-editor - Edit character video (independent segments)
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import TimelineEditor from '../components/timeline/TimelineEditor'
import { TimelineSegment, Transition, AnimationConfig } from '../contexts/TimelineEditorContext'
import './VideoEditorPage.css'

interface StorylineSegment {
  id: string
  index: number
  start_time: number
  duration: number
  entry_animation?: { type: string; duration: number; delay: number } | string
  exit_animation?: { type: string; duration: number; delay: number } | string
  guidance_text?: string
  guidance_text_en?: string
  guidance_image?: string | null
  // Path data - individual fields
  offset_start_x?: number
  offset_start_y?: number
  offset_end_x?: number
  offset_end_y?: number
  // Path data - array format (from backend)
  offset_start?: number[]
  offset_end?: number[]
  path_waypoints?: Array<[number, number]> | string | number[][]
  path_draw_type?: 'linear' | 'bezier' | 'freehand' | string
  play_audio?: boolean
}

interface StorylineData {
  id: string
  name: string
  base_video_path: string | null
  video_duration: number
  segments: StorylineSegment[]
  transitions: Array<{
    id: string
    from_segment_index: number
    to_segment_index: number
    type: string
    duration: number
  }>
}

const defaultAnimation: AnimationConfig = {
  type: 'instant',
  duration: 0.5,
  delay: 0,
}

export default function VideoEditorPage() {
  const { storylineId, characterId } = useParams<{ storylineId: string; characterId?: string }>()
  const navigate = useNavigate()
  
  const [storyline, setStoryline] = useState<StorylineData | null>(null)
  const [characterName, setCharacterName] = useState<string>('')
  const [characterSegments, setCharacterSegments] = useState<StorylineSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Determine if editing character video or base video
  const isCharacterVideo = !!characterId

  // Load data
  const loadData = useCallback(async () => {
    if (!storylineId) return

    try {
      setLoading(true)
      setError(null)

      // Always load storyline for basic info
      const data = await adminApi.getStoryline(storylineId)
      setStoryline(data as unknown as StorylineData)

      // If editing character video, load character-specific segments
      if (characterId) {
        try {
          const charData = await adminApi.getCharacter(characterId)
          setCharacterName(charData.name)
          
          // Load character video segments
          const segmentsData = await adminApi.getCharacterVideoSegments(storylineId, characterId)
          setCharacterSegments(segmentsData.segments as StorylineSegment[])
        } catch {
          setCharacterName('角色')
          setCharacterSegments([])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [storylineId, characterId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Get video URL
  const getVideoUrl = (): string => {
    if (!storylineId) return ''
    if (isCharacterVideo && characterId) {
      return adminApi.getCharacterVideoUrl(storylineId, characterId)
    }
    return `/api/admin/storylines/${storylineId}/video`
  }

  // Convert segments to timeline format
  const getTimelineSegments = (): TimelineSegment[] => {
    const segments = isCharacterVideo ? characterSegments : storyline?.segments
    if (!segments) return []
    
    return segments.map((seg, index) => {
      // Parse waypoints if stored as JSON string or array
      let waypoints: Array<{ x: number; y: number }> = []
      if (seg.path_waypoints) {
        try {
          const parsed = typeof seg.path_waypoints === 'string' 
            ? JSON.parse(seg.path_waypoints) 
            : seg.path_waypoints
          if (Array.isArray(parsed)) {
            waypoints = parsed.map((wp: [number, number]) => ({ x: wp[0], y: wp[1] }))
          }
        } catch {
          waypoints = []
        }
      }
      
      // Support both formats: offset_start_x/y (individual) or offset_start (array)
      const segWithArrays = seg as typeof seg & { offset_start?: number[]; offset_end?: number[] }
      
      // Get start coordinates - prefer individual fields, fallback to array
      let startX = seg.offset_start_x
      let startY = seg.offset_start_y
      if (startX === undefined && segWithArrays.offset_start) {
        startX = segWithArrays.offset_start[0]
        startY = segWithArrays.offset_start[1]
      }
      
      // Get end coordinates - prefer individual fields, fallback to array
      let endX = seg.offset_end_x
      let endY = seg.offset_end_y
      if (endX === undefined && segWithArrays.offset_end) {
        endX = segWithArrays.offset_end[0]
        endY = segWithArrays.offset_end[1]
      }
      
      // Build path object if coordinates exist
      const hasPath = startX !== undefined || endX !== undefined
      const path = hasPath ? {
        startPoint: { 
          x: startX ?? 0.1, 
          y: startY ?? 0.5 
        },
        endPoint: { 
          x: endX ?? 0.9, 
          y: endY ?? 0.5 
        },
        waypoints,
        pathType: (seg.path_draw_type || 'linear') as 'linear' | 'bezier' | 'freehand',
      } : undefined
      
      return {
        id: seg.id || `segment-${index}`,
        index,
        startTime: seg.start_time,
        duration: seg.duration,
        entryAnimation: typeof seg.entry_animation === 'object' ? seg.entry_animation as AnimationConfig : defaultAnimation,
        exitAnimation: typeof seg.exit_animation === 'object' ? seg.exit_animation as AnimationConfig : defaultAnimation,
        guidanceText: seg.guidance_text || '',
        guidanceTextEn: seg.guidance_text_en || '',
        guidanceImage: seg.guidance_image || null,
        playAudio: (seg as any).play_audio || false,
        path,
      }
    })
  }

  // Convert transitions (only for base video)
  const getTimelineTransitions = (): Transition[] => {
    if (isCharacterVideo || !storyline?.transitions) return []
    return storyline.transitions.map(t => ({
      id: t.id,
      fromSegmentIndex: t.from_segment_index,
      toSegmentIndex: t.to_segment_index,
      type: t.type as Transition['type'],
      duration: t.duration,
    }))
  }


  // Track if initial load is complete to avoid saving on mount
  const [isInitialized, setIsInitialized] = useState(false)
  const [prevSegmentsJson, setPrevSegmentsJson] = useState<string>('')
  
  useEffect(() => {
    const segments = isCharacterVideo ? characterSegments : storyline?.segments
    if (segments) {
      const initialJson = JSON.stringify(segments.map(s => ({
        startTime: s.start_time,
        duration: s.duration,
        entryAnimation: typeof s.entry_animation === 'object' ? s.entry_animation : defaultAnimation,
        exitAnimation: typeof s.exit_animation === 'object' ? s.exit_animation : defaultAnimation,
        guidanceText: s.guidance_text || '',
        guidanceTextEn: s.guidance_text_en || '',
        guidanceImage: s.guidance_image || null,
        playAudio: (s as any).play_audio || false,
      })))
      setPrevSegmentsJson(initialJson)
      
      const timer = setTimeout(() => setIsInitialized(true), 500)
      return () => clearTimeout(timer)
    }
  }, [storyline, characterSegments, isCharacterVideo])

  // Handle segments change
  const handleSegmentsChange = useCallback(async (segments: TimelineSegment[]) => {
    if (!storylineId || segments.length === 0 || !isInitialized) return

    const segmentsJson = JSON.stringify(segments.map(s => ({
      startTime: s.startTime,
      duration: s.duration,
      entryAnimation: s.entryAnimation,
      exitAnimation: s.exitAnimation,
      guidanceText: s.guidanceText,
      guidanceTextEn: s.guidanceTextEn,
      guidanceImage: s.guidanceImage,
      playAudio: s.playAudio || false,
      // Include path in comparison to detect path changes
      path: s.path ? {
        startPoint: s.path.startPoint,
        endPoint: s.path.endPoint,
        waypoints: s.path.waypoints,
        pathType: s.path.pathType,
      } : null,
    })))

    if (segmentsJson === prevSegmentsJson) return
    setPrevSegmentsJson(segmentsJson)

    try {
      setSaving(true)
      const apiSegments = segments.map((seg, index) => ({
        index,
        start_time: seg.startTime,
        duration: seg.duration,
        path_type: seg.path?.pathType || 'static',
        offset_start: (seg.path 
          ? [seg.path.startPoint.x, seg.path.startPoint.y] 
          : [0.1, 0.5]) as [number, number],
        offset_end: (seg.path 
          ? [seg.path.endPoint.x, seg.path.endPoint.y] 
          : [0.9, 0.5]) as [number, number],
        path_waypoints: (seg.path?.waypoints.map(wp => [wp.x, wp.y]) || []) as [number, number][],
        path_draw_type: seg.path?.pathType || 'linear',
        entry_animation: {
          type: String(seg.entryAnimation?.type || 'instant'),
          duration: Number(seg.entryAnimation?.duration) || 1.0,
          delay: Number(seg.entryAnimation?.delay) || 0,
        },
        exit_animation: {
          type: String(seg.exitAnimation?.type || 'instant'),
          duration: Number(seg.exitAnimation?.duration) || 1.0,
          delay: Number(seg.exitAnimation?.delay) || 0,
        },
        guidance_text: seg.guidanceText || '',
        guidance_text_en: seg.guidanceTextEn || '',
        guidance_image: seg.guidanceImage || null,
        play_audio: seg.playAudio || false,
      }))

      if (isCharacterVideo && characterId) {
        // Save to character video segments
        await adminApi.updateCharacterVideoSegments(storylineId, characterId, apiSegments)
      } else {
        // Save to base video segments
        await adminApi.updateTimelineSegments(storylineId, apiSegments as Parameters<typeof adminApi.updateTimelineSegments>[1])
      }
      setError(null)
    } catch (err) {
      console.error('Save segments error:', err)
      const errorObj = err as { detail?: string | Array<{msg: string}>; message?: string }
      let errorMessage = '保存失败'
      if (typeof errorObj.detail === 'string') {
        errorMessage = errorObj.detail
      } else if (Array.isArray(errorObj.detail) && errorObj.detail.length > 0) {
        errorMessage = errorObj.detail.map(e => e.msg).join('; ')
      } else if (errorObj.message) {
        errorMessage = errorObj.message
      }
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }, [storylineId, characterId, isCharacterVideo, isInitialized, prevSegmentsJson])

  // Handle transitions change (only for base video)
  const handleTransitionsChange = useCallback(async (transitions: Transition[]) => {
    if (!storylineId || isCharacterVideo) return

    try {
      const apiTransitions = transitions.map(t => ({
        from_segment_index: t.fromSegmentIndex,
        to_segment_index: t.toSegmentIndex,
        type: t.type,
        duration: t.duration,
      }))
      await adminApi.updateTransitions(storylineId, apiTransitions)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }, [storylineId, isCharacterVideo])

  // Handle segment delete
  const handleSegmentDelete = useCallback(async (segmentId: string) => {
    if (!storylineId) return

    const segments = isCharacterVideo ? characterSegments : storyline?.segments
    const segment = segments?.find(s => s.id === segmentId)
    if (!segment) return

    try {
      if (isCharacterVideo && characterId) {
        await adminApi.deleteCharacterVideoSegment(storylineId, characterId, segment.index)
      } else {
        await adminApi.deleteSegment(storylineId, segment.index)
      }
      setError(null)
      await loadData()
    } catch (err) {
      console.error('Delete segment error:', err)
      const errorObj = err as { detail?: string; message?: string }
      setError(typeof errorObj.detail === 'string' ? errorObj.detail : errorObj.message || '删除失败')
    }
  }, [storylineId, characterId, isCharacterVideo, storyline, characterSegments, loadData])

  // Handle guidance image upload (only for base video for now)
  const handleGuidanceImageUpload = useCallback(async (segmentId: string, file: File) => {
    if (!storylineId || isCharacterVideo) return

    const segment = storyline?.segments.find(s => s.id === segmentId)
    if (!segment) return

    try {
      const formData = new FormData()
      formData.append('file', file)
      await adminApi.uploadGuidanceImage(storylineId, segment.index, formData)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    }
  }, [storylineId, isCharacterVideo, storyline, loadData])

  // Handle guidance frame capture (only for base video for now)
  const handleGuidanceFrameCapture = useCallback(async (segmentId: string, timestamp: number) => {
    if (!storylineId || isCharacterVideo) return

    const segment = storyline?.segments.find(s => s.id === segmentId)
    if (!segment) return

    try {
      await adminApi.captureGuidanceFromVideo(storylineId, segment.index, timestamp)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '截取失败')
    }
  }, [storylineId, isCharacterVideo, storyline, loadData])

  // Go back
  const handleBack = () => {
    navigate(`/storylines/${storylineId}/timeline`)
  }

  if (loading) {
    return (
      <div className="video-editor-page video-editor-page--loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    )
  }

  if (error && !storyline) {
    return (
      <div className="video-editor-page video-editor-page--error">
        <p className="error-message">{error}</p>
        <button className="btn-primary" onClick={handleBack}>返回</button>
      </div>
    )
  }

  const hasVideo = isCharacterVideo || storyline?.base_video_path

  if (!hasVideo) {
    return (
      <div className="video-editor-page video-editor-page--error">
        <p className="error-message">请先上传视频</p>
        <button className="btn-primary" onClick={handleBack}>返回</button>
      </div>
    )
  }

  return (
    <div className="video-editor-page">
      <header className="video-editor-page__header">
        <button className="video-editor-page__back" onClick={handleBack}>
          ← 返回
        </button>
        <h1 className="video-editor-page__title">
          {isCharacterVideo 
            ? `${characterName} 专属视频编辑` 
            : `${storyline?.name || '故事线'} - 视频编辑`
          }
        </h1>
        {saving && <span className="video-editor-page__saving">保存中...</span>}
        {error && (
          <span className="video-editor-page__error-hint" onClick={() => setError(null)}>
            ⚠️ {error} (点击关闭)
          </span>
        )}
      </header>

      <main className="video-editor-page__main">
        <TimelineEditor
          videoUrl={getVideoUrl()}
          storylineId={storylineId || ''}
          initialSegments={getTimelineSegments()}
          initialTransitions={getTimelineTransitions()}
          onSegmentsChange={handleSegmentsChange}
          onTransitionsChange={handleTransitionsChange}
          onSegmentDelete={handleSegmentDelete}
          onGuidanceImageUpload={isCharacterVideo ? undefined : handleGuidanceImageUpload}
          onGuidanceFrameCapture={isCharacterVideo ? undefined : handleGuidanceFrameCapture}
          saving={saving}
        />
      </main>
    </div>
  )
}
