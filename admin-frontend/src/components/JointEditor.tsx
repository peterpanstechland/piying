import { useState, useRef, useEffect, useCallback } from 'react'
import './JointEditor.css'

interface Joint {
  id: string
  name: string
  x: number
  y: number
  connectedTo?: string
}

interface CharacterPart {
  name: string
  file_path: string
  pivot_x: number
  pivot_y: number
  z_index: number
  connections: string[]
  joints?: Joint[]
  editor_x?: number | null
  editor_y?: number | null
  editor_width?: number | null
  editor_height?: number | null
  // 关节锚点（用于旋转动画）
  joint_pivot_x?: number | null
  joint_pivot_y?: number | null
  // 旋转偏移量（根据素材朝向，弧度）
  rotation_offset?: number | null
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
  originalWidth: number
  originalHeight: number
}

const PART_LABELS: Record<string, string> = {
  head: '头部', body: '身体', 'left-arm': '左臂', 'right-arm': '右臂',
  'left-hand': '左手', 'right-hand': '右手', 'left-foot': '左脚',
  'right-foot': '右脚', 'upper-leg': '大腿'
}

const SUGGESTED_JOINTS: Record<string, { name: string; x: number; y: number }[]> = {
  body: [
    { name: '头部连接点', x: 0.5, y: 0.1 },
    { name: '左臂连接点', x: 0.15, y: 0.2 },
    { name: '右臂连接点', x: 0.85, y: 0.2 },
    { name: '腿部连接点', x: 0.5, y: 0.95 },
  ],
  head: [{ name: '颈部连接点', x: 0.5, y: 0.9 }],
  'left-arm': [{ name: '肩部连接点', x: 0.8, y: 0.2 }, { name: '手部连接点', x: 0.2, y: 0.8 }],
  'right-arm': [{ name: '肩部连接点', x: 0.2, y: 0.2 }, { name: '手部连接点', x: 0.8, y: 0.8 }],
  'left-hand': [{ name: '腕部连接点', x: 0.8, y: 0.2 }],
  'right-hand': [{ name: '腕部连接点', x: 0.2, y: 0.2 }],
  'upper-leg': [{ name: '髋部连接点', x: 0.5, y: 0.1 }, { name: '左脚连接点', x: 0.3, y: 0.9 }, { name: '右脚连接点', x: 0.7, y: 0.9 }],
  'left-foot': [{ name: '踝部连接点', x: 0.5, y: 0.1 }],
  'right-foot': [{ name: '踝部连接点', x: 0.5, y: 0.1 }],
}

type Mode = 'move' | 'pan' | 'add-joint' | 'edit-joint' | 'connect' | 'set-pivot'
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | null

export default function JointEditor({ characterId, parts, onSave, saving }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [editedParts, setEditedParts] = useState<CharacterPart[]>([])
  const [partPositions, setPartPositions] = useState<Record<string, PartPosition>>({})
  const [partImages, setPartImages] = useState<Record<string, HTMLImageElement>>({})
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('move')
  const [zoom, setZoom] = useState(0.4)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [dragState, setDragState] = useState<{
    type: 'part' | 'joint' | 'resize' | 'connect' | null
    partName: string | null
    jointId: string | null
    resizeHandle: ResizeHandle
    startX: number; startY: number; startWidth: number; startHeight: number
    offsetX: number; offsetY: number
  }>({ type: null, partName: null, jointId: null, resizeHandle: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0, offsetX: 0, offsetY: 0 })
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)

  const screenToWorld = (sx: number, sy: number) => ({ x: (sx - panOffset.x) / zoom, y: (sy - panOffset.y) / zoom })

  useEffect(() => { 
    setEditedParts(parts.map(p => ({ 
      ...p, 
      joints: p.joints || [],
      joint_pivot_x: p.joint_pivot_x ?? null,
      joint_pivot_y: p.joint_pivot_y ?? null,
      rotation_offset: p.rotation_offset ?? null,
    }))) 
  }, [parts])

  useEffect(() => {
    const loadImages = async () => {
      const images: Record<string, HTMLImageElement> = {}
      const positions: Record<string, PartPosition> = {}
      let hasSavedPositions = false
      
      // Default humanoid layout positions (centered around 400, 400)
      const defaultLayout: Record<string, { x: number; y: number }> = {
        'head': { x: 350, y: 50 },
        'body': { x: 300, y: 200 },
        'left-arm': { x: 150, y: 180 },
        'right-arm': { x: 450, y: 180 },
        'left-hand': { x: 80, y: 320 },
        'right-hand': { x: 520, y: 320 },
        'upper-leg': { x: 300, y: 450 },
        'left-foot': { x: 280, y: 600 },
        'right-foot': { x: 420, y: 600 },
      }
      
      for (const part of parts) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve) => {
          img.onload = () => {
            images[part.name] = img
            // Use saved position if available
            if (part.editor_x != null && part.editor_y != null) {
              hasSavedPositions = true
              positions[part.name] = {
                x: part.editor_x,
                y: part.editor_y,
                width: part.editor_width ?? img.width,
                height: part.editor_height ?? img.height,
                originalWidth: img.width,
                originalHeight: img.height
              }
            } else {
              // Use default humanoid layout or fallback
              const defaultPos = defaultLayout[part.name] || { x: 400, y: 400 }
              positions[part.name] = {
                x: defaultPos.x,
                y: defaultPos.y,
                width: img.width,
                height: img.height,
                originalWidth: img.width,
                originalHeight: img.height
              }
            }
            resolve()
          }
          img.onerror = () => resolve()
          img.src = `/api/admin/characters/${characterId}/parts/${part.name}`
        })
      }
      setPartImages(images)
      setPartPositions(positions)
      
      // Auto-center if no saved positions
      if (!hasSavedPositions && Object.keys(positions).length > 0) {
        // Calculate center after a short delay to ensure state is updated
        setTimeout(() => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const pos of Object.values(positions)) {
            minX = Math.min(minX, pos.x)
            minY = Math.min(minY, pos.y)
            maxX = Math.max(maxX, pos.x + pos.width)
            maxY = Math.max(maxY, pos.y + pos.height)
          }
          const centerX = (minX + maxX) / 2
          const centerY = (minY + maxY) / 2
          setPanOffset({ x: 400 - centerX * 0.4, y: 300 - centerY * 0.4 })
        }, 100)
      }
    }
    if (parts.length > 0) loadImages()
  }, [parts, characterId])

  const generateJointId = () => `joint_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`


  const addJoint = (partName: string, x: number, y: number, name?: string) => {
    const jointId = generateJointId()
    setEditedParts(prev => prev.map(p => p.name !== partName ? p : { ...p, joints: [...(p.joints || []), { id: jointId, name: name || `关节点 ${(p.joints || []).length + 1}`, x, y }] }))
    setSelectedJoint(`${partName}:${jointId}`)
  }

  const removeJoint = (partName: string, jointId: string) => {
    const jointKey = `${partName}:${jointId}`
    setEditedParts(prev => prev.map(p => {
      let updated = { ...p }
      if (p.name === partName) updated.joints = (p.joints || []).filter(j => j.id !== jointId)
      updated.joints = (updated.joints || []).map(j => ({ ...j, connectedTo: j.connectedTo === jointKey ? undefined : j.connectedTo }))
      return updated
    }))
    if (selectedJoint === jointKey) setSelectedJoint(null)
  }

  const updateJointPosition = (partName: string, jointId: string, x: number, y: number) => {
    setEditedParts(prev => prev.map(p => p.name !== partName ? p : { ...p, joints: (p.joints || []).map(j => j.id === jointId ? { ...j, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } : j) }))
  }

  const updateJointName = (partName: string, jointId: string, name: string) => {
    setEditedParts(prev => prev.map(p => p.name !== partName ? p : { ...p, joints: (p.joints || []).map(j => j.id === jointId ? { ...j, name } : j) }))
  }

  const connectJoints = (fromKey: string, toKey: string) => {
    const [fromPart, fromJointId] = fromKey.split(':')
    setEditedParts(prev => prev.map(p => p.name !== fromPart ? p : { ...p, joints: (p.joints || []).map(j => j.id === fromJointId ? { ...j, connectedTo: toKey } : j) }))
  }

  const disconnectJoint = (partName: string, jointId: string) => {
    setEditedParts(prev => prev.map(p => p.name !== partName ? p : { ...p, joints: (p.joints || []).map(j => j.id === jointId ? { ...j, connectedTo: undefined } : j) }))
  }

  const applySuggestedJoints = (partName: string) => {
    const suggestions = SUGGESTED_JOINTS[partName]
    if (!suggestions) return
    setEditedParts(prev => prev.map(p => p.name !== partName ? p : { ...p, joints: suggestions.map(s => ({ id: generateJointId(), name: s.name, x: s.x, y: s.y })) }))
  }

  const getResizeHandle = (x: number, y: number, pos: PartPosition): ResizeHandle => {
    const hs = 15 / zoom
    const corners: Record<string, { x: number; y: number }> = { nw: { x: pos.x, y: pos.y }, ne: { x: pos.x + pos.width, y: pos.y }, sw: { x: pos.x, y: pos.y + pos.height }, se: { x: pos.x + pos.width, y: pos.y + pos.height } }
    for (const [h, c] of Object.entries(corners)) { if (Math.abs(x - c.x) < hs && Math.abs(y - c.y) < hs) return h as ResizeHandle }
    return null
  }

  const getJointAtPosition = (x: number, y: number): string | null => {
    for (const part of editedParts) {
      const pos = partPositions[part.name]
      if (!pos) continue
      for (const joint of (part.joints || [])) {
        const jx = pos.x + pos.width * joint.x, jy = pos.y + pos.height * joint.y
        if (Math.sqrt((x - jx) ** 2 + (y - jy) ** 2) < 15 / zoom) return `${part.name}:${joint.id}`
      }
    }
    return null
  }

  const getPartAtPosition = (x: number, y: number): string | null => {
    for (const part of [...editedParts].sort((a, b) => b.z_index - a.z_index)) {
      const pos = partPositions[part.name]
      if (pos && x >= pos.x && x <= pos.x + pos.width && y >= pos.y && y <= pos.y + pos.height) return part.name
    }
    return null
  }


  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    // Grid
    ctx.strokeStyle = '#2d2d44'
    ctx.lineWidth = 1 / zoom
    const gs = 50
    for (let x = 0; x < 3000; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 3000); ctx.stroke() }
    for (let y = 0; y < 3000; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(3000, y); ctx.stroke() }

    const sortedParts = [...editedParts].sort((a, b) => a.z_index - b.z_index)

    // Connections
    ctx.strokeStyle = '#4f46e5'
    ctx.lineWidth = 3 / zoom
    for (const part of sortedParts) {
      const pos = partPositions[part.name]
      if (!pos) continue
      for (const joint of (part.joints || [])) {
        if (!joint.connectedTo) continue
        const [tp, tjId] = joint.connectedTo.split(':')
        const tpd = editedParts.find(p => p.name === tp)
        const tpos = partPositions[tp]
        const tj = tpd?.joints?.find(j => j.id === tjId)
        if (!tpos || !tj) continue
        ctx.beginPath()
        ctx.moveTo(pos.x + pos.width * joint.x, pos.y + pos.height * joint.y)
        ctx.lineTo(tpos.x + tpos.width * tj.x, tpos.y + tpos.height * tj.y)
        ctx.stroke()
      }
    }

    // Parts
    for (const part of sortedParts) {
      const img = partImages[part.name], pos = partPositions[part.name]
      if (!img || !pos) continue
      ctx.drawImage(img, pos.x, pos.y, pos.width, pos.height)

      if (selectedPart === part.name) {
        ctx.strokeStyle = '#4f46e5'
        ctx.lineWidth = 3 / zoom
        ctx.setLineDash([8 / zoom, 8 / zoom])
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height)
        ctx.setLineDash([])
        const hs = 12 / zoom
        ctx.fillStyle = '#4f46e5'
        for (const c of [{ x: pos.x, y: pos.y }, { x: pos.x + pos.width, y: pos.y }, { x: pos.x, y: pos.y + pos.height }, { x: pos.x + pos.width, y: pos.y + pos.height }]) {
          ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs)
        }
      }

      for (const joint of (part.joints || [])) {
        const jx = pos.x + pos.width * joint.x, jy = pos.y + pos.height * joint.y
        const isSel = selectedJoint === `${part.name}:${joint.id}`
        ctx.beginPath()
        ctx.arc(jx, jy, (isSel ? 12 : 10) / zoom, 0, Math.PI * 2)
        ctx.fillStyle = isSel ? '#dc2626' : '#22c55e'
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 2 / zoom
        ctx.stroke()
        ctx.fillStyle = 'white'
        ctx.font = `${14 / zoom}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(joint.name, jx, jy - 16 / zoom)
      }

      // Draw joint pivot point (旋转锚点) - 用蓝色菱形表示
      if (part.joint_pivot_x != null && part.joint_pivot_y != null) {
        const jpx = pos.x + pos.width * part.joint_pivot_x
        const jpy = pos.y + pos.height * part.joint_pivot_y
        ctx.save()
        ctx.translate(jpx, jpy)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = '#3b82f6'
        ctx.fillRect(-8 / zoom, -8 / zoom, 16 / zoom, 16 / zoom)
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 2 / zoom
        ctx.strokeRect(-8 / zoom, -8 / zoom, 16 / zoom, 16 / zoom)
        ctx.restore()
      }

      ctx.fillStyle = '#9ca3af'
      ctx.font = `${14 / zoom}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(PART_LABELS[part.name] || part.name, pos.x + pos.width / 2, pos.y + pos.height + 22 / zoom)
    }

    // Draw connecting line when in connect mode
    if (connectingFrom && dragState.type === 'connect') {
      const [fromPart, fromJointId] = connectingFrom.split(':')
      const fromPartData = editedParts.find(p => p.name === fromPart)
      const fromPos = partPositions[fromPart]
      const fromJoint = fromPartData?.joints?.find(j => j.id === fromJointId)
      if (fromPos && fromJoint) {
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 3 / zoom
        ctx.setLineDash([8 / zoom, 8 / zoom])
        ctx.beginPath()
        ctx.moveTo(fromPos.x + fromPos.width * fromJoint.x, fromPos.y + fromPos.height * fromJoint.y)
        ctx.lineTo(dragState.offsetX, dragState.offsetY)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    ctx.restore()
    ctx.fillStyle = '#9ca3af'
    ctx.font = '13px sans-serif'
    ctx.fillText(`缩放: ${Math.round(zoom * 100)}% | 滚轮缩放, 右键拖拽平移`, 10, canvas.height - 10)
  }, [editedParts, partImages, partPositions, selectedPart, selectedJoint, zoom, panOffset, connectingFrom, dragState])

  useEffect(() => { draw() }, [draw])

  // Use native event listener for wheel to avoid passive listener issue
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault()
      const newZoom = Math.max(0.1, Math.min(2, zoom * (e.deltaY > 0 ? 0.9 : 1.1)))
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const wx = (mx - panOffset.x) / zoom, wy = (my - panOffset.y) / zoom
      setPanOffset({ x: mx - wx * newZoom, y: my - wy * newZoom })
      setZoom(newZoom)
    }
    
    canvas.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheelNative)
  }, [zoom, panOffset])


  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const { x, y } = screenToWorld(sx, sy)

    if (e.button === 2 || mode === 'pan') {
      setIsPanning(true)
      setPanStart({ x: sx - panOffset.x, y: sy - panOffset.y })
      return
    }

    if (selectedPart) {
      const pos = partPositions[selectedPart]
      if (pos) {
        const handle = getResizeHandle(x, y, pos)
        if (handle) {
          setDragState({ type: 'resize', partName: selectedPart, jointId: null, resizeHandle: handle, startX: x, startY: y, startWidth: pos.width, startHeight: pos.height, offsetX: pos.x, offsetY: pos.y })
          return
        }
      }
    }

    const jointKey = getJointAtPosition(x, y)
    const partName = getPartAtPosition(x, y)

    if (mode === 'set-pivot' && partName) {
      // 设置旋转锚点模式：点击部件设置 joint_pivot
      const pos = partPositions[partName]
      if (pos) {
        const pivotX = Math.max(0, Math.min(1, (x - pos.x) / pos.width))
        const pivotY = Math.max(0, Math.min(1, (y - pos.y) / pos.height))
        setEditedParts(prev => prev.map(p => 
          p.name === partName 
            ? { ...p, joint_pivot_x: pivotX, joint_pivot_y: pivotY } 
            : p
        ))
      }
      setSelectedPart(partName)
    } else if (mode === 'add-joint' && partName) {
      const pos = partPositions[partName]
      if (pos) addJoint(partName, (x - pos.x) / pos.width, (y - pos.y) / pos.height)
      setSelectedPart(partName)
    } else if (mode === 'edit-joint' && jointKey) {
      setSelectedJoint(jointKey)
      const [pn, jid] = jointKey.split(':')
      setSelectedPart(pn)
      setDragState({ type: 'joint', partName: pn, jointId: jid, resizeHandle: null, startX: x, startY: y, startWidth: 0, startHeight: 0, offsetX: x, offsetY: y })
    } else if (mode === 'connect' && jointKey) {
      setConnectingFrom(jointKey)
      setDragState({ type: 'connect', partName: null, jointId: null, resizeHandle: null, startX: x, startY: y, startWidth: 0, startHeight: 0, offsetX: x, offsetY: y })
    } else if (mode === 'move' && partName) {
      const pos = partPositions[partName]
      if (pos) setDragState({ type: 'part', partName, jointId: null, resizeHandle: null, startX: x, startY: y, startWidth: 0, startHeight: 0, offsetX: x - pos.x, offsetY: y - pos.y })
      setSelectedPart(partName)
      setSelectedJoint(null)
    } else {
      setSelectedPart(partName)
      setSelectedJoint(jointKey)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const { x, y } = screenToWorld(sx, sy)

    if (isPanning) {
      setPanOffset({ x: sx - panStart.x, y: sy - panStart.y })
      return
    }

    if (dragState.type === 'part' && dragState.partName) {
      setPartPositions(prev => ({ ...prev, [dragState.partName!]: { ...prev[dragState.partName!], x: x - dragState.offsetX, y: y - dragState.offsetY } }))
    } else if (dragState.type === 'resize' && dragState.partName && dragState.resizeHandle) {
      const pos = partPositions[dragState.partName]
      if (!pos) return
      const dx = x - dragState.startX
      const ratio = pos.originalWidth / pos.originalHeight
      let nw = dragState.startWidth, nh = dragState.startHeight, nx = dragState.offsetX, ny = dragState.offsetY
      if (dragState.resizeHandle === 'se') { nw = Math.max(30, dragState.startWidth + dx); nh = nw / ratio }
      else if (dragState.resizeHandle === 'sw') { nw = Math.max(30, dragState.startWidth - dx); nh = nw / ratio; nx = dragState.offsetX + dragState.startWidth - nw }
      else if (dragState.resizeHandle === 'ne') { nw = Math.max(30, dragState.startWidth + dx); nh = nw / ratio; ny = dragState.offsetY + dragState.startHeight - nh }
      else if (dragState.resizeHandle === 'nw') { nw = Math.max(30, dragState.startWidth - dx); nh = nw / ratio; nx = dragState.offsetX + dragState.startWidth - nw; ny = dragState.offsetY + dragState.startHeight - nh }
      setPartPositions(prev => ({ ...prev, [dragState.partName!]: { ...prev[dragState.partName!], x: nx, y: ny, width: nw, height: nh } }))
    } else if (dragState.type === 'joint' && dragState.partName && dragState.jointId) {
      const pos = partPositions[dragState.partName]
      if (pos) updateJointPosition(dragState.partName, dragState.jointId, (x - pos.x) / pos.width, (y - pos.y) / pos.height)
    } else if (dragState.type === 'connect' && connectingFrom) {
      setDragState(prev => ({ ...prev, offsetX: x, offsetY: y }))
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) { setIsPanning(false); return }
    if (connectingFrom && mode === 'connect') {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
        const target = getJointAtPosition(x, y)
        if (target && target !== connectingFrom) connectJoints(connectingFrom, target)
      }
      setConnectingFrom(null)
    }
    setDragState({ type: null, partName: null, jointId: null, resizeHandle: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0, offsetX: 0, offsetY: 0 })
  }

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault()

  const selectedPartData = editedParts.find(p => p.name === selectedPart)
  const selectedJointData = selectedJoint ? (() => { const [pn, jid] = selectedJoint.split(':'); return editedParts.find(p => p.name === pn)?.joints?.find(j => j.id === jid) })() : null


  return (
    <div className="joint-editor">
      <div className="editor-toolbar">
        <div className="mode-buttons">
          <button className={`mode-btn ${mode === 'move' ? 'active' : ''}`} onClick={() => setMode('move')}>✋ 移动</button>
          <button className={`mode-btn ${mode === 'pan' ? 'active' : ''}`} onClick={() => setMode('pan')}>🖐 平移</button>
          <button className={`mode-btn ${mode === 'add-joint' ? 'active' : ''}`} onClick={() => setMode('add-joint')}>➕ 添加关节</button>
          <button className={`mode-btn ${mode === 'edit-joint' ? 'active' : ''}`} onClick={() => setMode('edit-joint')}>🎯 编辑关节</button>
          <button className={`mode-btn ${mode === 'connect' ? 'active' : ''}`} onClick={() => setMode('connect')}>🔗 连接</button>
          <button className={`mode-btn ${mode === 'set-pivot' ? 'active' : ''}`} onClick={() => setMode('set-pivot')}>⚙️ 旋转锚点</button>
        </div>
        <div className="zoom-controls">
          <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))}>+</button>
          <button onClick={() => {
            // Center all parts in view
            if (Object.keys(partPositions).length > 0) {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
              for (const pos of Object.values(partPositions)) {
                minX = Math.min(minX, pos.x)
                minY = Math.min(minY, pos.y)
                maxX = Math.max(maxX, pos.x + pos.width)
                maxY = Math.max(maxY, pos.y + pos.height)
              }
              const centerX = (minX + maxX) / 2
              const centerY = (minY + maxY) / 2
              setZoom(0.4)
              setPanOffset({ x: 400 - centerX * 0.4, y: 300 - centerY * 0.4 })
            }
          }}>居中</button>
          <button onClick={() => { setZoom(0.4); setPanOffset({ x: 0, y: 0 }) }}>重置</button>
        </div>
        <button className="btn-primary" onClick={() => {
          // Include position data when saving
          const partsWithPositions = editedParts.map(part => {
            const pos = partPositions[part.name]
            return {
              ...part,
              editor_x: pos?.x ?? null,
              editor_y: pos?.y ?? null,
              editor_width: pos?.width ?? null,
              editor_height: pos?.height ?? null,
            }
          })
          onSave(partsWithPositions)
        }} disabled={saving}>{saving ? '保存中...' : '保存配置'}</button>
      </div>

      <div className="editor-content">
        <div className="canvas-container">
          <canvas ref={canvasRef} width={800} height={600} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={handleContextMenu} />
        </div>

        <div className="editor-sidebar">
          <div className="sidebar-section">
            <h3>操作说明</h3>
            <ul className="instructions">
              <li><strong>移动:</strong> 拖拽部件</li>
              <li><strong>平移:</strong> 拖拽画布或右键拖拽</li>
              <li><strong>缩放:</strong> 滚轮或按钮</li>
              <li><strong>调整大小:</strong> 选中后拖拽四角</li>
              <li><strong>添加关节:</strong> 点击部件</li>
              <li><strong>编辑关节:</strong> 拖拽关节点</li>
              <li><strong>连接:</strong> 从一个关节拖到另一个</li>
              <li><strong>旋转锚点:</strong> 点击设置动画旋转中心</li>
            </ul>
          </div>

          {selectedPartData && (
            <div className="sidebar-section">
              <h3>{PART_LABELS[selectedPartData.name] || selectedPartData.name}</h3>
              <div className="property-group">
                <label>Z-Index</label>
                <input type="range" min="0" max="20" value={selectedPartData.z_index} onChange={(e) => setEditedParts(prev => prev.map(p => p.name === selectedPartData.name ? { ...p, z_index: parseInt(e.target.value) } : p))} />
                <span className="value">{selectedPartData.z_index}</span>
              </div>
              {partPositions[selectedPartData.name] && (
                <div className="property-group">
                  <label>尺寸: {Math.round(partPositions[selectedPartData.name].width)} × {Math.round(partPositions[selectedPartData.name].height)}</label>
                  <button className="btn-small" onClick={() => { const pos = partPositions[selectedPartData.name]; setPartPositions(prev => ({ ...prev, [selectedPartData.name]: { ...pos, width: pos.originalWidth, height: pos.originalHeight } })) }}>重置大小</button>
                </div>
              )}
              <div className="property-group">
                <label>旋转锚点 (动画用)</label>
                <div className="pivot-inputs">
                  <label>
                    X: 
                    <input 
                      type="number" 
                      min="0" max="1" step="0.05"
                      value={selectedPartData.joint_pivot_x ?? 0.5} 
                      onChange={(e) => setEditedParts(prev => prev.map(p => 
                        p.name === selectedPartData.name 
                          ? { ...p, joint_pivot_x: parseFloat(e.target.value) || 0.5 } 
                          : p
                      ))}
                      style={{ width: '60px', marginLeft: '4px' }}
                    />
                  </label>
                  <label style={{ marginLeft: '8px' }}>
                    Y: 
                    <input 
                      type="number" 
                      min="0" max="1" step="0.05"
                      value={selectedPartData.joint_pivot_y ?? 0.5} 
                      onChange={(e) => setEditedParts(prev => prev.map(p => 
                        p.name === selectedPartData.name 
                          ? { ...p, joint_pivot_y: parseFloat(e.target.value) || 0.5 } 
                          : p
                      ))}
                      style={{ width: '60px', marginLeft: '4px' }}
                    />
                  </label>
                </div>
                <small style={{ color: '#9ca3af', fontSize: '11px' }}>点击"旋转锚点"模式可视化设置</small>
              </div>

              <div className="property-group">
                <label>旋转偏移 (弧度)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="range" 
                    min="0" max="6.28" step="0.1"
                    value={selectedPartData.rotation_offset ?? 1.57} 
                    onChange={(e) => setEditedParts(prev => prev.map(p => 
                      p.name === selectedPartData.name 
                        ? { ...p, rotation_offset: parseFloat(e.target.value) } 
                        : p
                    ))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ minWidth: '50px' }}>{(selectedPartData.rotation_offset ?? 1.57).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  <button className="btn-small" onClick={() => setEditedParts(prev => prev.map(p => p.name === selectedPartData.name ? { ...p, rotation_offset: 0 } : p))}>0°</button>
                  <button className="btn-small" onClick={() => setEditedParts(prev => prev.map(p => p.name === selectedPartData.name ? { ...p, rotation_offset: Math.PI / 2 } : p))}>90°</button>
                  <button className="btn-small" onClick={() => setEditedParts(prev => prev.map(p => p.name === selectedPartData.name ? { ...p, rotation_offset: Math.PI } : p))}>180°</button>
                </div>
                <small style={{ color: '#9ca3af', fontSize: '11px' }}>素材朝向: 0=右, 90°=下, 180°=左</small>
              </div>

              <div className="property-group">
                <div className="group-header">
                  <label>关节点 ({(selectedPartData.joints || []).length})</label>
                  <button className="btn-small" onClick={() => applySuggestedJoints(selectedPartData.name)}>应用推荐</button>
                </div>
                <div className="joints-list">
                  {(selectedPartData.joints || []).map(joint => (
                    <div key={joint.id} className={`joint-item ${selectedJoint === `${selectedPartData.name}:${joint.id}` ? 'selected' : ''}`} onClick={() => setSelectedJoint(`${selectedPartData.name}:${joint.id}`)}>
                      <span className="joint-dot"></span>
                      <span className="joint-name">{joint.name}</span>
                      <button className="btn-remove-joint" onClick={(e) => { e.stopPropagation(); removeJoint(selectedPartData.name, joint.id) }}>×</button>
                    </div>
                  ))}
                  {(selectedPartData.joints || []).length === 0 && <p className="no-joints">暂无关节点</p>}
                </div>
              </div>
            </div>
          )}

          {selectedJointData && selectedJoint && (
            <div className="sidebar-section">
              <h3>关节详情</h3>
              <div className="property-group">
                <label>名称</label>
                <input type="text" value={selectedJointData.name} onChange={(e) => { const [pn, jid] = selectedJoint.split(':'); updateJointName(pn, jid, e.target.value) }} />
              </div>
              <div className="property-group">
                <label>位置: X {(selectedJointData.x * 100).toFixed(0)}%, Y {(selectedJointData.y * 100).toFixed(0)}%</label>
              </div>
              {selectedJointData.connectedTo && (
                <div className="property-group">
                  <label>已连接到: {PART_LABELS[selectedJointData.connectedTo.split(':')[0]] || selectedJointData.connectedTo.split(':')[0]}</label>
                  <button className="btn-disconnect" onClick={() => { const [pn, jid] = selectedJoint.split(':'); disconnectJoint(pn, jid) }}>断开</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
