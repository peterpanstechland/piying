import { AnimationConfig, AnimationType } from '../../contexts/TimelineEditorContext'
import './AnimationConfigEditor.css'

interface AnimationConfigEditorProps {
  config: AnimationConfig
  isEntry: boolean
  onChange: (config: AnimationConfig) => void
}

// Animation type options with labels
const ENTRY_ANIMATION_TYPES: { value: AnimationType; label: string; labelEn: string }[] = [
  { value: 'instant', label: '立即出现', labelEn: 'Instant' },
  { value: 'fade_in', label: '淡入', labelEn: 'Fade In' },
  { value: 'slide_left', label: '从左滑入', labelEn: 'Slide from Left' },
  { value: 'slide_right', label: '从右滑入', labelEn: 'Slide from Right' },
  { value: 'slide_up', label: '从下滑入', labelEn: 'Slide from Bottom' },
  { value: 'slide_down', label: '从上滑入', labelEn: 'Slide from Top' },
]

const EXIT_ANIMATION_TYPES: { value: AnimationType; label: string; labelEn: string }[] = [
  { value: 'instant', label: '立即消失', labelEn: 'Instant' },
  { value: 'fade_out', label: '淡出', labelEn: 'Fade Out' },
  { value: 'slide_left', label: '向左滑出', labelEn: 'Slide to Left' },
  { value: 'slide_right', label: '向右滑出', labelEn: 'Slide to Right' },
  { value: 'slide_up', label: '向上滑出', labelEn: 'Slide to Top' },
  { value: 'slide_down', label: '向下滑出', labelEn: 'Slide to Bottom' },
]

/**
 * AnimationConfigEditor - Editor for entry/exit animation configuration
 * Requirements: 5.1, 5.2, 5.3, 5.4 - Configure character entry/exit animations
 */
export default function AnimationConfigEditor({
  config,
  isEntry,
  onChange,
}: AnimationConfigEditorProps) {
  const animationTypes = isEntry ? ENTRY_ANIMATION_TYPES : EXIT_ANIMATION_TYPES

  // Handle type change
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...config,
      type: e.target.value as AnimationType,
    })
  }

  // Handle duration change
  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value)) {
      onChange({
        ...config,
        duration: Math.max(0.5, Math.min(5, value)),
      })
    }
  }

  // Handle delay change
  const handleDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value)) {
      onChange({
        ...config,
        delay: Math.max(0, value),
      })
    }
  }

  return (
    <div className="animation-config-editor">
      {/* Animation Type Dropdown */}
      <div className="animation-config-editor__field">
        <label className="animation-config-editor__label">
          {isEntry ? '进入方式' : '退出方式'}
          <span className="animation-config-editor__label-en">
            {isEntry ? 'Entry Type' : 'Exit Type'}
          </span>
        </label>
        <select
          className="animation-config-editor__select"
          value={config.type}
          onChange={handleTypeChange}
        >
          {animationTypes.map(({ value, label, labelEn }) => (
            <option key={value} value={value}>
              {label} ({labelEn})
            </option>
          ))}
        </select>
      </div>

      {/* Duration Slider - Only show if not instant */}
      {config.type !== 'instant' && (
        <div className="animation-config-editor__field">
          <label className="animation-config-editor__label">
            持续时间
            <span className="animation-config-editor__label-en">Duration</span>
          </label>
          <div className="animation-config-editor__slider-group">
            <input
              type="range"
              className="animation-config-editor__slider"
              min="0.5"
              max="5"
              step="0.1"
              value={config.duration}
              onChange={handleDurationChange}
            />
            <input
              type="number"
              className="animation-config-editor__number"
              min="0.5"
              max="5"
              step="0.1"
              value={config.duration}
              onChange={handleDurationChange}
            />
            <span className="animation-config-editor__unit">秒</span>
          </div>
          <div className="animation-config-editor__hint">
            0.5 - 5.0 秒 / seconds
          </div>
        </div>
      )}

      {/* Delay Input */}
      <div className="animation-config-editor__field">
        <label className="animation-config-editor__label">
          {isEntry ? '延迟开始' : '提前结束'}
          <span className="animation-config-editor__label-en">
            {isEntry ? 'Delay from Start' : 'Time before End'}
          </span>
        </label>
        <div className="animation-config-editor__input-group">
          <input
            type="number"
            className="animation-config-editor__input"
            min="0"
            step="0.1"
            value={config.delay}
            onChange={handleDelayChange}
          />
          <span className="animation-config-editor__unit">秒</span>
        </div>
        <div className="animation-config-editor__hint">
          {isEntry 
            ? '角色在段落开始后多久进入 / Delay before character enters'
            : '角色在段落结束前多久退出 / Time before segment ends to exit'
          }
        </div>
      </div>
    </div>
  )
}
