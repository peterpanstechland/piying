import { useRef, useEffect, useCallback } from 'react'
import { useTimelineEditor, PlaybackSpeed } from '../../contexts/TimelineEditorContext'
import './VideoPreview.css'

interface VideoPreviewProps {
  videoUrl: string | null
  onFrameCapture?: (imageData: string) => void
  /** Expose video element ref for external frame capture */
  videoElementRef?: React.RefObject<HTMLVideoElement>
}

const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 1.5, 2]

export default function VideoPreview({ videoUrl, onFrameCapture, videoElementRef }: VideoPreviewProps) {
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  // Use external ref if provided, otherwise use internal ref
  const videoRef = videoElementRef || internalVideoRef
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const {
    playhead,
    setPlayhead,
    isPlaying,
    pause,
    togglePlayback,
    playbackSpeed,
    setPlaybackSpeed,
    videoDuration,
    setVideoDuration,
  } = useTimelineEditor()

  // Sync video playback rate with context
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Sync video play/pause state with context
  useEffect(() => {
    if (!videoRef.current) return
    
    if (isPlaying) {
      videoRef.current.play().catch(() => {
        // Handle autoplay restrictions
        pause()
      })
    } else {
      videoRef.current.pause()
    }
  }, [isPlaying, pause])

  // Sync video currentTime with playhead (when not playing)
  useEffect(() => {
    if (!videoRef.current || isPlaying) return
    
    // Only update if difference is significant (avoid loops)
    const diff = Math.abs(videoRef.current.currentTime - playhead)
    if (diff > 0.05) {
      videoRef.current.currentTime = playhead
    }
  }, [playhead, isPlaying])

  // Handle video time updates during playback
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && isPlaying) {
      setPlayhead(videoRef.current.currentTime)
    }
  }, [isPlaying, setPlayhead])

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration)
    }
  }, [setVideoDuration])

  // Handle video ended
  const handleEnded = useCallback(() => {
    pause()
    setPlayhead(0)
  }, [pause, setPlayhead])

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

  // Format time as MM:SS.ms
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`
  }

  // Skip forward/backward
  const skipTime = useCallback((delta: number) => {
    setPlayhead(playhead + delta)
  }, [playhead, setPlayhead])

  // Jump to start/end
  const jumpToStart = useCallback(() => {
    setPlayhead(0)
  }, [setPlayhead])

  const jumpToEnd = useCallback(() => {
    setPlayhead(videoDuration)
  }, [setPlayhead, videoDuration])

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
          preload="metadata"
        />
        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
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
