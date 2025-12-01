import { useRef, useState, useCallback, useEffect, MouseEvent } from 'react'
import { TimelineSegment, AnimationType } from '../../contexts/TimelineEditorContext'
import './SegmentBlock.css'

interface SegmentBlockProps {
  segment: TimelineSegment
  pixelsPerSecond: number
  videoDuration: number
  isSelected: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<TimelineSegment>) => void
  allSegments: TimelineSegment[]
}

type DragMode = 'none' | 'move' | 'resize-left' | 'resize-right'

// Minimum segment duration in seconds
const MIN_SEGMENT_DURATION = 1

// Animation type display labels
const ANIMATION_LABELS: Record<AnimationType, string> = {
  fade_in: '淡入',
  fade_out: '淡出',
  slide_left: '左滑',
  slide_right: '右滑',
  slide_up: '上滑',
  slide_down: '下滑',
  instant: '瞬间',
}

export default function SegmentBlock({
  segment,
  pixelsPerSecond,
  videoDuration,
  isSelected,
  onSelect,
  onUpdate,
  allSegments,
}: SegmentBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null)
  const [dragMode, setDragMode] = useState<DragMode>('none')
  const [dragStartX, setDragStartX] = useState(0)
  const [initialStartTime, setInitialStartTime] = useState(0)
  const [initialDuration, setInitialDuration] = useState(0)
  const [isInvalidPosition, setIsInvalidPosition] = useState(false)

  // Calculate position and width
  const left = segment.startTime * pixelsPerSecond
  const width = segment.duration * pixelsPerSecond

  // Check if a time range overlaps with other segments
  const checkOverlap = useCallback((startTime: number, duration: number, excludeId: string): boolean => {
    const endTime = startTime + duration
    
    for (const other of allSegments) {
      if (other.id === excludeId) continue
      
      const otherEnd = other.startTime + other.duration
      
      // Check for overlap
      if (startTime < otherEnd && endTime > other.startTime) {
        return true
      }
    }
    
    return false
  }, [allSegments])

  // Handle block click
  const handleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    onSelect()
  }, [onSelect])

  // Handle drag start for moving
  const handleMoveStart = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    setDragMode('move')
    setDragStartX(e.clientX)
    setInitialStartTime(segment.startTime)
    onSelect()
  }, [segment.startTime, onSelect])

  // Handle drag start for left resize
  const handleResizeLeftStart = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    setDragMode('resize-left')
    setDragStartX(e.clientX)
    setInitialStartTime(segment.startTime)
    setInitialDuration(segment.duration)
    onSelect()
  }, [segment.startTime, segment.duration, onSelect])

  // Handle drag start for right resize
  const handleResizeRightStart = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    setDragMode('resize-right')
    setDragStartX(e.clientX)
    setInitialDuration(segment.duration)
    onSelect()
  }, [segment.duration, onSelect])

  // Handle drag
  useEffect(() => {
    if (dragMode === 'none') return

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const deltaX = e.clientX - dragStartX
      const deltaTime = deltaX / pixelsPerSecond

      if (dragMode === 'move') {
        // Calculate new start time (Requirements 4.3)
        let newStartTime = initialStartTime + deltaTime
        
        // Clamp to valid range (Requirements 4.3: start_time >= 0 and start_time + duration <= video_duration)
        newStartTime = Math.max(0, newStartTime)
        newStartTime = Math.min(videoDuration - segment.duration, newStartTime)
        
        // Check for overlap (Requirements 4.2)
        const hasOverlap = checkOverlap(newStartTime, segment.duration, segment.id)
        setIsInvalidPosition(hasOverlap)
        
        if (!hasOverlap) {
          onUpdate({ startTime: newStartTime })
        }
      } else if (dragMode === 'resize-left') {
        // Resize from left edge (Requirements 4.2, 4.3)
        let newStartTime = initialStartTime + deltaTime
        let newDuration = initialDuration - deltaTime
        
        // Minimum duration constraint
        if (newDuration < MIN_SEGMENT_DURATION) {
          newDuration = MIN_SEGMENT_DURATION
          newStartTime = initialStartTime + initialDuration - MIN_SEGMENT_DURATION
        }
        
        // Clamp start time to >= 0 (Requirements 4.3)
        if (newStartTime < 0) {
          newDuration = initialDuration + initialStartTime
          newStartTime = 0
        }
        
        // Check for overlap with other segments (Requirements 4.2)
        if (!checkOverlap(newStartTime, newDuration, segment.id)) {
          onUpdate({ startTime: newStartTime, duration: newDuration })
        }
      } else if (dragMode === 'resize-right') {
        // Resize from right edge (Requirements 4.2, 4.3)
        let newDuration = initialDuration + deltaTime
        
        // Minimum duration constraint
        newDuration = Math.max(MIN_SEGMENT_DURATION, newDuration)
        
        // Clamp to video duration (Requirements 4.3: start_time + duration <= video_duration)
        const maxDuration = videoDuration - segment.startTime
        newDuration = Math.min(maxDuration, newDuration)
        
        // Check for overlap with other segments (Requirements 4.2)
        if (!checkOverlap(segment.startTime, newDuration, segment.id)) {
          onUpdate({ duration: newDuration })
        }
      }
    }

    const handleMouseUp = () => {
      setDragMode('none')
      setIsInvalidPosition(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [
    dragMode, dragStartX, initialStartTime, initialDuration,
    pixelsPerSecond, videoDuration, segment, checkOverlap, onUpdate
  ])

  // Format duration display
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      ref={blockRef}
      className={`segment-block ${isSelected ? 'segment-block--selected' : ''} ${dragMode !== 'none' ? 'segment-block--dragging' : ''} ${isInvalidPosition ? 'segment-block--invalid' : ''}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
      onClick={handleClick}
    >
      {/* Left resize handle */}
      <div
        className="segment-block__handle segment-block__handle--left"
        onMouseDown={handleResizeLeftStart}
      />

      {/* Main content area (draggable) */}
      <div
        className="segment-block__content"
        onMouseDown={handleMoveStart}
      >
        {/* Segment index */}
        <div className="segment-block__index">
          {segment.index + 1}
        </div>

        {/* Animation indicators */}
        <div className="segment-block__animations">
          {segment.entryAnimation.type !== 'instant' && (
            <span className="segment-block__animation segment-block__animation--entry" title={`进入: ${ANIMATION_LABELS[segment.entryAnimation.type]}`}>
              ↘ {ANIMATION_LABELS[segment.entryAnimation.type]}
            </span>
          )}
          {segment.exitAnimation.type !== 'instant' && (
            <span className="segment-block__animation segment-block__animation--exit" title={`退出: ${ANIMATION_LABELS[segment.exitAnimation.type]}`}>
              ↗ {ANIMATION_LABELS[segment.exitAnimation.type]}
            </span>
          )}
        </div>

        {/* Duration display */}
        <div className="segment-block__duration">
          {formatDuration(segment.duration)}
        </div>
      </div>

      {/* Right resize handle */}
      <div
        className="segment-block__handle segment-block__handle--right"
        onMouseDown={handleResizeRightStart}
      />

      {/* Entry animation indicator bar */}
      {segment.entryAnimation.type !== 'instant' && (
        <div
          className="segment-block__animation-bar segment-block__animation-bar--entry"
          style={{ width: `${segment.entryAnimation.duration * pixelsPerSecond}px` }}
        />
      )}

      {/* Exit animation indicator bar */}
      {segment.exitAnimation.type !== 'instant' && (
        <div
          className="segment-block__animation-bar segment-block__animation-bar--exit"
          style={{ width: `${segment.exitAnimation.duration * pixelsPerSecond}px` }}
        />
      )}
    </div>
  )
}
