import { useEffect, useRef, useState, useCallback } from 'react'
import { CharacterRenderer } from '../../pixi/CharacterRenderer'
import { adminApi } from '../../services/api'
import { TimelineSegment, ScaleConfig } from '../../contexts/TimelineEditorContext'
import './CharacterOverlay.css'

interface CharacterOverlayProps {
  characterId: string
  segment: TimelineSegment
  playhead: number
  containerWidth: number
  containerHeight: number
  onScaleChange: (config: ScaleConfig) => void
  visible?: boolean
}

export default function CharacterOverlay({
  characterId,
  segment,
  playhead,
  containerWidth,
  containerHeight,
  onScaleChange,
  visible = true
}: CharacterOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CharacterRenderer | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [bounds, setBounds] = useState<{ x: number, y: number, width: number, height: number } | null>(null)

  // Get current scale from config
  const getScale = useCallback(() => {
    const config = segment.scale
    if (!config) return 1.0
    
    if (config.mode === 'auto') {
      return config.start || 1.0
    } else {
      const progress = Math.max(0, Math.min(1, (playhead - segment.startTime) / segment.duration))
      const start = config.start || 1.0
      const end = config.end || 1.0
      return start + (end - start) * progress
    }
  }, [segment.scale, playhead, segment.startTime, segment.duration])

  // Initialize Renderer
  useEffect(() => {
    if (!canvasRef.current || !characterId) return
    // Don't init if dimensions are invalid
    if (containerWidth === 0 || containerHeight === 0) return

    const renderer = new CharacterRenderer()
    rendererRef.current = renderer

    const initRenderer = async () => {
      console.log('[CharacterOverlay] Initializing renderer', { characterId, containerWidth, containerHeight })
      try {
        // Use transparent background for PixiJS 8
        await renderer.init(canvasRef.current!, containerWidth, containerHeight, {
          backgroundAlpha: 0,
          backgroundColor: 'transparent',
        })
        console.log('[CharacterOverlay] Renderer initialized successfully')
        
        // Use getCharacterConfigUrl to get the config URL for the character
        const configUrl = adminApi.getCharacterConfigUrl(characterId)
        console.log('[CharacterOverlay] Loading character from config URL:', configUrl)
        
        await renderer.loadCharacter(configUrl)
        console.log('[CharacterOverlay] Character loaded successfully')
        
        // Reset to initial pose after loading
        renderer.resetPose()
        console.log('[CharacterOverlay] Reset to initial pose')
        
        setIsLoaded(true)
      } catch (err) {
        console.error('[CharacterOverlay] Failed to init character renderer:', err)
      }
    }

    initRenderer()

    return () => {
      renderer.destroy()
      rendererRef.current = null
    }
  }, [characterId, containerWidth, containerHeight]) // Add dimensions to dependency to re-init if they were 0 initially

  // Handle Resize without re-init
  useEffect(() => {
    // Only resize if we already have a valid renderer instance
    if (rendererRef.current && isLoaded && containerWidth > 0 && containerHeight > 0) {
      rendererRef.current.resize(containerWidth, containerHeight)
      // Render update handled by loop
    }
  }, [containerWidth, containerHeight, isLoaded])

  // Update Render (Position & Scale)
  const updateRender = useCallback(() => {
    const renderer = rendererRef.current
    if (!renderer || !isLoaded) {
      return
    }

    const container = renderer.getContainer()
    if (!container) return

    // 1. Position based on Path
    let x = containerWidth / 2
    let y = containerHeight / 2

    if (segment.path) {
      const { startPoint, endPoint } = segment.path
      // Calculate progress within segment
      let progress = (playhead - segment.startTime) / segment.duration
      progress = Math.max(0, Math.min(1, progress))

      // Linear interpolation between start and end points
      // Path coordinates are normalized (0-1), multiply by container size
      x = (startPoint.x + (endPoint.x - startPoint.x) * progress) * containerWidth
      y = (startPoint.y + (endPoint.y - startPoint.y) * progress) * containerHeight
    }

    // 2. Scale
    const currentScale = getScale()
    
    // Apply transform
    container.position.set(x, y)
    container.scale.set(currentScale * (renderer.isFlipped() ? -1 : 1), currentScale)

    // Update bounds - calculate based on character position and size
    // The container.position is the CENTER of the character
    // We need to get the actual rendered size from the container's local bounds
    const localBounds = container.getLocalBounds()
    
    // Calculate the actual width/height considering scale
    const actualWidth = localBounds.width * Math.abs(currentScale)
    const actualHeight = localBounds.height * Math.abs(currentScale)
    
    // If bounds are empty or invalid, use a fallback size
    if (actualWidth === 0 || actualHeight === 0 || !isFinite(actualWidth) || !isFinite(actualHeight)) {
        // Fallback: assume a standard size (e.g. 200x400) scaled
        const fallbackW = 200 * currentScale
        const fallbackH = 400 * currentScale
        setBounds({
            x: x - fallbackW / 2,
            y: y - fallbackH / 2,
            width: fallbackW,
            height: fallbackH
        })
    } else {
        // Calculate the top-left corner based on center position
        // The local bounds give us the offset from the container's origin
        // Since pivot is usually at center (0,0 in local space maps to container.position in world space)
        setBounds({
            x: x + localBounds.x * currentScale,
            y: y + localBounds.y * currentScale,
            width: actualWidth,
            height: actualHeight
        })
    }
  }, [isLoaded, playhead, segment, containerWidth, containerHeight, getScale])

  // Animation Loop
  useEffect(() => {
    let frameId: number
    const loop = () => {
      updateRender()
      frameId = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(frameId)
  }, [updateRender])

  // Handle Drag/Resize
  const handleMouseDown = (e: React.MouseEvent, type: 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br') => {
    e.stopPropagation()
    e.preventDefault()
    
    const startX = e.clientX
    const startY = e.clientY
    const initialScale = getScale()
    const initialBounds = bounds
    
    // Get canvas rect for coordinate conversion
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (!initialBounds || !canvasRect) return

    const onMouseMove = (ev: MouseEvent) => {
      if (type === 'drag') {
        // Future: Implement Drag to move path
      } else {
        // Resize
        // Calculate center in screen coordinates
        const centerX = canvasRect.left + initialBounds.x + initialBounds.width / 2
        const centerY = canvasRect.top + initialBounds.y + initialBounds.height / 2
        
        // Distance from center
        const currentDist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY)
        const startDist = Math.hypot(startX - centerX, startY - centerY)
        
        if (startDist < 1) return // Avoid division by zero

        const scaleFactor = currentDist / startDist
        const newScale = Math.max(0.1, initialScale * scaleFactor)
        
        // Update config
        const currentConfig = segment.scale || { mode: 'auto', start: 1.0, end: 1.0 }
        onScaleChange({
          ...currentConfig,
          mode: 'manual',
          start: newScale,
          end: newScale
        })
      }
    }
    
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  if (!characterId || !visible) return null

  return (
    <div className="character-overlay">
      <canvas ref={canvasRef} className="character-overlay__canvas" />
      
      {bounds && (
        <div 
          className="character-overlay__transformer"
          style={{
            left: bounds.x,
            top: bounds.y,
            width: bounds.width,
            height: bounds.height,
          }}
          onMouseDown={(e) => handleMouseDown(e, 'drag')}
        >
          <div className="character-overlay__handle character-overlay__handle--tl" onMouseDown={(e) => handleMouseDown(e, 'resize-tl')} />
          <div className="character-overlay__handle character-overlay__handle--tr" onMouseDown={(e) => handleMouseDown(e, 'resize-tr')} />
          <div className="character-overlay__handle character-overlay__handle--bl" onMouseDown={(e) => handleMouseDown(e, 'resize-bl')} />
          <div className="character-overlay__handle character-overlay__handle--br" onMouseDown={(e) => handleMouseDown(e, 'resize-br')} />
          
          <div className="character-overlay__scale-label">
             {getScale().toFixed(2)}x
          </div>
        </div>
      )}
    </div>
  )
}
