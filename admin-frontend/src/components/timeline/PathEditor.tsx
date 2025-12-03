/**
 * PathEditor Component
 * 
 * Allows users to draw and edit character movement paths on the video preview.
 * Supports:
 * - Pencil tool for freehand path drawing
 * - Control points for start/end positions
 * - Path preview animation
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { SegmentPath, PathPoint } from '../../contexts/TimelineEditorContext'
import './PathEditor.css'

// Re-export types for convenience
export type { SegmentPath, PathPoint }

interface PathEditorProps {
  /** Video element ref for overlay positioning */
  videoRef: React.RefObject<HTMLVideoElement>
  /** Current segment's path data */
  path: SegmentPath | null
  /** Callback when path changes */
  onPathChange: (path: SegmentPath) => void
  /** Whether editing is enabled */
  enabled?: boolean
  /** Current tool: 'select' | 'pencil' | 'line' */
  tool?: 'select' | 'pencil' | 'line'
  /** Show path animation preview */
  showPreview?: boolean
  /** Animation progress (0-1) for preview */
  previewProgress?: number
}

const DEFAULT_PATH: SegmentPath = {
  startPoint: { x: 0.1, y: 0.5 },
  endPoint: { x: 0.9, y: 0.5 },
  waypoints: [],
  pathType: 'linear',
}

export default function PathEditor({
  videoRef,
  path,
  onPathChange,
  enabled = true,
  tool = 'select',
  showPreview = false,
  previewProgress = 0,
}: PathEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragTarget, setDragTarget] = useState<'start' | 'end' | null>(null)
  const [currentPath, setCurrentPath] = useState<PathPoint[]>([])
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const activePath = path || DEFAULT_PATH

  // Update canvas size to match video
  useEffect(() => {
    const updateSize = () => {
      if (videoRef.current && containerRef.current) {
        const video = videoRef.current
        const rect = video.getBoundingClientRect()
        setCanvasSize({ width: rect.width, height: rect.height })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    
    // Also update when video loads
    const video = videoRef.current
    if (video) {
      video.addEventListener('loadedmetadata', updateSize)
    }

    return () => {
      window.removeEventListener('resize', updateSize)
      if (video) {
        video.removeEventListener('loadedmetadata', updateSize)
      }
    }
  }, [videoRef])

  // Convert normalized coords to canvas coords
  const toCanvasCoords = useCallback((point: PathPoint) => ({
    x: point.x * canvasSize.width,
    y: point.y * canvasSize.height,
  }), [canvasSize])

  // Convert canvas coords to normalized coords
  const toNormalizedCoords = useCallback((x: number, y: number): PathPoint => ({
    x: Math.max(0, Math.min(1, x / canvasSize.width)),
    y: Math.max(0, Math.min(1, y / canvasSize.height)),
  }), [canvasSize])

  // Get mouse position relative to canvas
  const getMousePos = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  // Check if point is near a control point
  const isNearPoint = useCallback((mouseX: number, mouseY: number, point: PathPoint, threshold = 15) => {
    const canvasPoint = toCanvasCoords(point)
    const dx = mouseX - canvasPoint.x
    const dy = mouseY - canvasPoint.y
    return Math.sqrt(dx * dx + dy * dy) < threshold
  }, [toCanvasCoords])

  // Draw the path on canvas
  const drawPath = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!enabled) return

    const start = toCanvasCoords(activePath.startPoint)
    const end = toCanvasCoords(activePath.endPoint)

    // Draw path line
    ctx.beginPath()
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = 3
    ctx.setLineDash([5, 5])

    if (activePath.waypoints.length > 0) {
      // Draw through waypoints
      ctx.moveTo(start.x, start.y)
      activePath.waypoints.forEach(wp => {
        const p = toCanvasCoords(wp)
        ctx.lineTo(p.x, p.y)
      })
      ctx.lineTo(end.x, end.y)
    } else {
      // Simple line
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Draw waypoints
    activePath.waypoints.forEach((wp) => {
      const p = toCanvasCoords(wp)
      ctx.beginPath()
      ctx.fillStyle = '#ffd700'
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw start point (green)
    ctx.beginPath()
    ctx.fillStyle = '#00ff00'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.arc(start.x, start.y, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#000'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('S', start.x, start.y)

    // Draw end point (red)
    ctx.beginPath()
    ctx.fillStyle = '#ff4444'
    ctx.strokeStyle = '#ffffff'
    ctx.arc(end.x, end.y, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.fillText('E', end.x, end.y)

    // Draw preview position if enabled
    if (showPreview) {
      const previewPos = getPositionAtProgress(activePath, previewProgress)
      const p = toCanvasCoords(previewPos)
      ctx.beginPath()
      ctx.fillStyle = 'rgba(255, 215, 0, 0.8)'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      
      // Character icon
      ctx.fillStyle = '#000'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText('🧍', p.x, p.y)
    }

    // Draw current freehand path being drawn
    if (isDrawing && currentPath.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 2
      const first = toCanvasCoords(currentPath[0])
      ctx.moveTo(first.x, first.y)
      currentPath.slice(1).forEach(p => {
        const cp = toCanvasCoords(p)
        ctx.lineTo(cp.x, cp.y)
      })
      ctx.stroke()
    }
  }, [activePath, enabled, toCanvasCoords, showPreview, previewProgress, isDrawing, currentPath])

  // Redraw when dependencies change
  useEffect(() => {
    drawPath()
  }, [drawPath, canvasSize])

  // Get position along path at given progress (0-1)
  const getPositionAtProgress = (path: SegmentPath, progress: number): PathPoint => {
    const points = [path.startPoint, ...path.waypoints, path.endPoint]
    if (points.length < 2) return path.startPoint

    const totalSegments = points.length - 1
    const segmentProgress = progress * totalSegments
    const segmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1)
    const localProgress = segmentProgress - segmentIndex

    const p1 = points[segmentIndex]
    const p2 = points[segmentIndex + 1]

    return {
      x: p1.x + (p2.x - p1.x) * localProgress,
      y: p1.y + (p2.y - p1.y) * localProgress,
    }
  }

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled) return
    const pos = getMousePos(e)

    if (tool === 'select') {
      // Check if clicking on control points
      if (isNearPoint(pos.x, pos.y, activePath.startPoint)) {
        setDragTarget('start')
        return
      }
      if (isNearPoint(pos.x, pos.y, activePath.endPoint)) {
        setDragTarget('end')
        return
      }
    } else if (tool === 'pencil') {
      setIsDrawing(true)
      const normalized = toNormalizedCoords(pos.x, pos.y)
      setCurrentPath([normalized])
    } else if (tool === 'line') {
      // Start new line from click position
      const normalized = toNormalizedCoords(pos.x, pos.y)
      onPathChange({
        ...activePath,
        startPoint: normalized,
        waypoints: [],
      })
      setDragTarget('end')
    }
  }, [enabled, tool, getMousePos, isNearPoint, activePath, toNormalizedCoords, onPathChange])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!enabled) return
    const pos = getMousePos(e)
    const normalized = toNormalizedCoords(pos.x, pos.y)

    if (dragTarget) {
      const newPath = { ...activePath }
      if (dragTarget === 'start') {
        newPath.startPoint = normalized
      } else {
        newPath.endPoint = normalized
      }
      onPathChange(newPath)
    } else if (isDrawing && tool === 'pencil') {
      setCurrentPath(prev => [...prev, normalized])
    }
  }, [enabled, dragTarget, isDrawing, tool, getMousePos, toNormalizedCoords, activePath, onPathChange])

  const handleMouseUp = useCallback(() => {
    if (dragTarget) {
      setDragTarget(null)
    }
    if (isDrawing && tool === 'pencil' && currentPath.length > 1) {
      // Simplify path and save
      const simplified = simplifyPath(currentPath, 0.02)
      onPathChange({
        startPoint: simplified[0],
        endPoint: simplified[simplified.length - 1],
        waypoints: simplified.slice(1, -1),
        pathType: 'freehand',
      })
      setCurrentPath([])
    }
    setIsDrawing(false)
  }, [dragTarget, isDrawing, tool, currentPath, onPathChange])

  // Simplify path using Douglas-Peucker algorithm
  const simplifyPath = (points: PathPoint[], tolerance: number): PathPoint[] => {
    if (points.length <= 2) return points

    let maxDist = 0
    let maxIndex = 0
    const first = points[0]
    const last = points[points.length - 1]

    for (let i = 1; i < points.length - 1; i++) {
      const dist = perpendicularDistance(points[i], first, last)
      if (dist > maxDist) {
        maxDist = dist
        maxIndex = i
      }
    }

    if (maxDist > tolerance) {
      const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance)
      const right = simplifyPath(points.slice(maxIndex), tolerance)
      return [...left.slice(0, -1), ...right]
    }

    return [first, last]
  }

  const perpendicularDistance = (point: PathPoint, lineStart: PathPoint, lineEnd: PathPoint): number => {
    const dx = lineEnd.x - lineStart.x
    const dy = lineEnd.y - lineStart.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2)
    
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)))
    const projX = lineStart.x + t * dx
    const projY = lineStart.y + t * dy
    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)
  }

  return (
    <div 
      ref={containerRef}
      className="path-editor"
      style={{ width: canvasSize.width, height: canvasSize.height }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className={`path-editor__canvas ${tool !== 'select' ? 'path-editor__canvas--drawing' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  )
}
