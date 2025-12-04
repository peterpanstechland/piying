import { ScaleConfig } from '../../contexts/TimelineEditorContext'
import './ScaleConfigEditor.css'

interface ScaleConfigEditorProps {
  config: ScaleConfig
  onChange: (config: ScaleConfig) => void
}

/**
 * ScaleConfigEditor - Editor for puppet scale configuration
 * 
 * Modes:
 * - auto: MediaPipe auto-detects body size and adjusts scale
 * - manual: User controls scale with start/end values for animation
 */
export default function ScaleConfigEditor({ config, onChange }: ScaleConfigEditorProps) {
  const handleModeChange = (mode: 'auto' | 'manual') => {
    onChange({
      ...config,
      mode,
      // Reset to default values when switching to manual
      start: mode === 'manual' ? (config.start || 1.0) : 1.0,
      end: mode === 'manual' ? (config.end || 1.0) : 1.0,
    })
  }

  const handleStartChange = (value: number) => {
    onChange({ ...config, start: value })
  }

  const handleEndChange = (value: number) => {
    onChange({ ...config, end: value })
  }

  // Preset scale animations
  const applyPreset = (preset: 'fixed' | 'grow' | 'shrink') => {
    switch (preset) {
      case 'fixed':
        onChange({ ...config, start: 1.0, end: 1.0 })
        break
      case 'grow':
        onChange({ ...config, start: 0.5, end: 1.2 })
        break
      case 'shrink':
        onChange({ ...config, start: 1.2, end: 0.5 })
        break
    }
  }

  return (
    <div className="scale-config-editor">
      {/* Mode Selection */}
      <div className="scale-config-editor__mode">
        <label className="scale-config-editor__mode-label">
          缩放模式 / Scale Mode
        </label>
        <div className="scale-config-editor__mode-options">
          <label className="scale-config-editor__radio">
            <input
              type="radio"
              name="scaleMode"
              checked={config.mode === 'auto'}
              onChange={() => handleModeChange('auto')}
            />
            <span className="scale-config-editor__radio-label">
              <strong>自动</strong> (Auto)
              <small>根据动捕检测自动调整</small>
            </span>
          </label>
          <label className="scale-config-editor__radio">
            <input
              type="radio"
              name="scaleMode"
              checked={config.mode === 'manual'}
              onChange={() => handleModeChange('manual')}
            />
            <span className="scale-config-editor__radio-label">
              <strong>手动</strong> (Manual)
              <small>手动设置缩放比例</small>
            </span>
          </label>
        </div>
      </div>

      {/* Manual Mode Controls */}
      {config.mode === 'manual' && (
        <div className="scale-config-editor__manual">
          {/* Preset Buttons */}
          <div className="scale-config-editor__presets">
            <span className="scale-config-editor__presets-label">预设 / Presets:</span>
            <button
              type="button"
              className="scale-config-editor__preset-btn"
              onClick={() => applyPreset('fixed')}
              title="Fixed size (1.0x)"
            >
              固定
            </button>
            <button
              type="button"
              className="scale-config-editor__preset-btn"
              onClick={() => applyPreset('grow')}
              title="Grow from 0.5x to 1.2x"
            >
              由小变大
            </button>
            <button
              type="button"
              className="scale-config-editor__preset-btn"
              onClick={() => applyPreset('shrink')}
              title="Shrink from 1.2x to 0.5x"
            >
              由大变小
            </button>
          </div>

          {/* Start Scale */}
          <div className="scale-config-editor__slider-group">
            <label className="scale-config-editor__slider-label">
              起始缩放 / Start Scale: <strong>{config.start.toFixed(2)}x</strong>
            </label>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.05"
              value={config.start}
              onChange={(e) => handleStartChange(parseFloat(e.target.value))}
              className="scale-config-editor__slider"
            />
            <div className="scale-config-editor__slider-hints">
              <span>0.2x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
          </div>

          {/* End Scale */}
          <div className="scale-config-editor__slider-group">
            <label className="scale-config-editor__slider-label">
              结束缩放 / End Scale: <strong>{config.end.toFixed(2)}x</strong>
            </label>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.05"
              value={config.end}
              onChange={(e) => handleEndChange(parseFloat(e.target.value))}
              className="scale-config-editor__slider"
            />
            <div className="scale-config-editor__slider-hints">
              <span>0.2x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
          </div>

          {/* Visual Preview */}
          <div className="scale-config-editor__preview">
            <div className="scale-config-editor__preview-label">预览 Preview</div>
            <div className="scale-config-editor__preview-container">
              <div 
                className="scale-config-editor__preview-puppet"
                style={{ transform: `scale(${config.start * 0.8})` }}
              >
                {config.start.toFixed(1)}x
              </div>
              <div className="scale-config-editor__preview-arrow">→</div>
              <div 
                className="scale-config-editor__preview-puppet"
                style={{ transform: `scale(${config.end * 0.8})` }}
              >
                {config.end.toFixed(1)}x
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto Mode Info */}
      {config.mode === 'auto' && (
        <div className="scale-config-editor__auto-info">
          <div className="scale-config-editor__auto-info-icon">📏</div>
          <p>
            皮影大小将根据动捕检测的人物距离自动调整。
            <br />
            <small>Scale will automatically adjust based on detected body size from motion capture.</small>
          </p>
        </div>
      )}
    </div>
  )
}

