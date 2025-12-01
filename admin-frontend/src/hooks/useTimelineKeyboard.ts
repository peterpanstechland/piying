import { useEffect, useCallback } from 'react'
import { useTimelineEditor } from '../contexts/TimelineEditorContext'

// Frame step in seconds (approximately 1 frame at 30fps)
const FRAME_STEP = 1 / 30

// Larger step for arrow keys (1 second)
const ARROW_STEP = 1

interface UseTimelineKeyboardOptions {
  enabled?: boolean
  onDeleteSegment?: (segmentId: string) => void
}

/**
 * Custom hook for timeline keyboard shortcuts
 * Requirements 11.3: Space (play/pause), Left/Right (frame step), Home/End (jump), Delete (remove segment)
 */
export function useTimelineKeyboard(options: UseTimelineKeyboardOptions = {}) {
  const { enabled = true, onDeleteSegment } = options
  
  const {
    playhead,
    setPlayhead,
    videoDuration,
    isPlaying,
    togglePlayback,
    selectedSegmentId,
    removeSegment,
  } = useTimelineEditor()

  // Jump to start
  const jumpToStart = useCallback(() => {
    setPlayhead(0)
  }, [setPlayhead])

  // Jump to end
  const jumpToEnd = useCallback(() => {
    setPlayhead(videoDuration)
  }, [setPlayhead, videoDuration])

  // Step forward
  const stepForward = useCallback((large = false) => {
    const step = large ? ARROW_STEP : FRAME_STEP
    setPlayhead(Math.min(playhead + step, videoDuration))
  }, [playhead, setPlayhead, videoDuration])

  // Step backward
  const stepBackward = useCallback((large = false) => {
    const step = large ? ARROW_STEP : FRAME_STEP
    setPlayhead(Math.max(playhead - step, 0))
  }, [playhead, setPlayhead])

  // Delete selected segment
  const deleteSelectedSegment = useCallback(() => {
    if (selectedSegmentId) {
      // Call external handler if provided (for API sync)
      if (onDeleteSegment) {
        onDeleteSegment(selectedSegmentId)
      }
      // Remove from local state
      removeSegment(selectedSegmentId)
    }
  }, [selectedSegmentId, removeSegment, onDeleteSegment])

  // Keyboard event handler
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      switch (e.key) {
        case ' ': // Space - play/pause
          e.preventDefault()
          togglePlayback()
          break
          
        case 'ArrowLeft': // Left arrow - step backward
          e.preventDefault()
          if (isPlaying) {
            togglePlayback() // Pause first
          }
          stepBackward(!e.shiftKey) // Shift for frame step, normal for 1 second
          break
          
        case 'ArrowRight': // Right arrow - step forward
          e.preventDefault()
          if (isPlaying) {
            togglePlayback() // Pause first
          }
          stepForward(!e.shiftKey) // Shift for frame step, normal for 1 second
          break
          
        case 'Home': // Home - jump to start
          e.preventDefault()
          jumpToStart()
          break
          
        case 'End': // End - jump to end
          e.preventDefault()
          jumpToEnd()
          break
          
        case 'Delete': // Delete - remove selected segment
        case 'Backspace': // Also support Backspace on Mac
          if (selectedSegmentId) {
            e.preventDefault()
            deleteSelectedSegment()
          }
          break
          
        default:
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    enabled,
    togglePlayback,
    isPlaying,
    stepBackward,
    stepForward,
    jumpToStart,
    jumpToEnd,
    selectedSegmentId,
    deleteSelectedSegment,
  ])

  return {
    jumpToStart,
    jumpToEnd,
    stepForward,
    stepBackward,
    deleteSelectedSegment,
  }
}

export default useTimelineKeyboard
