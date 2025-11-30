import { useState, useRef, useEffect, useCallback } from 'react'
import './PivotEditor.css'

interface CharacterPart {
  name: string
  file_path: string
  pivot_x: number
  pivot_y: number
  z_index: number
  connections: string[]
}

interface Props {
  characterId: string
  parts: CharacterPart[]
  onSave: (parts: CharacterPart[]) => void
  saving: boolean
}

interface PartPosition {
  x: number
  y: number
  width: number
  height: number
}

interface DragState {
  partName: string | null
  type: 'move' | 'pivot' | 'connection' | null
  startX: number
  startY: number
  offsetX: number
  offsetY: number
}

const PART_LABELS: Record<string, string> = {
  'head': '头部',
  'body': '身体',
  'left-arm': '左臂',
  'right-arm': '右臂',
  'left-hand': '左手',
  'right-hand': '右手',
  'left-foot': '左脚',
  'right-foot': '右脚',
  'upper-leg': '大腿'
}

export default function PivotEditor({ characterId, parts, onSave, saving }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [editedParts, setEditedParts] = useState<CharacterPart[]>([])
  const [partPositions, setPartPositions] = useState<Record<string, PartPosition>>({})
  const [partImages, setPartImages] = useState<Record<string, HTMLImageElement>>({})
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState>({
    partName: null,
    type: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
  })
  const [connectionStart, setConnectionStart] = useState<string | null>(null)
  const [mode, setMode] = useState<'move' | 'pivot' | 'connection'>('move')

  // Initialize edited parts from props
  useEffect(() => {
    setEditedParts(parts.map(p => ({ ...p })))
  }, [parts])

  // Load part images
  useEffect(() => {
    const loadImages = async () => {
      const images: Record<string, HTMLImageElement> = {}
      const positions: Record<string, PartPosition> = {}
      
      for (const part of parts) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        
        await new Promise<void>((resolve) => {
          img.onload = () => {
            images[part.name] = img
            // Initialize positions in a grid layout
            const index = parts.indexOf(part)
            const col = index % 3
            const row = Math.floor(index / 3)
            positions[part.name] = {
              x: 100 + col * 200,
              y: 100 + row * 200,
              width: Math.min(img.width, 150),
              height: Math.min(img.height, 150)
            }
            resolve()
          }
          img.onerror = () => resolve()
          img.src = `/api/admin/characters/${characterId}/parts/${part.name}`
        })
      }
      
      setPartImages(images)
      setPartPositions(positions)
    }
    
    if (parts.length > 0) {
      loadImages()
    }
  }, [parts])


  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Clear canvas
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Draw grid
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
    
    // Sort parts by z-index for rendering
    const sortedParts = [...editedParts].sort((a, b) => a.z_index - b.z_index)
    
    // Draw connections first
    ctx.strokeStyle = '#4f46e5'
    ctx.lineWidth = 2
    for (const part of sortedParts) {
      const pos = partPositions[part.name]
      if (!pos) continue
      
      for (const connectedName of part.connections) {
        const connectedPos = partPositions[connectedName]
        if (!connectedPos) continue
        
        const startX = pos.x + pos.width * part.pivot_x
        const startY = pos.y + pos.height * part.pivot_y
        const endPart = editedParts.find(p => p.name === connectedName)
        if (!endPart) continue
        
        const endX = connectedPos.x + connectedPos.width * endPart.pivot_x
        const endY = connectedPos.y + connectedPos.height * endPart.pivot_y
        
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)
        ctx.stroke()
      }
    }
    
    // Draw parts
    for (const part of sortedParts) {
      const img = partImages[part.name]
      const pos = partPositions[part.name]
      if (!img || !pos) continue
      
      // Draw part image
      ctx.drawImage(img, pos.x, pos.y, pos.width, pos.height)
      
      // Draw selection border
      if (selectedPart === part.name) {
        ctx.strokeStyle = '#4f46e5'
        ctx.lineWidth = 2
        ctx.strokeRect(pos.x - 2, pos.y - 2, pos.width + 4, pos.height + 4)
      }
      
      // Draw pivot point
      const pivotX = pos.x + pos.width * part.pivot_x
      const pivotY = pos.y + pos.height * part.pivot_y
      
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2)
      ctx.stroke()
      
      // Draw part label
      ctx.fillStyle = '#374151'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(PART_LABELS[part.name] || part.name, pos.x + pos.width / 2, pos.y + pos.height + 16)
    }
    
    // Draw connection line being created
    if (connectionStart && dragState.type === 'connection') {
      const startPos = partPositions[connectionStart]
      const startPart = editedParts.find(p => p.name === connectionStart)
      if (startPos && startPart) {
        ctx.strokeStyle = '#4f46e5'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(
          startPos.x + startPos.width * startPart.pivot_x,
          startPos.y + startPos.height * startPart.pivot_y
        )
        ctx.lineTo(dragState.startX, dragState.startY)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }, [editedParts, partImages, partPositions, selectedPart, connectionStart, dragState])

  useEffect(() => {
    draw()
  }, [draw])

  const getPartAtPosition = (x: number, y: number): string | null => {
    // Check in reverse z-index order (top to bottom)
    const sortedParts = [...editedParts].sort((a, b) => b.z_index - a.z_index)
    
    for (const part of sortedParts) {
      const pos = partPositions[part.name]
      if (!pos) continue
      
      if (x >= pos.x && x <= pos.x + pos.width &&
          y >= pos.y && y <= pos.y + pos.height) {
        return part.name
      }
    }
    return null
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const partName = getPartAtPosition(x, y)
    
    if (mode === 'connection' && partName) {
      setConnectionStart(partName)
      setDragState({
        partName,
        type: 'connection',
        startX: x,
        startY: y,
        offsetX: 0,
        offsetY: 0
      })
    } else if (mode === 'pivot' && partName) {
      // Set pivot point directly on click
      const pos = partPositions[partName]
      if (pos) {
        const pivotX = (x - pos.x) / pos.width
        const pivotY = (y - pos.y) / pos.height
        
        setEditedParts(prev => prev.map(p =>
          p.name === partName
            ? { ...p, pivot_x: Math.max(0, Math.min(1, pivotX)), pivot_y: Math.max(0, Math.min(1, pivotY)) }
            : p
        ))
      }
    } else if (mode === 'move' && partName) {
      const pos = partPositions[partName]
      if (pos) {
        setDragState({
          partName,
          type: 'move',
          startX: x,
          startY: y,
          offsetX: x - pos.x,
          offsetY: y - pos.y
        })
      }
    }
    
    setSelectedPart(partName)
  }


  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !dragState.partName) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    if (dragState.type === 'move') {
      setPartPositions(prev => ({
        ...prev,
        [dragState.partName!]: {
          ...prev[dragState.partName!],
          x: x - dragState.offsetX,
          y: y - dragState.offsetY
        }
      }))
    } else if (dragState.type === 'connection') {
      setDragState(prev => ({ ...prev, startX: x, startY: y }))
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragState.type === 'connection' && connectionStart) {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        
        const targetPart = getPartAtPosition(x, y)
        if (targetPart && targetPart !== connectionStart) {
          // Add connection
          setEditedParts(prev => prev.map(p =>
            p.name === connectionStart && !p.connections.includes(targetPart)
              ? { ...p, connections: [...p.connections, targetPart] }
              : p
          ))
        }
      }
    }
    
    setDragState({
      partName: null,
      type: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0
    })
    setConnectionStart(null)
  }

  const handleZIndexChange = (partName: string, zIndex: number) => {
    setEditedParts(prev => prev.map(p =>
      p.name === partName ? { ...p, z_index: zIndex } : p
    ))
  }

  const removeConnection = (fromPart: string, toPart: string) => {
    setEditedParts(prev => prev.map(p =>
      p.name === fromPart
        ? { ...p, connections: p.connections.filter(c => c !== toPart) }
        : p
    ))
  }

  const handleSave = () => {
    onSave(editedParts)
  }

  const selectedPartData = editedParts.find(p => p.name === selectedPart)

  return (
    <div className="pivot-editor">
      <div className="editor-toolbar">
        <div className="mode-buttons">
          <button
            className={`mode-btn ${mode === 'move' ? 'active' : ''}`}
            onClick={() => setMode('move')}
          >
            ✋ 移动
          </button>
          <button
            className={`mode-btn ${mode === 'pivot' ? 'active' : ''}`}
            onClick={() => setMode('pivot')}
          >
            🎯 设置枢轴
          </button>
          <button
            className={`mode-btn ${mode === 'connection' ? 'active' : ''}`}
            onClick={() => setMode('connection')}
          >
            🔗 连接
          </button>
        </div>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      <div className="editor-content">
        <div className="canvas-container" ref={containerRef}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        <div className="editor-sidebar">
          <div className="sidebar-section">
            <h3>操作说明</h3>
            <ul className="instructions">
              <li><strong>移动模式:</strong> 拖拽部件调整位置</li>
              <li><strong>枢轴模式:</strong> 点击部件设置旋转中心点</li>
              <li><strong>连接模式:</strong> 从一个部件拖拽到另一个部件创建连接</li>
            </ul>
          </div>

          {selectedPartData && (
            <div className="sidebar-section">
              <h3>选中: {PART_LABELS[selectedPartData.name] || selectedPartData.name}</h3>
              
              <div className="property-group">
                <label>Z-Index (渲染顺序)</label>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={selectedPartData.z_index}
                  onChange={(e) => handleZIndexChange(selectedPartData.name, parseInt(e.target.value))}
                />
                <span className="value">{selectedPartData.z_index}</span>
              </div>

              <div className="property-group">
                <label>枢轴点</label>
                <div className="pivot-values">
                  <span>X: {(selectedPartData.pivot_x * 100).toFixed(0)}%</span>
                  <span>Y: {(selectedPartData.pivot_y * 100).toFixed(0)}%</span>
                </div>
              </div>

              {selectedPartData.connections.length > 0 && (
                <div className="property-group">
                  <label>连接</label>
                  <div className="connections-list">
                    {selectedPartData.connections.map(conn => (
                      <div key={conn} className="connection-item">
                        <span>{PART_LABELS[conn] || conn}</span>
                        <button
                          className="btn-remove-conn"
                          onClick={() => removeConnection(selectedPartData.name, conn)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="sidebar-section">
            <h3>渲染顺序预览</h3>
            <div className="z-order-list">
              {[...editedParts]
                .sort((a, b) => b.z_index - a.z_index)
                .map((part, index) => (
                  <div
                    key={part.name}
                    className={`z-order-item ${selectedPart === part.name ? 'selected' : ''}`}
                    onClick={() => setSelectedPart(part.name)}
                  >
                    <span className="z-order-rank">{index + 1}</span>
                    <span className="z-order-name">{PART_LABELS[part.name] || part.name}</span>
                    <span className="z-order-value">z:{part.z_index}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
