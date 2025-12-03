import { useState } from 'react'
import { useTimelineEditor, TimelineSegment, Transition, SegmentPath } from '../../contexts/TimelineEditorContext'
import AnimationConfigEditor from './AnimationConfigEditor'
import TransitionEditor from './TransitionEditor'
import GuidanceEditor from './GuidanceEditor'
import PathEditorPanel, { PathTool } from './PathEditorPanel'
import './PropertyPanel.css'

interface PropertyPanelProps {
  storylineId?: string
  onGuidanceImageUpload?: (segmentId: string, file: File) => Promise<void>
  onGuidanceFrameCapture?: (segmentId: string, time: number) => Promise<void>
  /** Current path editing tool */
  pathTool?: PathTool
  /** Callback when path tool changes */
  onPathToolChange?: (tool: PathTool) => void
  /** Callback when segment path changes */
  onPathChange?: (segmentId: string, path: SegmentPath) => void
  /** Whether changes are being saved */
  saving?: boolean
}

/**
 * PropertyPanel - Context-sensitive panel showing properties of selected segment or transition
 * Requirements: 4.4 - Show segment properties when selected
 */
export default function PropertyPanel({
  storylineId,
  onGuidanceImageUpload,
  onGuidanceFrameCapture,
  pathTool = 'select',
  onPathToolChange,
  onPathChange,
  saving = false,
}: PropertyPanelProps) {
  const [localPathTool, setLocalPathTool] = useState<PathTool>('select')
  
  const {
    selectedSegmentId,
    selectedTransitionId,
    segments,
    transitions,
    updateSegment,
    updateTransition,
    playhead,
  } = useTimelineEditor()
  
  const currentPathTool = onPathToolChange ? pathTool : localPathTool
  const handlePathToolChange = onPathToolChange || setLocalPathTool

  // Find selected segment
  const selectedSegment = selectedSegmentId
    ? segments.find(s => s.id === selectedSegmentId)
    : null

  // Get segment path or return default
  const getSegmentPath = (segment: TimelineSegment): SegmentPath => {
    if (segment.path) {
      return segment.path
    }
    // Default path
    return {
      startPoint: { x: 0.1, y: 0.5 },
      endPoint: { x: 0.9, y: 0.5 },
      waypoints: [],
      pathType: 'linear',
    }
  }

  // Find selected transition
  const selectedTransition = selectedTransitionId
    ? transitions.find(t => t.id === selectedTransitionId)
    : null

  // Handle segment update
  const handleSegmentUpdate = (updates: Partial<TimelineSegment>) => {
    if (selectedSegmentId) {
      updateSegment(selectedSegmentId, updates)
    }
  }

  // Handle transition update
  const handleTransitionUpdate = (updates: Partial<Transition>) => {
    if (selectedTransitionId) {
      updateTransition(selectedTransitionId, updates)
    }
  }

  // Handle guidance image upload
  const handleGuidanceImageUpload = async (file: File) => {
    if (selectedSegmentId && onGuidanceImageUpload) {
      await onGuidanceImageUpload(selectedSegmentId, file)
    }
  }

  // Handle guidance frame capture
  const handleGuidanceFrameCapture = async () => {
    if (selectedSegmentId && onGuidanceFrameCapture) {
      await onGuidanceFrameCapture(selectedSegmentId, playhead)
    }
  }

  // No selection - show placeholder
  if (!selectedSegment && !selectedTransition) {
    return (
      <div className="property-panel property-panel--empty">
        <div className="property-panel__placeholder">
          <span className="property-panel__placeholder-icon">📋</span>
          <p className="property-panel__placeholder-text">
            选择一个段落或转场来编辑属性
          </p>
          <p className="property-panel__placeholder-hint">
            Select a segment or transition to edit properties
          </p>
        </div>
      </div>
    )
  }

  // Show segment properties
  if (selectedSegment) {
    return (
      <div className="property-panel">
        <div className="property-panel__header">
          <h3 className="property-panel__title">
            段落 {selectedSegment.index + 1} 属性
          </h3>
          <span className="property-panel__subtitle">
            Segment {selectedSegment.index + 1} Properties
          </span>
        </div>

        <div className="property-panel__content">
          {/* Timing info */}
          <div className="property-panel__section">
            <h4 className="property-panel__section-title">时间信息 / Timing</h4>
            <div className="property-panel__info-grid">
              <div className="property-panel__info-item">
                <span className="property-panel__info-label">开始时间</span>
                <span className="property-panel__info-value">
                  {(selectedSegment.startTime ?? 0).toFixed(2)}s
                </span>
              </div>
              <div className="property-panel__info-item">
                <span className="property-panel__info-label">持续时间</span>
                <span className="property-panel__info-value">
                  {(selectedSegment.duration ?? 0).toFixed(2)}s
                </span>
              </div>
            </div>
          </div>

          {/* Entry Animation */}
          <div className="property-panel__section">
            <h4 className="property-panel__section-title">进入动画 / Entry Animation</h4>
            <AnimationConfigEditor
              config={selectedSegment.entryAnimation}
              isEntry={true}
              onChange={(config) => handleSegmentUpdate({ entryAnimation: config })}
            />
          </div>

          {/* Exit Animation */}
          <div className="property-panel__section">
            <h4 className="property-panel__section-title">退出动画 / Exit Animation</h4>
            <AnimationConfigEditor
              config={selectedSegment.exitAnimation}
              isEntry={false}
              onChange={(config) => handleSegmentUpdate({ exitAnimation: config })}
            />
          </div>

          {/* Movement Path */}
          <div className="property-panel__section">
            <h4 className="property-panel__section-title">移动路径 / Movement Path</h4>
            <PathEditorPanel
              path={getSegmentPath(selectedSegment)}
              onPathChange={(path) => {
                if (onPathChange && selectedSegmentId) {
                  onPathChange(selectedSegmentId, path)
                }
              }}
              tool={currentPathTool}
              onToolChange={handlePathToolChange}
              enabled={true}
              saving={saving}
            />
          </div>

          {/* Guidance */}
          <div className="property-panel__section">
            <h4 className="property-panel__section-title">引导内容 / Guidance</h4>
            <GuidanceEditor
              guidanceText={selectedSegment.guidanceText}
              guidanceTextEn={selectedSegment.guidanceTextEn}
              guidanceImage={selectedSegment.guidanceImage}
              storylineId={storylineId}
              segmentId={selectedSegmentId!}
              onTextChange={(text, textEn) => handleSegmentUpdate({
                guidanceText: text,
                guidanceTextEn: textEn,
              })}
              onImageUpload={handleGuidanceImageUpload}
              onFrameCapture={handleGuidanceFrameCapture}
            />
          </div>

          {/* Recording Audio */}
          <div className="property-panel__section">
            <h4 className="property-panel__section-title">录制设置 / Recording Settings</h4>
            <label className="property-panel__checkbox">
              <input
                type="checkbox"
                checked={selectedSegment.playAudio || false}
                onChange={(e) => handleSegmentUpdate({ playAudio: e.target.checked })}
              />
              <span>录制时播放音频 / Play audio during recording</span>
            </label>
          </div>
        </div>
      </div>
    )
  }

  // Show transition properties
  if (selectedTransition) {
    return (
      <div className="property-panel">
        <div className="property-panel__header">
          <h3 className="property-panel__title">
            转场效果
          </h3>
          <span className="property-panel__subtitle">
            Transition from Segment {selectedTransition.fromSegmentIndex + 1} to {selectedTransition.toSegmentIndex + 1}
          </span>
        </div>

        <div className="property-panel__content">
          <div className="property-panel__section">
            <TransitionEditor
              transition={selectedTransition}
              onChange={handleTransitionUpdate}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}
