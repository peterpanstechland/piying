import { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect } from 'react'

// Types based on design document
export type AnimationType = 'fade_in' | 'fade_out' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'instant'

export type TransitionType = 'cut' | 'crossfade' | 'fade_to_black' | 'wipe_left' | 'wipe_right'

export interface AnimationConfig {
  type: AnimationType
  duration: number  // 0.5-5 seconds
  delay: number     // Delay from segment start/end
}

export interface PathPoint {
  x: number  // 0-1 normalized
  y: number  // 0-1 normalized
}

export interface SegmentPath {
  startPoint: PathPoint
  endPoint: PathPoint
  waypoints: PathPoint[]
  pathType: 'linear' | 'bezier' | 'freehand'
}

export interface TimelineSegment {
  id: string
  index: number
  startTime: number
  duration: number
  entryAnimation: AnimationConfig
  exitAnimation: AnimationConfig
  guidanceText: string
  guidanceTextEn: string
  guidanceImage: string | null
  // Movement path
  path?: SegmentPath
  // Audio playback during recording
  playAudio?: boolean
}

export interface Transition {
  id: string
  fromSegmentIndex: number
  toSegmentIndex: number
  type: TransitionType
  duration: number
}

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 1.5 | 2

export type LoopMode = 'none' | 'segment' | 'full'

interface TimelineEditorState {
  // Playhead position in seconds
  playhead: number
  // Zoom level (1-10)
  zoom: number
  // Currently selected segment ID
  selectedSegmentId: string | null
  // Currently selected transition ID
  selectedTransitionId: string | null
  // Playback state
  isPlaying: boolean
  // Playback speed
  playbackSpeed: PlaybackSpeed
  // Loop mode (Requirements 11.5)
  loopMode: LoopMode
  // Video duration in seconds
  videoDuration: number
  // Segments on the timeline
  segments: TimelineSegment[]
  // Transitions between segments
  transitions: Transition[]
}

interface TimelineEditorActions {
  // Playhead actions
  setPlayhead: (time: number) => void
  // Zoom actions
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  // Selection actions
  selectSegment: (segmentId: string | null) => void
  selectTransition: (transitionId: string | null) => void
  clearSelection: () => void
  // Playback actions
  play: () => void
  pause: () => void
  togglePlayback: () => void
  setPlaybackSpeed: (speed: PlaybackSpeed) => void
  setLoopMode: (mode: LoopMode) => void
  // Video duration
  setVideoDuration: (duration: number) => void
  // Segment actions
  setSegments: (segments: TimelineSegment[]) => void
  updateSegment: (segmentId: string, updates: Partial<TimelineSegment>) => void
  addSegment: (segment: TimelineSegment) => void
  removeSegment: (segmentId: string) => void
  // Transition actions
  setTransitions: (transitions: Transition[]) => void
  updateTransition: (transitionId: string, updates: Partial<Transition>) => void
}

interface TimelineEditorContextType extends TimelineEditorState, TimelineEditorActions {}

const TimelineEditorContext = createContext<TimelineEditorContextType | undefined>(undefined)

const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  type: 'instant',
  duration: 1.0,
  delay: 0,
}

const MIN_ZOOM = 1
const MAX_ZOOM = 10
const ZOOM_STEP = 1

interface TimelineEditorProviderProps {
  children: ReactNode
  initialVideoDuration?: number
  initialSegments?: TimelineSegment[]
  initialTransitions?: Transition[]
}

export function TimelineEditorProvider({
  children,
  initialVideoDuration = 0,
  initialSegments = [],
  initialTransitions = [],
}: TimelineEditorProviderProps) {
  // State
  const [playhead, setPlayheadState] = useState(0)
  const [zoom, setZoomState] = useState(5)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeedState] = useState<PlaybackSpeed>(1)
  const [loopMode, setLoopModeState] = useState<LoopMode>('none')
  const [videoDuration, setVideoDurationState] = useState(initialVideoDuration)
  const [segments, setSegmentsState] = useState<TimelineSegment[]>(initialSegments)
  const [transitions, setTransitionsState] = useState<Transition[]>(initialTransitions)
  
  // Track if initial data has been loaded to avoid overwriting user changes
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  
  // Sync segments when initialSegments changes (e.g., after page refresh/reload)
  // Only update if this is initial load or segments are empty
  useEffect(() => {
    if (initialSegments.length > 0 && isInitialLoad) {
      setSegmentsState(initialSegments)
      setIsInitialLoad(false)
    }
  }, [initialSegments, isInitialLoad])
  
  // Sync transitions when initialTransitions changes
  useEffect(() => {
    if (initialTransitions.length > 0 && isInitialLoad) {
      setTransitionsState(initialTransitions)
    }
  }, [initialTransitions, isInitialLoad])

  // Playhead actions
  const setPlayhead = useCallback((time: number) => {
    setPlayheadState(Math.max(0, Math.min(time, videoDuration)))
  }, [videoDuration])

  // Zoom actions
  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(MIN_ZOOM, Math.min(newZoom, MAX_ZOOM)))
  }, [])

  const zoomIn = useCallback(() => {
    setZoomState(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM))
  }, [])

  const zoomOut = useCallback(() => {
    setZoomState(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM))
  }, [])

  // Selection actions
  const selectSegment = useCallback((segmentId: string | null) => {
    setSelectedSegmentId(segmentId)
    setSelectedTransitionId(null) // Clear transition selection when selecting segment
  }, [])

  const selectTransition = useCallback((transitionId: string | null) => {
    setSelectedTransitionId(transitionId)
    setSelectedSegmentId(null) // Clear segment selection when selecting transition
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedSegmentId(null)
    setSelectedTransitionId(null)
  }, [])

  // Playback actions
  const play = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const togglePlayback = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  const setPlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeedState(speed)
  }, [])

  // Loop mode (Requirements 11.5)
  const setLoopMode = useCallback((mode: LoopMode) => {
    setLoopModeState(mode)
  }, [])

  // Video duration
  const setVideoDuration = useCallback((duration: number) => {
    setVideoDurationState(duration)
  }, [])

  // Segment actions
  const setSegments = useCallback((newSegments: TimelineSegment[]) => {
    setSegmentsState(newSegments)
  }, [])

  const updateSegment = useCallback((segmentId: string, updates: Partial<TimelineSegment>) => {
    setSegmentsState(prev => prev.map(seg =>
      seg.id === segmentId ? { ...seg, ...updates } : seg
    ))
  }, [])

  const addSegment = useCallback((segment: TimelineSegment) => {
    setSegmentsState(prev => [...prev, segment])
  }, [])

  const removeSegment = useCallback((segmentId: string) => {
    setSegmentsState(prev => {
      const filtered = prev.filter(seg => seg.id !== segmentId)
      // Re-index remaining segments
      return filtered.map((seg, idx) => ({ ...seg, index: idx }))
    })
    // Clear selection if removed segment was selected
    if (selectedSegmentId === segmentId) {
      setSelectedSegmentId(null)
    }
  }, [selectedSegmentId])

  // Transition actions
  const setTransitions = useCallback((newTransitions: Transition[]) => {
    setTransitionsState(newTransitions)
  }, [])

  const updateTransition = useCallback((transitionId: string, updates: Partial<Transition>) => {
    setTransitionsState(prev => prev.map(trans =>
      trans.id === transitionId ? { ...trans, ...updates } : trans
    ))
  }, [])

  const value = useMemo<TimelineEditorContextType>(() => ({
    // State
    playhead,
    zoom,
    selectedSegmentId,
    selectedTransitionId,
    isPlaying,
    playbackSpeed,
    loopMode,
    videoDuration,
    segments,
    transitions,
    // Actions
    setPlayhead,
    setZoom,
    zoomIn,
    zoomOut,
    selectSegment,
    selectTransition,
    clearSelection,
    play,
    pause,
    togglePlayback,
    setPlaybackSpeed,
    setLoopMode,
    setVideoDuration,
    setSegments,
    updateSegment,
    addSegment,
    removeSegment,
    setTransitions,
    updateTransition,
  }), [
    playhead, zoom, selectedSegmentId, selectedTransitionId, isPlaying,
    playbackSpeed, loopMode, videoDuration, segments, transitions,
    setPlayhead, setZoom, zoomIn, zoomOut, selectSegment, selectTransition,
    clearSelection, play, pause, togglePlayback, setPlaybackSpeed, setLoopMode,
    setVideoDuration, setSegments, updateSegment, addSegment, removeSegment,
    setTransitions, updateTransition,
  ])

  return (
    <TimelineEditorContext.Provider value={value}>
      {children}
    </TimelineEditorContext.Provider>
  )
}

export function useTimelineEditor() {
  const context = useContext(TimelineEditorContext)
  if (context === undefined) {
    throw new Error('useTimelineEditor must be used within a TimelineEditorProvider')
  }
  return context
}

// Helper function to create a new segment with defaults
export function createDefaultSegment(index: number, startTime: number): TimelineSegment {
  return {
    id: `segment-${Date.now()}-${index}`,
    index,
    startTime,
    duration: 10, // Default 10 seconds as per Requirements 4.1
    entryAnimation: { ...DEFAULT_ANIMATION_CONFIG },
    exitAnimation: { ...DEFAULT_ANIMATION_CONFIG },
    guidanceText: '',
    guidanceTextEn: '',
    guidanceImage: null,
  }
}

// Helper function to create a new transition with defaults
export function createDefaultTransition(fromIndex: number, toIndex: number): Transition {
  return {
    id: `transition-${Date.now()}-${fromIndex}-${toIndex}`,
    fromSegmentIndex: fromIndex,
    toSegmentIndex: toIndex,
    type: 'cut',
    duration: 0.5,
  }
}
