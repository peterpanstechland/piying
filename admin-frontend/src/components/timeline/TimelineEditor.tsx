import { useCallback, useRef, useEffect, useState } from 'react'
import { 
  TimelineEditorProvider, 
  useTimelineEditor, 
  TimelineSegment,
  Transition,
  SegmentPath,
  createDefaultSegment 
} from '../../contexts/TimelineEditorContext'
import { useTimelineKeyboard } from '../../hooks/useTimelineKeyboard'
import VideoPreview from './VideoPreview'
import TimelineTrack from './TimelineTrack'
import PropertyPanel from './PropertyPanel'
import PathEditor from './PathEditor'
import CharacterOverlay from './CharacterOverlay'
import { PathTool } from './PathEditorPanel'
import './TimelineEditor.css'

interface TimelineEditorProps {
  videoUrl: string | null
  storylineId?: string
  /** Character ID for character-specific video editing */
  characterId?: string
  initialSegments?: TimelineSegment[]
  initialTransitions?: Transition[]
  onSegmentsChange?: (segments: TimelineSegment[]) => void
  onTransitionsChange?: (transitions: Transition[]) => void
  onSegmentDelete?: (segmentId: string) => void
  onFrameCapture?: (imageData: string) => void
  onGuidanceImageUpload?: (segmentId: string, file: File) => Promise<void>
  onGuidanceFrameCapture?: (segmentId: string, time: number) => Promise<void>
  onTimeUpdate?: (time: number) => void
  /** Whether changes are being saved */
  saving?: boolean
}

/**
 * Inner component that uses the timeline context
 */
function TimelineEditorInner({
  videoUrl,
  storylineId,
  characterId,
  onSegmentsChange,
  onTransitionsChange,
  onSegmentDelete,
  onFrameCapture,
  onGuidanceImageUpload,
  onGuidanceFrameCapture,
  onTimeUpdate,
  saving = false,
}: Omit<TimelineEditorProps, 'initialSegments' | 'initialTransitions'>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [previewDimensions, setPreviewDimensions] = useState({ width: 0, height: 0 })

  // Observe preview container size
  useEffect(() => {
    if (!previewContainerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setPreviewDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        })
      }
    })
    observer.observe(previewContainerRef.current)
    return () => observer.disconnect()
  }, [])
  
  // Path editing state
  const [pathTool, setPathTool] = useState<PathTool>('select')
  
  const {
    playhead,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    segments,
    transitions,
    addSegment,
    updateSegment,
    selectedSegmentId,
    selectedTransitionId,
    clearSelection,
  } = useTimelineEditor()
  
  // Get current segment and its path
  const selectedSegment = selectedSegmentId 
    ? segments.find(s => s.id === selectedSegmentId) 
    : null
  const currentPath = selectedSegment?.path || null
  
  // Handle path change - update segment in context
  const handlePathChange = useCallback((segmentId: string, path: SegmentPath) => {
    updateSegment(segmentId, { path })
  }, [updateSegment])

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

  // Notify parent when playhead changes
  useEffect(() => {
    if (onTimeUpdate) {
      onTimeUpdate(playhead)
    }
  }, [playhead, onTimeUpdate])

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
      {/* Video Preview Section with Path Editor Overlay */}
      <div className="timeline-editor__preview">
        <div className="timeline-editor__preview-container" ref={previewContainerRef}>
          <VideoPreview 
            videoUrl={videoUrl}
            onFrameCapture={onFrameCapture}
            videoElementRef={videoRef}
          />
          
          {/* Path Editor Overlay - only show when segment is selected */}
          {selectedSegmentId && (
            <PathEditor
              videoRef={videoRef}
              path={currentPath}
              onPathChange={(path) => handlePathChange(selectedSegmentId, path)}
              enabled={true}
              tool={pathTool}
              showPreview={false}
              previewProgress={0}
            />
          )}

          {/* Character Overlay (Requirements 11.6) - rendered after PathEditor to be on top */}
          {selectedSegment && characterId && (
            <CharacterOverlay
              characterId={characterId}
              segment={selectedSegment}
              playhead={playhead}
              containerWidth={previewDimensions.width}
              containerHeight={previewDimensions.height}
              onScaleChange={(config) => updateSegment(selectedSegment.id, { scale: config })}
              visible={true}
            />
          )}
        </div>
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
          
          {/* Zoom controls (Requirements 3.4) */}
          <div className="timeline-editor__zoom-controls">
            <button
              className="timeline-editor__zoom-btn"
              onClick={zoomOut}
              disabled={zoom <= 1}
              title="缩小 (Zoom Out)"
            >
              ➖
            </button>
            <input
              type="range"
              className="timeline-editor__zoom-slider"
              min={1}
              max={10}
              step={1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              title={`缩放级别: ${zoom}`}
            />
            <button
              className="timeline-editor__zoom-btn"
              onClick={zoomIn}
              disabled={zoom >= 10}
              title="放大 (Zoom In)"
            >
            ➕
            </button>
            <span className="timeline-editor__zoom-level">{zoom}x</span>
          </div>
          
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
            pathTool={pathTool}
            onPathToolChange={setPathTool}
            onPathChange={handlePathChange}
            saving={saving}
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
          <button
            className="timeline-editor__delete-btn"
            onClick={() => onSegmentDelete?.(selectedSegmentId)}
            title="删除选中的段落"
          >
            🗑️ 删除段落
          </button>
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
  onTimeUpdate,
  characterId,
  saving = false,
}: TimelineEditorProps) {
  return (
    <TimelineEditorProvider 
      initialSegments={initialSegments}
      initialTransitions={initialTransitions}
    >
      <TimelineEditorInner
        videoUrl={videoUrl}
        storylineId={storylineId}
        characterId={characterId}
        onSegmentsChange={onSegmentsChange}
        onTransitionsChange={onTransitionsChange}
        onSegmentDelete={onSegmentDelete}
        onFrameCapture={onFrameCapture}
        onGuidanceImageUpload={onGuidanceImageUpload}
        onGuidanceFrameCapture={onGuidanceFrameCapture}
        onTimeUpdate={onTimeUpdate}
        saving={saving}
      />
    </TimelineEditorProvider>
  )
}
