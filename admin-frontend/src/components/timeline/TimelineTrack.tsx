import { useRef, useCallback, useEffect, useState, MouseEvent, useMemo } from 'react'
import { useTimelineEditor, TimelineSegment, Transition, createDefaultTransition } from '../../contexts/TimelineEditorContext'
import SegmentBlock from './SegmentBlock'
import TransitionZone from './TransitionZone'
import './TimelineTrack.css'

interface TimelineTrackProps {
  onSegmentChange?: (segment: TimelineSegment) => void
  onTransitionChange?: (transition: Transition) => void
  onPlayheadDrag?: (time: number) => void
  snapToSegments?: boolean
}

// Pixels per second at zoom level 1
const BASE_PIXELS_PER_SECOND = 20

// Snap threshold in pixels
const SNAP_THRESHOLD_PX = 10

export default function TimelineTrack({ 
  onSegmentChange,
  onTransitionChange: _onTransitionChange,  // Available for future use
  onPlayheadDrag,
  snapToSegments = true 
}: TimelineTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false)
  const [isSnapped, setIsSnapped] = useState(false)
  
  // Suppress unused variable warning
  void _onTransitionChange
  
  const {
    playhead,
    setPlayhead,
    zoom,
    videoDuration,
    segments,
    transitions,
    setTransitions,
    selectedSegmentId,
    selectedTransitionId,
    selectSegment,
    selectTransition,
    updateSegment,
  } = useTimelineEditor()

  // Calculate pixels per second based on zoom level
  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * zoom

  // Calculate total track width
  const trackWidth = Math.max(videoDuration * pixelsPerSecond, 800)

  // Convert time to pixel position
  const timeToPixel = useCallback((time: number): number => {
    return time * pixelsPerSecond
  }, [pixelsPerSecond])

  // Convert pixel position to time
  const pixelToTime = useCallback((pixel: number): number => {
    return Math.max(0, Math.min(pixel / pixelsPerSecond, videoDuration))
  }, [pixelsPerSecond, videoDuration])

  // Get snap points from segments (start and end times)
  const getSnapPoints = useCallback((): number[] => {
    const points: number[] = [0, videoDuration] // Always snap to start and end
    segments.forEach(segment => {
      points.push(segment.startTime)
      points.push(segment.startTime + segment.duration)
    })
    return [...new Set(points)].sort((a, b) => a - b)
  }, [segments, videoDuration])

  // Snap time to nearest segment boundary if within threshold
  const snapTime = useCallback((time: number): { time: number; snapped: boolean } => {
    if (!snapToSegments) return { time, snapped: false }
    
    const snapPoints = getSnapPoints()
    const snapThresholdTime = SNAP_THRESHOLD_PX / pixelsPerSecond
    
    for (const point of snapPoints) {
      if (Math.abs(time - point) <= snapThresholdTime) {
        return { time: point, snapped: true }
      }
    }
    return { time, snapped: false }
  }, [snapToSegments, getSnapPoints, pixelsPerSecond])

  // Generate time markers
  const generateTimeMarkers = useCallback(() => {
    const markers: { time: number; label: string; isMajor: boolean }[] = []
    
    // Determine interval based on zoom level
    let majorInterval: number
    let minorInterval: number
    
    if (zoom <= 2) {
      majorInterval = 30 // 30 seconds
      minorInterval = 10
    } else if (zoom <= 4) {
      majorInterval = 10 // 10 seconds
      minorInterval = 5
    } else if (zoom <= 6) {
      majorInterval = 5 // 5 seconds
      minorInterval = 1
    } else {
      majorInterval = 2 // 2 seconds
      minorInterval = 0.5
    }

    for (let t = 0; t <= videoDuration; t += minorInterval) {
      const isMajor = t % majorInterval === 0
      markers.push({
        time: t,
        label: formatTimeLabel(t),
        isMajor,
      })
    }

    return markers
  }, [zoom, videoDuration])

  // Format time label
  const formatTimeLabel = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Handle click on timeline to move playhead
  const handleTrackClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return
    
    const rect = trackRef.current.getBoundingClientRect()
    const scrollLeft = trackRef.current.scrollLeft
    const clickX = e.clientX - rect.left + scrollLeft
    const rawTime = pixelToTime(clickX)
    const { time: newTime, snapped } = snapTime(rawTime)
    
    setPlayhead(newTime)
    setIsSnapped(snapped)
    
    // Clear snap indicator after a short delay
    setTimeout(() => setIsSnapped(false), 200)
  }, [pixelToTime, snapTime, setPlayhead])

  // Handle playhead drag start
  const handlePlayheadMouseDown = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    setIsDraggingPlayhead(true)
  }, [])

  // Handle playhead drag
  useEffect(() => {
    if (!isDraggingPlayhead) return

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!trackRef.current) return
      
      const rect = trackRef.current.getBoundingClientRect()
      const scrollLeft = trackRef.current.scrollLeft
      const mouseX = e.clientX - rect.left + scrollLeft
      const rawTime = pixelToTime(mouseX)
      const { time: newTime, snapped } = snapTime(rawTime)
      
      setPlayhead(newTime)
      setIsSnapped(snapped)
      
      // Notify parent for video preview sync (Requirements 3.2)
      if (onPlayheadDrag) {
        onPlayheadDrag(newTime)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false)
      setIsSnapped(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingPlayhead, pixelToTime, snapTime, setPlayhead, onPlayheadDrag])

  // Handle segment update
  const handleSegmentUpdate = useCallback((segmentId: string, updates: Partial<TimelineSegment>) => {
    updateSegment(segmentId, updates)
    
    // Find the updated segment and notify parent
    if (onSegmentChange) {
      const segment = segments.find(s => s.id === segmentId)
      if (segment) {
        onSegmentChange({ ...segment, ...updates })
      }
    }
  }, [updateSegment, segments, onSegmentChange])

  // Handle transition selection (Requirements 6.1)
  const handleTransitionSelect = useCallback((transitionId: string) => {
    selectTransition(transitionId)
  }, [selectTransition])

  // Auto-create missing transitions between adjacent segments (Requirements 6.1)
  // Use a ref to track if we've already processed this segment count
  const lastSegmentCountRef = useRef(0)
  
  useEffect(() => {
    // Only process when segment count actually changes
    if (segments.length < 2 || segments.length === lastSegmentCountRef.current) return
    lastSegmentCountRef.current = segments.length
    
    const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime)
    
    // Build a set of existing transition keys for fast lookup
    const existingKeys = new Set(
      transitions.map(t => `${t.fromSegmentIndex}-${t.toSegmentIndex}`)
    )
    
    const missingTransitions: Transition[] = []
    
    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const currentSeg = sortedSegments[i]
      const nextSeg = sortedSegments[i + 1]
      const key = `${currentSeg.index}-${nextSeg.index}`
      
      if (!existingKeys.has(key)) {
        missingTransitions.push(createDefaultTransition(currentSeg.index, nextSeg.index))
      }
    }
    
    if (missingTransitions.length > 0) {
      setTransitions([...transitions, ...missingTransitions])
    }
  }, [segments, transitions, setTransitions])

  // Compute transition zones between adjacent segments (Requirements 6.1)
  const transitionZones = useMemo(() => {
    if (segments.length < 2) return []
    
    const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime)
    const zones: Array<{
      transition: Transition
      position: number
    }> = []
    
    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const currentSeg = sortedSegments[i]
      const nextSeg = sortedSegments[i + 1]
      
      const transition = transitions.find(
        t => t.fromSegmentIndex === currentSeg.index && t.toSegmentIndex === nextSeg.index
      )
      
      if (transition) {
        const currentSegEnd = currentSeg.startTime + currentSeg.duration
        const transitionPosition = timeToPixel(currentSegEnd)
        
        zones.push({
          transition,
          position: transitionPosition,
        })
      }
    }
    
    return zones
  }, [segments, transitions, timeToPixel])

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    if (!trackRef.current || isDraggingPlayhead) return
    
    const playheadX = timeToPixel(playhead)
    const container = trackRef.current
    const containerWidth = container.clientWidth
    const scrollLeft = container.scrollLeft
    
    // If playhead is outside visible area, scroll to it
    if (playheadX < scrollLeft + 50) {
      container.scrollLeft = Math.max(0, playheadX - 50)
    } else if (playheadX > scrollLeft + containerWidth - 50) {
      container.scrollLeft = playheadX - containerWidth + 50
    }
  }, [playhead, timeToPixel, isDraggingPlayhead])

  const timeMarkers = generateTimeMarkers()
  const playheadPosition = timeToPixel(playhead)

  return (
    <div className="timeline-track-container">
      <div
        ref={trackRef}
        className="timeline-track"
        onClick={handleTrackClick}
      >
        <div
          className="timeline-track__content"
          style={{ width: `${trackWidth}px` }}
        >
          {/* Time ruler */}
          <div className="timeline-track__ruler">
            {timeMarkers.map((marker, idx) => (
              <div
                key={idx}
                className={`timeline-track__marker ${marker.isMajor ? 'timeline-track__marker--major' : ''}`}
                style={{ left: `${timeToPixel(marker.time)}px` }}
              >
                {marker.isMajor && (
                  <span className="timeline-track__marker-label">{marker.label}</span>
                )}
              </div>
            ))}
          </div>

          {/* Segments track */}
          <div className="timeline-track__segments">
            {segments.map(segment => (
              <SegmentBlock
                key={segment.id}
                segment={segment}
                pixelsPerSecond={pixelsPerSecond}
                videoDuration={videoDuration}
                isSelected={selectedSegmentId === segment.id}
                onSelect={() => selectSegment(segment.id)}
                onUpdate={(updates: Partial<TimelineSegment>) => handleSegmentUpdate(segment.id, updates)}
                allSegments={segments}
              />
            ))}
            
            {/* Transition zones between segments (Requirements 6.1) */}
            {transitionZones.map(({ transition, position }) => (
              <TransitionZone
                key={transition.id}
                transition={transition}
                leftPosition={position}
                isSelected={selectedTransitionId === transition.id}
                onSelect={() => handleTransitionSelect(transition.id)}
              />
            ))}
          </div>

          {/* Playhead */}
          <div
            className={`timeline-track__playhead ${isDraggingPlayhead ? 'timeline-track__playhead--dragging' : ''} ${isSnapped ? 'timeline-track__playhead--snapped' : ''}`}
            style={{ left: `${playheadPosition}px` }}
            onMouseDown={handlePlayheadMouseDown}
          >
            <div className="timeline-track__playhead-head" />
            <div className="timeline-track__playhead-line" />
          </div>
        </div>
      </div>
    </div>
  )
}
