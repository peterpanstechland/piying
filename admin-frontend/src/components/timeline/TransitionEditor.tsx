import { Transition, TransitionType } from '../../contexts/TimelineEditorContext'
import './TransitionEditor.css'

interface TransitionEditorProps {
  transition: Transition
  onChange: (updates: Partial<Transition>) => void
}

// Transition type options with labels
const TRANSITION_TYPES: { value: TransitionType; label: string; labelEn: string; icon: string }[] = [
  { value: 'cut', label: '直接切换', labelEn: 'Cut', icon: '✂️' },
  { value: 'crossfade', label: '交叉淡化', labelEn: 'Crossfade', icon: '🔀' },
  { value: 'fade_to_black', label: '淡入黑场', labelEn: 'Fade to Black', icon: '⬛' },
  { value: 'wipe_left', label: '向左擦除', labelEn: 'Wipe Left', icon: '◀️' },
  { value: 'wipe_right', label: '向右擦除', labelEn: 'Wipe Right', icon: '▶️' },
]

/**
 * TransitionEditor - Editor for transition effects between segments
 * Requirements: 6.2, 6.3 - Configure transition type and duration
 */
export default function TransitionEditor({
  transition,
  onChange,
}: TransitionEditorProps) {
  // Handle type change
  const handleTypeChange = (type: TransitionType) => {
    onChange({ type })
  }

  // Handle duration change
  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value)) {
      onChange({
        duration: Math.max(0.1, Math.min(3, value)),
      })
    }
  }

  return (
    <div className="transition-editor">
      {/* Transition Type Selection */}
      <div className="transition-editor__field">
        <label className="transition-editor__label">
          转场类型
          <span className="transition-editor__label-en">Transition Type</span>
        </label>
        <div className="transition-editor__type-grid">
          {TRANSITION_TYPES.map(({ value, label, labelEn, icon }) => (
            <button
              key={value}
              className={`transition-editor__type-btn ${
                transition.type === value ? 'transition-editor__type-btn--active' : ''
              }`}
              onClick={() => handleTypeChange(value)}
              title={`${label} (${labelEn})`}
            >
              <span className="transition-editor__type-icon">{icon}</span>
              <span className="transition-editor__type-label">{label}</span>
              <span className="transition-editor__type-label-en">{labelEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Duration Slider - Only show if not cut */}
      {transition.type !== 'cut' && (
        <div className="transition-editor__field">
          <label className="transition-editor__label">
            转场时长
            <span className="transition-editor__label-en">Duration</span>
          </label>
          <div className="transition-editor__slider-group">
            <input
              type="range"
              className="transition-editor__slider"
              min="0.1"
              max="3"
              step="0.1"
              value={transition.duration}
              onChange={handleDurationChange}
            />
            <input
              type="number"
              className="transition-editor__number"
              min="0.1"
              max="3"
              step="0.1"
              value={transition.duration}
              onChange={handleDurationChange}
            />
            <span className="transition-editor__unit">秒</span>
          </div>
          <div className="transition-editor__hint">
            0.1 - 3.0 秒 / seconds
          </div>
        </div>
      )}

      {/* Preview hint */}
      <div className="transition-editor__preview-hint">
        <span className="transition-editor__preview-icon">💡</span>
        <span className="transition-editor__preview-text">
          转场效果将在段落之间自动应用
          <br />
          <span className="transition-editor__preview-text-en">
            Transition will be applied automatically between segments
          </span>
        </span>
      </div>
    </div>
  )
}
