import { useRef, useEffect, useCallback } from 'react'
import { useTimelineEditor, PlaybackSpeed, LoopMode } from '../../contexts/TimelineEditorContext'
import './VideoPreview.css'

interface VideoPreviewProps {
  videoUrl: string | null
  onFrameCapture?: (imageData: string) => void
  /** Expose video element ref for external frame capture */
  videoElementRef?: React.RefObject<HTMLVideoElement>
  children?: React.ReactNode
}

const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 1.5, 2]
const LOOP_MODES: { value: LoopMode; label: string }[] = [
  { value: 'none', label: '不循环' },
  { value: 'segment', label: '段落循环' },
  { value: 'full', label: '全片循环' },
]

export default function VideoPreview({ videoUrl, onFrameCapture, videoElementRef, children }: VideoPreviewProps) {
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const videoRef = videoElementRef || internalVideoRef
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // 记录视频驱动更新的时间戳，用于判断 playhead 变化是否来自视频播放
  const lastVideoUpdateTimeRef = useRef<number>(0)
  // 记录上一次用户 seek 的时间戳，防止 seek 后立即被视频 timeupdate 覆盖
  const lastUserSeekTimeRef = useRef<number>(0)
  
  const {
    playhead,
    setPlayhead,
    isPlaying,
    pause,
    togglePlayback,
    playbackSpeed,
    setPlaybackSpeed,
    loopMode,
    setLoopMode,
    videoDuration,
    setVideoDuration,
    segments,
    selectedSegmentId,
  } = useTimelineEditor()

  // 1. 处理播放速度
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed, videoRef])

  // 2. 处理 播放/暂停 状态
  // 这里的逻辑只负责 .play() 和 .pause()，不负责时间跳转
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    if (isPlaying) {
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // 只有在真的报错时才暂停（例如自动播放策略阻止），避免因为快速切换状态导致的打断
          console.warn("Playback prevented or interrupted")
          pause()
        })
      }
    } else {
      video.pause()
    }
  }, [isPlaying, pause, videoRef])

  // 3. 核心逻辑：React State (Playhead) -> Video Element (CurrentTime)
  // 这是解决"无法Seek"和"卡顿"的关键
  useEffect(() => {
    const video = videoRef.current
    if (!video || !Number.isFinite(playhead)) return
    
    const now = Date.now()
    
    // 关键：如果 playhead 是由视频 timeupdate 刚刚更新的（100ms 内），不要反向 seek
    // 这样可以避免播放时的死循环
    const timeSinceVideoUpdate = now - lastVideoUpdateTimeRef.current
    if (timeSinceVideoUpdate < 100) {
      return
    }
    
    // 计算 React 状态和 视频真实时间 的差值
    const timeDiff = Math.abs(video.currentTime - playhead)
    
    // 定义"容忍度"
    // 如果正在播放，容忍度大一点 (0.5s)
    // 如果是暂停，容忍度极小 (0.05s)，保证精确对帧
    const threshold = isPlaying ? 0.5 : 0.05
    
    // 只有当 差值 > 容忍度 时，才执行 seek
    if (timeDiff > threshold) {
      // 记录用户 seek 时间
      lastUserSeekTimeRef.current = now
      
      console.log('[VideoPreview] Seeking to:', playhead, 'from:', video.currentTime, 'diff:', timeDiff)
      
      // 检查 video 是否已就绪
      if (video.readyState >= 1) { // HAVE_METADATA
        video.currentTime = playhead
      } else {
        const seekOnce = () => {
          video.currentTime = playhead
        }
        video.addEventListener('loadedmetadata', seekOnce, { once: true })
      }
    }
  }, [playhead, isPlaying, videoRef])

  // 4. 核心逻辑：Video Element (CurrentTime) -> React State (Playhead)
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return
    
    const now = Date.now()
    const currentTime = videoRef.current.currentTime
    
    // 如果用户刚刚 seek（300ms 内），忽略 timeupdate，让视频先稳定
    if (now - lastUserSeekTimeRef.current < 300) {
      return
    }
    
    // 只有在播放时才更新 playhead
    if (isPlaying) {
      // 记录视频更新时间戳
      lastVideoUpdateTimeRef.current = now
      setPlayhead(currentTime)
    }
    
    // --- 循环逻辑 ---
    if (loopMode === 'segment' && selectedSegmentId && isPlaying) {
      const selectedSegment = segments.find(s => s.id === selectedSegmentId)
      if (selectedSegment) {
        const segmentEnd = selectedSegment.startTime + selectedSegment.duration
        // 只有"自然播放"超过结束点（误差1秒内）才循环
        const isNaturalEnd = currentTime >= segmentEnd && currentTime < (segmentEnd + 1.0)
        if (isNaturalEnd) {
          videoRef.current.currentTime = selectedSegment.startTime
          lastVideoUpdateTimeRef.current = now
          setPlayhead(selectedSegment.startTime)
        }
      }
    }
  }, [isPlaying, setPlayhead, loopMode, selectedSegmentId, segments, videoRef])

  // 5. 处理视频结束
  const handleEnded = useCallback(() => {
    if (loopMode === 'full') {
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(console.error)
      }
      setPlayhead(0)
    } else {
      pause()
      // 注意：这里不自动 setPlayhead(0)，让用户可以停在最后查看
      // 如果需要回到开头，用户可以手动点击
    }
  }, [loopMode, pause, setPlayhead, videoRef])

  // 6. 辅助功能：加载元数据
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration)
    }
  }, [setVideoDuration, videoRef])

  // Capture current frame as image
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !onFrameCapture) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    const imageData = canvas.toDataURL('image/png')
    onFrameCapture(imageData)
  }, [onFrameCapture])

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds)) return "00:00.0"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`
  }

  // 手动跳转（快进快退）
  const skipTime = useCallback((delta: number) => {
    const newTime = Math.max(0, Math.min(playhead + delta, videoDuration))
    setPlayhead(newTime)
  }, [playhead, setPlayhead, videoDuration])

  const jumpToStart = () => setPlayhead(0)
  const jumpToEnd = () => setPlayhead(videoDuration)

  if (!videoUrl) {
    return (
      <div className="video-preview video-preview--empty">
        <div className="video-preview__placeholder">
          <span className="video-preview__placeholder-icon">🎬</span>
          <span className="video-preview__placeholder-text">请先上传视频</span>
        </div>
      </div>
    )
  }

  return (
    <div className="video-preview">
      <div className="video-preview__container">
        <video
          ref={videoRef}
          className="video-preview__video"
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          preload="auto"
          onClick={togglePlayback}
        />
        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        
        {/* Overlay elements (PathEditor, CharacterOverlay) */}
        {children}
      </div>

      <div className="video-preview__controls">
        {/* Time display */}
        <div className="video-preview__time">
          <span className="video-preview__current-time">{formatTime(playhead)}</span>
          <span className="video-preview__time-separator">/</span>
          <span className="video-preview__duration">{formatTime(videoDuration)}</span>
        </div>

        {/* Playback controls */}
        <div className="video-preview__playback">
          <button
            className="video-preview__btn"
            onClick={jumpToStart}
            title="跳到开始 (Home)"
          >
            ⏮
          </button>
          <button
            className="video-preview__btn"
            onClick={() => skipTime(-1)}
            title="后退1秒 (←)"
          >
            ⏪
          </button>
          <button
            className="video-preview__btn video-preview__btn--play"
            onClick={togglePlayback}
            title={isPlaying ? '暂停 (Space)' : '播放 (Space)'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="video-preview__btn"
            onClick={() => skipTime(1)}
            title="前进1秒 (→)"
          >
            ⏩
          </button>
          <button
            className="video-preview__btn"
            onClick={jumpToEnd}
            title="跳到结束 (End)"
          >
            ⏭
          </button>
        </div>

        {/* Speed control */}
        <div className="video-preview__speed">
          <label className="video-preview__speed-label">速度:</label>
          <select
            className="video-preview__speed-select"
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value) as PlaybackSpeed)}
          >
            {PLAYBACK_SPEEDS.map(speed => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </div>

        {/* Loop mode control (Requirements 11.5) */}
        <div className="video-preview__loop">
          <label className="video-preview__loop-label">循环:</label>
          <select
            className="video-preview__loop-select"
            value={loopMode}
            onChange={(e) => setLoopMode(e.target.value as LoopMode)}
          >
            {LOOP_MODES.map(mode => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>

        {/* Frame capture button */}
        {onFrameCapture && (
          <button
            className="video-preview__btn video-preview__btn--capture"
            onClick={captureFrame}
            title="截取当前帧"
          >
            📷 截图
          </button>
        )}
      </div>
    </div>
  )
}
