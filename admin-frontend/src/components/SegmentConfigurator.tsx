import { useState, useEffect } from 'react'
import './SegmentConfigurator.css'

interface Segment {
  index: number
  duration: number
  path_type: string
  offset_start: number[]
  offset_end: number[]
  guidance_text: string
  guidance_text_en: string
  guidance_image: string | null
}

interface SegmentConfiguratorProps {
  segments: Segment[]
  videoDuration: number
  onSave: (segments: Segment[]) => Promise<void>
  saving: boolean
}

const PATH_TYPES = [
  { value: 'static', label: '静止', labelEn: 'Static' },
  { value: 'enter_left', label: '从左进入', labelEn: 'Enter from left' },
  { value: 'enter_right', label: '从右进入', labelEn: 'Enter from right' },
  { value: 'enter_center', label: '从中间进入', labelEn: 'Enter from center' },
  { value: 'exit_left', label: '向左退出', labelEn: 'Exit to left' },
  { value: 'exit_right', label: '向右退出', labelEn: 'Exit to right' },
  { value: 'exit_down', label: '向下退出', labelEn: 'Exit down' },
  { value: 'walk_left', label: '向左移动', labelEn: 'Walk left' },
  { value: 'walk_right', label: '向右移动', labelEn: 'Walk right' },
]

const createDefaultSegment = (index: number): Segment => ({
  index,
  duration: 10,
  path_type: 'static',
  offset_start: [0, 0],
  offset_end: [0, 0],
  guidance_text: '',
  guidance_text_en: '',
  guidance_image: null,
})

export default function SegmentConfigurator({
  segments: initialSegments,
  videoDuration,
  onSave,
  saving,
}: SegmentConfiguratorProps) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    setSegments(initialSegments)
  }, [initialSegments])

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0)
  const isOverDuration = totalDuration > videoDuration

  const handleSegmentCountChange = (count: number) => {
    if (count < 2 || count > 4) return

    const newSegments = [...segments]
    
    if (count > segments.length) {
      // Add segments
      for (let i = segments.length; i < count; i++) {
        newSegments.push(createDefaultSegment(i))
      }
    } else {
      // Remove segments
      newSegments.splice(count)
    }

    // Re-index segments
    newSegments.forEach((seg, idx) => {
      seg.index = idx
    })

    setSegments(newSegments)
    setValidationError(null)
  }

  const handleSegmentChange = (index: number, field: keyof Segment, value: unknown) => {
    const newSegments = [...segments]
    const segment = { ...newSegments[index] }

    if (field === 'duration') {
      segment.duration = Math.max(1, Number(value))
    } else if (field === 'offset_start' || field === 'offset_end') {
      segment[field] = value as number[]
    } else {
      (segment as Record<string, unknown>)[field] = value
    }

    newSegments[index] = segment
    setSegments(newSegments)
    setValidationError(null)
  }

  const handleOffsetChange = (
    segmentIndex: number,
    field: 'offset_start' | 'offset_end',
    axis: 0 | 1,
    value: number
  ) => {
    const newSegments = [...segments]
    const segment = { ...newSegments[segmentIndex] }
    const offset = [...segment[field]]
    offset[axis] = value
    segment[field] = offset
    newSegments[segmentIndex] = segment
    setSegments(newSegments)
  }

  const handleSave = async () => {
    // Validate total duration
    if (isOverDuration) {
      setValidationError(`段落总时长 (${totalDuration}秒) 超过视频时长 (${Math.floor(videoDuration)}秒)`)
      return
    }

    // Validate each segment has duration > 0
    for (const seg of segments) {
      if (seg.duration <= 0) {
        setValidationError(`段落 ${seg.index + 1} 的时长必须大于 0`)
        return
      }
    }

    setValidationError(null)
    await onSave(segments)
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
  }

  return (
    <div className="segment-configurator">
      {/* Segment Count Control */}
      <div className="segment-count-control">
        <label>段落数量:</label>
        <div className="count-buttons">
          {[2, 3, 4].map((count) => (
            <button
              key={count}
              className={`count-btn ${segments.length === count ? 'active' : ''}`}
              onClick={() => handleSegmentCountChange(count)}
            >
              {count} 段
            </button>
          ))}
        </div>
      </div>

      {/* Duration Summary */}
      <div className={`duration-summary ${isOverDuration ? 'error' : ''}`}>
        <span>总时长: {formatDuration(totalDuration)}</span>
        <span className="separator">/</span>
        <span>视频时长: {formatDuration(videoDuration)}</span>
        {isOverDuration && (
          <span className="warning-icon">⚠️ 超出视频时长</span>
        )}
      </div>

      {validationError && (
        <div className="validation-error">
          {validationError}
        </div>
      )}

      {/* Segment List */}
      <div className="segment-list">
        {segments.map((segment, idx) => (
          <div key={idx} className="segment-item">
            <div className="segment-header">
              <h4>段落 {idx + 1}</h4>
            </div>

            <div className="segment-form">
              <div className="form-row">
                <div className="form-field">
                  <label>时长 (秒)</label>
                  <input
                    type="number"
                    min="1"
                    max={videoDuration}
                    value={segment.duration}
                    onChange={(e) => handleSegmentChange(idx, 'duration', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>移动路径</label>
                  <select
                    value={segment.path_type}
                    onChange={(e) => handleSegmentChange(idx, 'path_type', e.target.value)}
                  >
                    {PATH_TYPES.map((pt) => (
                      <option key={pt.value} value={pt.value}>
                        {pt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-field offset-field">
                  <label>起始偏移 (X, Y)</label>
                  <div className="offset-inputs">
                    <input
                      type="number"
                      value={segment.offset_start[0]}
                      onChange={(e) => handleOffsetChange(idx, 'offset_start', 0, Number(e.target.value))}
                      placeholder="X"
                    />
                    <input
                      type="number"
                      value={segment.offset_start[1]}
                      onChange={(e) => handleOffsetChange(idx, 'offset_start', 1, Number(e.target.value))}
                      placeholder="Y"
                    />
                  </div>
                </div>
                <div className="form-field offset-field">
                  <label>结束偏移 (X, Y)</label>
                  <div className="offset-inputs">
                    <input
                      type="number"
                      value={segment.offset_end[0]}
                      onChange={(e) => handleOffsetChange(idx, 'offset_end', 0, Number(e.target.value))}
                      placeholder="X"
                    />
                    <input
                      type="number"
                      value={segment.offset_end[1]}
                      onChange={(e) => handleOffsetChange(idx, 'offset_end', 1, Number(e.target.value))}
                      placeholder="Y"
                    />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-field full-width">
                  <label>引导文字 (中文)</label>
                  <input
                    type="text"
                    value={segment.guidance_text}
                    onChange={(e) => handleSegmentChange(idx, 'guidance_text', e.target.value)}
                    placeholder="例如: 摆出武术起势"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field full-width">
                  <label>引导文字 (英文)</label>
                  <input
                    type="text"
                    value={segment.guidance_text_en}
                    onChange={(e) => handleSegmentChange(idx, 'guidance_text_en', e.target.value)}
                    placeholder="e.g., Strike a martial arts opening stance"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div className="configurator-actions">
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || isOverDuration}
        >
          {saving ? '保存中...' : '保存段落配置'}
        </button>
      </div>
    </div>
  )
}
