import { useCallback, MouseEvent } from 'react'
import { Transition, TransitionType } from '../../contexts/TimelineEditorContext'
import './TransitionZone.css'

interface TransitionZoneProps {
  transition: Transition
  leftPosition: number  // Position in pixels from left
  isSelected: boolean
  onSelect: () => void
}

// Transition type display labels
const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: '切换',
  crossfade: '交叉淡化',
  fade_to_black: '黑场过渡',
  wipe_left: '左擦除',
  wipe_right: '右擦除',
}

// Transition type icons
const TRANSITION_ICONS: Record<TransitionType, string> = {
  cut: '✂️',
  crossfade: '🔀',
  fade_to_black: '⬛',
  wipe_left: '◀️',
  wipe_right: '▶️',
}

/**
 * TransitionZone component - displays transition indicator between segments
 * Requirements 6.1: Display transition zones between adjacent segments
 */
export default function TransitionZone({
  transition,
  leftPosition,
  isSelected,
  onSelect,
}: TransitionZoneProps) {
  // Handle click to select transition for editing
  const handleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    onSelect()
  }, [onSelect])

  return (
    <div
      className={`transition-zone ${isSelected ? 'transition-zone--selected' : ''}`}
      style={{ left: `${leftPosition}px` }}
      onClick={handleClick}
      title={`${TRANSITION_LABELS[transition.type]} (${transition.duration}s) - 点击编辑`}
    >
      <div className="transition-zone__indicator">
        <span className="transition-zone__icon">
          {TRANSITION_ICONS[transition.type]}
        </span>
      </div>
      <div className="transition-zone__label">
        {TRANSITION_LABELS[transition.type]}
      </div>
    </div>
  )
}
