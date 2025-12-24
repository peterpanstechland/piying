import { useEffect, useRef, useState, useCallback } from 'react'
import { CharacterRenderer } from '@shared/pixi'
import { adminApi } from '../../services/api'
import { TimelineSegment, ScaleConfig } from '../../contexts/TimelineEditorContext'
import './CharacterOverlay.css'

// 参考分辨率 - 与录制端保持一致，确保 scale 和位置精确匹配
const REFERENCE_WIDTH = 1920
const REFERENCE_HEIGHT = 1080

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

  // 计算显示缩放比例 (预览窗口 / 参考分辨率)
  const displayScale = Math.min(
    containerWidth / REFERENCE_WIDTH,
    containerHeight / REFERENCE_HEIGHT
  )

  // Initialize Renderer - 使用固定参考分辨率
  useEffect(() => {
    if (!canvasRef.current || !characterId) return
    // Don't init if dimensions are invalid
    if (containerWidth === 0 || containerHeight === 0) return

    const renderer = new CharacterRenderer()
    rendererRef.current = renderer

    const initRenderer = async () => {
      console.log('[CharacterOverlay] Initializing renderer with REFERENCE resolution', { 
        characterId, 
        referenceWidth: REFERENCE_WIDTH, 
        referenceHeight: REFERENCE_HEIGHT,
        containerWidth,
        containerHeight,
        displayScale
      })
      try {
        // 使用固定参考分辨率初始化，确保与录制端一致
        await renderer.init(canvasRef.current!, REFERENCE_WIDTH, REFERENCE_HEIGHT, {
          backgroundAlpha: 0,
          backgroundColor: 'transparent',
        })
        console.log('[CharacterOverlay] Renderer initialized with reference resolution')
        
        // Use getCharacterConfigUrl to get the config URL for the character
        const configUrl = adminApi.getCharacterConfigUrl(characterId)
        console.log('[CharacterOverlay] Loading character from config URL:', configUrl)
        
        await renderer.loadCharacter(configUrl)
        console.log('[CharacterOverlay] Character loaded successfully')
        
        // Reset to initial pose after loading
        renderer.resetPose()
        console.log('[CharacterOverlay] Reset to initial pose')
        
        // FIX: Apply initial scale immediately to avoid large character flash
        const initialScale = getScale()
        const container = renderer.getContainer()
        if (container) {
          container.scale.set(initialScale * (renderer.isFlipped() ? -1 : 1), initialScale)
        }
        
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
  }, [characterId]) // 只在 characterId 变化时重新初始化

  // Update Render (Position & Scale) - 使用参考分辨率计算
  const updateRender = useCallback(() => {
    const renderer = rendererRef.current
    if (!renderer || !isLoaded) {
      return
    }

    const container = renderer.getContainer()
    if (!container) return

    // 1. Position based on Path - 使用参考分辨率计算
    let x = REFERENCE_WIDTH / 2
    let y = REFERENCE_HEIGHT / 2

    if (segment.path) {
      const { startPoint, endPoint } = segment.path
      // Calculate progress within segment
      let progress = (playhead - segment.startTime) / segment.duration
      progress = Math.max(0, Math.min(1, progress))

      // Linear interpolation between start and end points
      // Path coordinates are normalized (0-1), multiply by REFERENCE size
      x = (startPoint.x + (endPoint.x - startPoint.x) * progress) * REFERENCE_WIDTH
      y = (startPoint.y + (endPoint.y - startPoint.y) * progress) * REFERENCE_HEIGHT
    }

    // 2. Scale - 直接使用配置的 scale，与录制端完全一致
    const currentScale = getScale()
    
    // Apply transform
    container.position.set(x, y)
    container.scale.set(currentScale * (renderer.isFlipped() ? -1 : 1), currentScale)

    // Update bounds - 需要考虑显示缩放比例
    const localBounds = container.getLocalBounds()
    
    // Calculate the actual width/height considering scale AND display scale
    const actualWidth = localBounds.width * Math.abs(currentScale) * displayScale
    const actualHeight = localBounds.height * Math.abs(currentScale) * displayScale
    
    // Convert position to display coordinates
    const displayX = x * displayScale
    const displayY = y * displayScale
    
    // If bounds are empty or invalid, use a fallback size
    if (actualWidth === 0 || actualHeight === 0 || !isFinite(actualWidth) || !isFinite(actualHeight)) {
        // Fallback: assume a standard size (e.g. 200x400) scaled
        const fallbackW = 200 * currentScale * displayScale
        const fallbackH = 400 * currentScale * displayScale
        setBounds({
            x: displayX - fallbackW / 2,
            y: displayY - fallbackH / 2,
            width: fallbackW,
            height: fallbackH
        })
    } else {
        // Calculate the top-left corner based on center position
        setBounds({
            x: displayX + localBounds.x * currentScale * displayScale,
            y: displayY + localBounds.y * currentScale * displayScale,
            width: actualWidth,
            height: actualHeight
        })
    }
  }, [isLoaded, playhead, segment, displayScale, getScale])

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
        // Resize - 在显示坐标系中计算
        // Calculate center in screen coordinates
        const centerX = canvasRect.left + initialBounds.x + initialBounds.width / 2
        const centerY = canvasRect.top + initialBounds.y + initialBounds.height / 2
        
        // Distance from center
        const currentDist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY)
        const startDist = Math.hypot(startX - centerX, startY - centerY)
        
        if (startDist < 1) return // Avoid division by zero

        const scaleFactor = currentDist / startDist
        const newScale = Math.max(0.1, Math.min(3.0, initialScale * scaleFactor)) // 限制在 0.1 - 3.0
        
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
      <canvas 
        ref={canvasRef} 
        className="character-overlay__canvas" 
        style={{
          width: REFERENCE_WIDTH,
          height: REFERENCE_HEIGHT,
          transform: `scale(${displayScale})`,
          transformOrigin: 'top left',
        }}
      />
      
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
