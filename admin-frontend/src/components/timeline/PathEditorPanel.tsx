/**
 * PathEditorPanel Component
 * 
 * Panel for editing segment movement path with visual controls.
 */
import { useCallback } from 'react'
import { SegmentPath } from '../../contexts/TimelineEditorContext'
import './PathEditor.css'

export type PathTool = 'select' | 'pencil' | 'line'

interface PathEditorPanelProps {
  /** Current path data */
  path: SegmentPath | null
  /** Callback when path changes */
  onPathChange: (path: SegmentPath) => void
  /** Current tool */
  tool: PathTool
  /** Callback when tool changes */
  onToolChange: (tool: PathTool) => void
  /** Whether editing is enabled */
  enabled?: boolean
}

const DEFAULT_PATH: SegmentPath = {
  startPoint: { x: 0.1, y: 0.5 },
  endPoint: { x: 0.9, y: 0.5 },
  waypoints: [],
  pathType: 'linear',
}

export default function PathEditorPanel({
  path,
  onPathChange,
  tool,
  onToolChange,
  enabled = true,
}: PathEditorPanelProps) {
  const activePath = path || DEFAULT_PATH

  const handleClearPath = useCallback(() => {
    onPathChange(DEFAULT_PATH)
  }, [onPathChange])

  const handleStartPointChange = useCallback((axis: 'x' | 'y', value: number) => {
    const newPath = { ...activePath }
    newPath.startPoint = { ...newPath.startPoint, [axis]: value / 100 }
    onPathChange(newPath)
  }, [activePath, onPathChange])

  const handleEndPointChange = useCallback((axis: 'x' | 'y', value: number) => {
    const newPath = { ...activePath }
    newPath.endPoint = { ...newPath.endPoint, [axis]: value / 100 }
    onPathChange(newPath)
  }, [activePath, onPathChange])

  const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`

  return (
    <div className="path-editor-panel">
      {/* Tool selection */}
      <div className="path-editor-panel__tools">
        <span className="path-editor-panel__label">绘制工具:</span>
        <div className="path-editor-panel__tool-buttons">
          <button
            className={`path-tool-btn ${tool === 'select' ? 'path-tool-btn--active' : ''}`}
            onClick={() => onToolChange('select')}
            disabled={!enabled}
            title="选择/移动控制点"
          >
            ✋ 选择
          </button>
          <button
            className={`path-tool-btn ${tool === 'line' ? 'path-tool-btn--active' : ''}`}
            onClick={() => onToolChange('line')}
            disabled={!enabled}
            title="直线路径"
          >
            📏 直线
          </button>
          <button
            className={`path-tool-btn ${tool === 'pencil' ? 'path-tool-btn--active' : ''}`}
            onClick={() => onToolChange('pencil')}
            disabled={!enabled}
            title="铅笔工具 - 自由绘制路径"
          >
            ✏️ 铅笔
          </button>
        </div>
      </div>

      {/* Start point controls */}
      <div className="path-editor-panel__point-section">
        <div className="path-editor-panel__point-header">
          <span className="path-editor-panel__point-marker path-editor-panel__point-marker--start">S</span>
          <span className="path-editor-panel__point-label">起点位置</span>
        </div>
        <div className="path-editor-panel__point-controls">
          <div className="path-editor-panel__coord">
            <label>X:</label>
            <input
              type="range"
              min={0}
              max={100}
              value={activePath.startPoint.x * 100}
              onChange={(e) => handleStartPointChange('x', parseInt(e.target.value))}
              disabled={!enabled}
            />
            <span className="path-editor-panel__coord-value">
              {formatPercent(activePath.startPoint.x)}
            </span>
          </div>
          <div className="path-editor-panel__coord">
            <label>Y:</label>
            <input
              type="range"
              min={0}
              max={100}
              value={activePath.startPoint.y * 100}
              onChange={(e) => handleStartPointChange('y', parseInt(e.target.value))}
              disabled={!enabled}
            />
            <span className="path-editor-panel__coord-value">
              {formatPercent(activePath.startPoint.y)}
            </span>
          </div>
        </div>
      </div>

      {/* End point controls */}
      <div className="path-editor-panel__point-section">
        <div className="path-editor-panel__point-header">
          <span className="path-editor-panel__point-marker path-editor-panel__point-marker--end">E</span>
          <span className="path-editor-panel__point-label">终点位置</span>
        </div>
        <div className="path-editor-panel__point-controls">
          <div className="path-editor-panel__coord">
            <label>X:</label>
            <input
              type="range"
              min={0}
              max={100}
              value={activePath.endPoint.x * 100}
              onChange={(e) => handleEndPointChange('x', parseInt(e.target.value))}
              disabled={!enabled}
            />
            <span className="path-editor-panel__coord-value">
              {formatPercent(activePath.endPoint.x)}
            </span>
          </div>
          <div className="path-editor-panel__coord">
            <label>Y:</label>
            <input
              type="range"
              min={0}
              max={100}
              value={activePath.endPoint.y * 100}
              onChange={(e) => handleEndPointChange('y', parseInt(e.target.value))}
              disabled={!enabled}
            />
            <span className="path-editor-panel__coord-value">
              {formatPercent(activePath.endPoint.y)}
            </span>
          </div>
        </div>
      </div>

      {/* Path info */}
      {activePath.waypoints.length > 0 && (
        <div className="path-editor-panel__info">
          <span>路径点数: {activePath.waypoints.length}</span>
          <span>类型: {activePath.pathType === 'freehand' ? '手绘' : '直线'}</span>
        </div>
      )}

      {/* Actions */}
      <div className="path-editor-panel__actions">
        <button
          className="path-editor-panel__clear-btn"
          onClick={handleClearPath}
          disabled={!enabled}
        >
          🗑️ 重置路径
        </button>
      </div>

      {/* Help text */}
      <div className="path-editor-panel__help">
        <p>💡 提示: 在视频预览区域上绘制角色移动路径</p>
        <ul>
          <li><strong>选择工具</strong>: 拖动绿色(起点)或红色(终点)控制点</li>
          <li><strong>直线工具</strong>: 点击设置起点，拖动到终点</li>
          <li><strong>铅笔工具</strong>: 自由绘制曲线路径</li>
        </ul>
      </div>
    </div>
  )
}
