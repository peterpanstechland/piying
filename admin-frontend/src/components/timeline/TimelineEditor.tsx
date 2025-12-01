import { useCallback, useRef, useEffect } from 'react'
import { 
  TimelineEditorProvider, 
  useTimelineEditor, 
  TimelineSegment,
  Transition,
  createDefaultSegment 
} from '../../contexts/TimelineEditorContext'
import { useTimelineKeyboard } from '../../hooks/useTimelineKeyboard'
import VideoPreview from './VideoPreview'
import TimelineTrack from './TimelineTrack'
import PropertyPanel from './PropertyPanel'
import './TimelineEditor.css'

interface TimelineEditorProps {
  videoUrl: string | null
  storylineId?: string
  initialSegments?: TimelineSegment[]
  initialTransitions?: Transition[]
  onSegmentsChange?: (segments: TimelineSegment[]) => void
  onTransitionsChange?: (transitions: Transition[]) => void
  onSegmentDelete?: (segmentId: string) => void
  onFrameCapture?: (imageData: string) => void
  onGuidanceImageUpload?: (segmentId: string, file: File) => Promise<void>
  onGuidanceFrameCapture?: (segmentId: string, time: number) => Promise<void>
}

/**
 * Inner component that uses the timeline context
 */
function TimelineEditorInner({
  videoUrl,
  storylineId,
  onSegmentsChange,
  onTransitionsChange,
  onSegmentDelete,
  onFrameCapture,
  onGuidanceImageUpload,
  onGuidanceFrameCapture,
}: Omit<TimelineEditorProps, 'initialSegments' | 'initialTransitions'>) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const {
    playhead,
    segments,
    transitions,
    addSegment,
    selectedSegmentId,
    selectedTransitionId,
    clearSelection,
  } = useTimelineEditor()

  // Initialize keyboard shortcuts (Requirements 11.3)
  useTimelineKeyboard({
    enabled: true,
    onDeleteSegment: onSegmentDelete,
  })

  // Notify parent when segments change
  useEffect(() => {
    if (onSegmentsChange) {
      onSegmentsChange(segments)
    }
  }, [segments, onSegmentsChange])

  // Notify parent when transitions change
  useEffect(() => {
    if (onTransitionsChange) {
      onTransitionsChange(transitions)
    }
  }, [transitions, onTransitionsChange])

  // Handle segment changes from timeline track
  const handleSegmentChange = useCallback((_segment: TimelineSegment) => {
    // Segment updates are handled by the context
    // This callback is for additional side effects if needed
  }, [])

  // Handle playhead drag for video sync
  const handlePlayheadDrag = useCallback((_time: number) => {
    // The context already updates the playhead
    // Video preview syncs automatically via context
  }, [])

  // Add new segment at current playhead position
  const handleAddSegment = useCallback(() => {
    const newIndex = segments.length
    const newSegment = createDefaultSegment(newIndex, playhead)
    addSegment(newSegment)
  }, [segments.length, playhead, addSegment])

  // Handle click outside segments to clear selection
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only clear if clicking directly on the container
    if (e.target === e.currentTarget) {
      clearSelection()
    }
  }, [clearSelection])

  return (
    <div 
      ref={containerRef}
      className="timeline-editor"
      onClick={handleContainerClick}
      tabIndex={0} // Make focusable for keyboard events
    >
      {/* Video Preview Section */}
      <div className="timeline-editor__preview">
        <VideoPreview 
          videoUrl={videoUrl}
          onFrameCapture={onFrameCapture}
        />
      </div>

      {/* Timeline Track Section */}
      <div className="timeline-editor__timeline">
        <div className="timeline-editor__toolbar">
          <button 
            className="timeline-editor__btn"
            onClick={handleAddSegment}
            title="在当前位置添加段落"
          >
            ➕ 添加段落
          </button>
          
          <div className="timeline-editor__shortcuts-hint">
            <span>快捷键:</span>
            <kbd>Space</kbd> 播放/暂停
            <kbd>←</kbd><kbd>→</kbd> 步进
            <kbd>Home</kbd><kbd>End</kbd> 跳转
            <kbd>Delete</kbd> 删除段落
          </div>
        </div>
        
        <TimelineTrack 
          onSegmentChange={handleSegmentChange}
          onPlayheadDrag={handlePlayheadDrag}
          snapToSegments={true}
        />
      </div>

      {/* Property Panel - shown when segment or transition is selected */}
      {(selectedSegmentId || selectedTransitionId) && (
        <div className="timeline-editor__property-panel">
          <PropertyPanel
            storylineId={storylineId}
            onGuidanceImageUpload={onGuidanceImageUpload}
            onGuidanceFrameCapture={onGuidanceFrameCapture}
          />
        </div>
      )}

      {/* Selection info */}
      {selectedSegmentId && (
        <div className="timeline-editor__selection-info">
          已选择段落 {segments.findIndex(s => s.id === selectedSegmentId) + 1}
          <span className="timeline-editor__selection-hint">
            按 Delete 键删除
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Timeline Editor component with context provider
 * Provides a complete timeline editing experience with video preview,
 * segment management, property panel, and keyboard shortcuts.
 */
export default function TimelineEditor({
  videoUrl,
  storylineId,
  initialSegments = [],
  initialTransitions = [],
  onSegmentsChange,
  onTransitionsChange,
  onSegmentDelete,
  onFrameCapture,
  onGuidanceImageUpload,
  onGuidanceFrameCapture,
}: TimelineEditorProps) {
  return (
    <TimelineEditorProvider 
      initialSegments={initialSegments}
      initialTransitions={initialTransitions}
    >
      <TimelineEditorInner
        videoUrl={videoUrl}
        storylineId={storylineId}
        onSegmentsChange={onSegmentsChange}
        onTransitionsChange={onTransitionsChange}
        onSegmentDelete={onSegmentDelete}
        onFrameCapture={onFrameCapture}
        onGuidanceImageUpload={onGuidanceImageUpload}
        onGuidanceFrameCapture={onGuidanceFrameCapture}
      />
    </TimelineEditorProvider>
  )
}
