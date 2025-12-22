/**
 * Rest Pose Editor Component
 * 允许管理员通过拖拽设置角色的默认姿势（自然下垂状态）
 * 
 * 功能：
 * 1. 显示角色预览
 * 2. 拖拽调整每个部件的角度
 * 3. 显示参考模板（标准皮影骨架）
 * 4. 保存配置到后端
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { CharacterRenderer } from '@shared/pixi'
import { adminApi } from '../services/api'
import './RestPoseEditor.css'

// 可调整的部件列表
const ADJUSTABLE_PARTS = [
  { id: 'left-arm', name: '左臂', description: '画面左侧的手臂' },
  { id: 'right-arm', name: '右臂', description: '画面右侧的手臂' },
  { id: 'left-hand', name: '左手', description: '画面左侧的手' },
  { id: 'right-hand', name: '右手', description: '画面右侧的手' },
  { id: 'left-thigh', name: '左腿', description: '画面左侧的腿（分体式）' },
  { id: 'right-thigh', name: '右腿', description: '画面右侧的腿（分体式）' },
  { id: 'left-foot', name: '左脚', description: '画面左侧的脚' },
  { id: 'right-foot', name: '右脚', description: '画面右侧的脚' },
]

interface Props {
  characterId: string
  onSave?: () => void
  onCancel?: () => void
}

export default function RestPoseEditor({ characterId, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CharacterRenderer | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableParts, setAvailableParts] = useState<string[]>([])
  const [restPoseOffsets, setRestPoseOffsets] = useState<Record<string, number>>({})
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [showJoints, setShowJoints] = useState(true) // 默认显示关节点
  const [spritesheetData, setSpritesheetData] = useState<Record<string, unknown> | null>(null)
  const [partRotations, setPartRotations] = useState<Record<string, number>>({}) // 实时旋转角度
  const [defaultFacing, setDefaultFacing] = useState<'left' | 'right'>('left') // 默认朝向

  // 初始化渲染器
  useEffect(() => {
    const initRenderer = async () => {
      if (!canvasRef.current) return

      try {
        setLoading(true)
        setError(null)

        const renderer = new CharacterRenderer()
        await renderer.init(canvasRef.current, 500, 600)
        
        const configUrl = adminApi.getCharacterConfigUrl(characterId)
        await renderer.loadCharacter(configUrl)
        
        rendererRef.current = renderer

        // 获取可用部件
        const parts = renderer.getPartNames()
        setAvailableParts(parts)

        // 获取当前的 restPoseOffsets 和 defaultFacing
        const config = await adminApi.getCharacterConfig(characterId)
        if (config.restPoseOffsets) {
          setRestPoseOffsets(config.restPoseOffsets)
        }
        if (config.defaultFacing) {
          setDefaultFacing(config.defaultFacing as 'left' | 'right')
        }

        // 加载 spritesheet 数据用于显示
        try {
          const sheetUrl = `${adminApi.getCharacterConfigUrl(characterId).replace('config.json', 'spritesheet.json')}?t=${Date.now()}`
          const sheetResponse = await fetch(sheetUrl)
          const sheetData = await sheetResponse.json()
          setSpritesheetData(sheetData)
        } catch (e) {
          console.warn('Failed to load spritesheet data:', e)
        }

        // 默认显示关节点
        renderer.setShowJoints(true)

        setLoading(false)
      } catch (err) {
        console.error('Failed to init renderer:', err)
        setError(err instanceof Error ? err.message : '加载失败')
        setLoading(false)
      }
    }

    initRenderer()

    return () => {
      rendererRef.current?.destroy()
      rendererRef.current = null
    }
  }, [characterId])

  // 更新部件角度
  const updatePartAngle = useCallback((partName: string, angle: number) => {
    const newOffsets = {
      ...restPoseOffsets,
      [partName]: angle
    }
    setRestPoseOffsets(newOffsets)
    
    // 实时更新渲染
    if (rendererRef.current) {
      // 直接设置该部件的角度（absolute=true 表示直接设置，不加偏移）
      rendererRef.current.setPartRotation(partName, angle, true)
      // 更新调试点位置
      rendererRef.current.updateDebugPoints()
      // 更新实时旋转角度显示
      setPartRotations(prev => ({ ...prev, [partName]: angle }))
    }
  }, [restPoseOffsets])

  // 鼠标拖拽处理
  const handleMouseDown = useCallback((_e: React.MouseEvent) => {
    if (!selectedPart || !canvasRef.current) return
    setIsDragging(true)
  }, [selectedPart])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !selectedPart || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const mouseX = e.clientX - rect.left - centerX
    const mouseY = e.clientY - rect.top - centerY

    // 计算角度
    const angle = Math.atan2(mouseY, mouseX)
    updatePartAngle(selectedPart, angle)
  }, [isDragging, selectedPart, updatePartAngle])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 滑块调整角度
  const handleSliderChange = useCallback((partName: string, value: number) => {
    const angle = (value / 180) * Math.PI
    updatePartAngle(partName, angle)
  }, [updatePartAngle])

  // 重置单个部件
  const resetPart = useCallback((partName: string) => {
    updatePartAngle(partName, 0)
  }, [updatePartAngle])

  // 重置所有部件
  const resetAll = useCallback(() => {
    setRestPoseOffsets({})
    // 重置到素材原始状态（所有角度为0）
    rendererRef.current?.resetPose()
  }, [])

  // 保存配置
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      
      // 先获取完整的角色数据
      const character = await adminApi.getCharacter(characterId)
      
      if (!character || !character.parts) {
        throw new Error('无法获取角色数据')
      }

      console.log('Current restPoseOffsets:', restPoseOffsets)
      console.log('Current defaultFacing:', defaultFacing)

      // 构建更新数据 - 保留原有数据，只更新 rest_pose_offset
      const partsToUpdate = character.parts.map((part: {
        name: string
        file_path: string
        pivot_x: number
        pivot_y: number
        z_index: number
        connections: string[]
        joints?: unknown[]
        rest_pose_offset?: number
      }) => ({
        ...part,
        rest_pose_offset: restPoseOffsets[part.name] ?? part.rest_pose_offset ?? 0
      }))

      // 调用 API 更新部件配置
      await adminApi.updateCharacterPivot(characterId, {
        parts: partsToUpdate
      })

      // 更新角色的默认朝向
      await adminApi.updateCharacter(characterId, {
        default_facing: defaultFacing
      })

      // 重新生成 spritesheet 以确保数据同步
      try {
        await adminApi.generateSpritesheet(characterId)
        console.log('Spritesheet regenerated')
      } catch (e) {
        console.warn('Failed to regenerate spritesheet:', e)
      }

      setSaving(false)
      onSave?.()
    } catch (err) {
      console.error('Failed to save:', err)
      setError(err instanceof Error ? err.message : '保存失败')
      setSaving(false)
    }
  }

  // 角度转换为度数显示
  const radToDeg = (rad: number) => Math.round((rad / Math.PI) * 180)

  return (
    <div className="rest-pose-editor">
      <div className="editor-header">
        <h3>🎭 默认姿势编辑器</h3>
        <p className="editor-description">
          调整各部件的角度，设置角色的"自然下垂"状态。
          这个姿势将作为动画的基准点（0度）。
        </p>
      </div>

      <div className="editor-content">
        {/* 左侧：画布 */}
        <div className="canvas-section">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : selectedPart ? 'grab' : 'default' }}
          />
          {loading && <div className="loading-overlay">加载中...</div>}
          {error && <div className="error-overlay">{error}</div>}
          
          {/* 参考指南 */}
          {showGuide && (
            <div className="guide-overlay">
              <div className="guide-content">
                <p>💡 提示：选择一个部件，然后拖拽画布或使用滑块调整角度</p>
                <button onClick={() => setShowGuide(false)}>知道了</button>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：控制面板 */}
        <div className="control-panel">
          {/* 默认朝向设置 */}
          <div className="panel-section facing-section">
            <h4>🧭 默认朝向</h4>
            <div className="facing-selector">
              <button
                className={`facing-btn ${defaultFacing === 'left' ? 'active' : ''}`}
                onClick={() => setDefaultFacing('left')}
              >
                ← 面向左
              </button>
              <button
                className={`facing-btn ${defaultFacing === 'right' ? 'active' : ''}`}
                onClick={() => setDefaultFacing('right')}
              >
                面向右 →
              </button>
            </div>
            <p className="facing-hint">
              素材绘制时角色面向的方向，影响动画旋转方向计算
            </p>
          </div>

          <div className="panel-section">
            <h4>部件角度调整</h4>
            <div className="parts-list">
              {ADJUSTABLE_PARTS.filter(p => availableParts.includes(p.id)).map(part => (
                <div 
                  key={part.id}
                  className={`part-control ${selectedPart === part.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPart(part.id)}
                >
                  <div className="part-header">
                    <span className="part-name">{part.name}</span>
                    <span className="part-angle">
                      {radToDeg(restPoseOffsets[part.id] ?? 0)}°
                    </span>
                  </div>
                  <div className="part-slider">
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={radToDeg(restPoseOffsets[part.id] ?? 0)}
                      onChange={(e) => handleSliderChange(part.id, parseInt(e.target.value))}
                    />
                    <button 
                      className="reset-btn"
                      onClick={(e) => { e.stopPropagation(); resetPart(part.id) }}
                      title="重置为0"
                    >
                      ↺
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 调试选项 */}
          <div className="panel-section">
            <h4>🔧 调试选项</h4>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showJoints}
                onChange={(e) => {
                  setShowJoints(e.target.checked)
                  rendererRef.current?.setShowJoints(e.target.checked)
                }}
              />
              显示关节点和旋转点
            </label>
            <div className="debug-legend">
              <span className="legend-item"><span className="dot blue"></span> 旋转点 (pivot)</span>
              <span className="legend-item"><span className="dot green"></span> 关节点 (joint)</span>
            </div>
            <button 
              className="btn-debug"
              onClick={() => {
                const renderer = rendererRef.current
                if (renderer) {
                  // @ts-ignore - accessing private property for debugging
                  const config = renderer.config
                  console.log('=== DEBUG: Character Config ===')
                  console.log('Skeleton:', config?.skeleton)
                  console.log('Joints:', config?.skeleton?.joints)
                  console.log('Bones:', config?.skeleton?.bones)
                  // 手动触发一次带日志的 updateChildPositions
                  // @ts-ignore - accessing private method for debugging
                  renderer.updateChildPositions(true)
                }
              }}
              style={{ marginTop: '8px', width: '100%' }}
            >
              🔍 打印骨骼数据
            </button>
          </div>

          {/* Spritesheet 数据显示 */}
          {selectedPart && spritesheetData && (
            <div className="panel-section">
              <h4>📊 {selectedPart} 数据</h4>
              <div className="spritesheet-data">
                {(() => {
                  const frames = spritesheetData.frames as Record<string, {
                    frame?: { x: number; y: number; w: number; h: number };
                    assembly?: { x: number; y: number; width: number; height: number };
                    jointPivot?: { x: number; y: number };
                    pivot?: { x: number; y: number };
                  }> | undefined
                  const partData = frames?.[selectedPart]
                  if (!partData) return <p>无数据</p>
                  
                  return (
                    <>
                      <div className="data-row">
                        <span className="data-label">Frame:</span>
                        <span className="data-value">
                          {partData.frame ? `${partData.frame.w}×${partData.frame.h}` : 'N/A'}
                        </span>
                      </div>
                      <div className="data-row">
                        <span className="data-label">Assembly:</span>
                        <span className="data-value">
                          {partData.assembly 
                            ? `(${partData.assembly.x.toFixed(1)}, ${partData.assembly.y.toFixed(1)})`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="data-row">
                        <span className="data-label">JointPivot:</span>
                        <span className="data-value highlight">
                          {partData.jointPivot 
                            ? `(${partData.jointPivot.x.toFixed(2)}, ${partData.jointPivot.y.toFixed(2)})`
                            : '未设置 (使用默认)'}
                        </span>
                      </div>
                      <div className="data-row">
                        <span className="data-label">Pivot:</span>
                        <span className="data-value">
                          {partData.pivot 
                            ? `(${partData.pivot.x.toFixed(2)}, ${partData.pivot.y.toFixed(2)})`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="data-row">
                        <span className="data-label">当前旋转:</span>
                        <span className="data-value highlight">
                          {radToDeg(partRotations[selectedPart] ?? restPoseOffsets[selectedPart] ?? 0)}°
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}

          {/* 参考模板 */}
          <div className="panel-section">
            <h4>📐 参考说明</h4>
            <div className="reference-guide">
              <p><strong>0°</strong> = 素材原始角度</p>
              <p><strong>负值</strong> = 逆时针旋转（通常是向下）</p>
              <p><strong>正值</strong> = 顺时针旋转（通常是向上）</p>
              <hr />
              <p className="tip">
                💡 目标：让角色在没有动作数据时呈现自然站立姿势
              </p>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="panel-actions">
            <button className="btn-reset" onClick={resetAll}>
              🔄 全部重置
            </button>
            <button className="btn-cancel" onClick={onCancel}>
              取消
            </button>
            <button 
              className="btn-save" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '💾 保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
