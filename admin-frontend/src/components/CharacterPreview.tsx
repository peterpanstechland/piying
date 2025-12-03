/**
 * Character Preview Component
 * Shows the assembled character using PixiJS with interactive controls
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { CharacterRenderer } from '../pixi/CharacterRenderer'
import { adminApi } from '../services/api'
import './CharacterPreview.css'

// 预设动作定义
// 同时支持分体式下身(left-thigh/right-thigh)和一体式下身(skirt)的角色
// 以及脚部(left-foot/right-foot)动画
const PRESET_POSES: Record<string, { name: string; pose: Record<string, number> }> = {
  idle: {
    name: '站立',
    pose: {
      'left-arm': 0,
      'right-arm': 0,
      'left-hand': 0,
      'right-hand': 0,
      'left-thigh': 0,
      'right-thigh': 0,
      'left-foot': 0,
      'right-foot': 0,
      'skirt': 0,
    }
  },
  // 招手动画的两个关键帧
  // 手臂举高并摇动，手自动跟随（不设置额外偏移）
  wave1: {
    name: '招手1',
    pose: {
      'left-arm': 2.3,            // 手臂举高，向一侧
      'right-arm': 0,
      'left-hand': 0,             // 手跟随手臂，不额外设置
      'right-hand': 0,
    }
  },
  wave2: {
    name: '招手2',
    pose: {
      'left-arm': 2.7,            // 手臂举高，向另一侧
      'right-arm': 0,
      'left-hand': 0,             // 手跟随手臂，不额外设置
      'right-hand': 0,
    }
  },
  // 鞠躬动画的关键帧
  // 角色面向左，身体前倾需要负值（逆时针）
  bow1: {
    name: '鞠躬1',
    pose: {
      'body': -0.4,               // 身体前倾（负值=逆时针=向前弯）
      'head': -0.3,               // 头跟随前倾
      'left-arm': -0.3,           // 手臂向前下垂
      'right-arm': -0.3,
      'left-hand': 0,
      'right-hand': 0,
    }
  },
  bow2: {
    name: '鞠躬2',
    pose: {
      'body': 0,                  // 身体直立
      'head': 0,                  // 头直立
      'left-arm': 0,              // 手臂自然
      'right-arm': 0,
      'left-hand': 0,
      'right-hand': 0,
    }
  },
  walk1: {
    name: '走路1',
    pose: {
      // 正常走路：手臂交错摆动
      // 正值 = 向后摆（顺时针），负值 = 向前摆（逆时针）
      'left-arm': 0.4,             // 左臂向后摆
      'right-arm': -0.3,           // 右臂向前摆
      // 手跟随手臂自然摆动（由 updateChildPositions 自动处理）
      'left-hand': 0,
      'right-hand': 0,
      // 腿部：与手臂交叉（左臂后 = 右腿前）
      'left-thigh': -Math.PI / 10, // 左腿向后
      'right-thigh': Math.PI / 10, // 右腿向前
      // 脚部跟随腿
      'left-foot': -Math.PI / 8,
      'right-foot': Math.PI / 8,
    }
  },
  walk2: {
    name: '走路2',
    pose: {
      // 与 walk1 相反的姿势
      'left-arm': -0.3,            // 左臂向前摆
      'right-arm': 0.4,            // 右臂向后摆
      // 手跟随手臂自然摆动（由 updateChildPositions 自动处理）
      'left-hand': 0,
      'right-hand': 0,
      // 腿部：与手臂交叉
      'left-thigh': Math.PI / 10,  // 左腿向前
      'right-thigh': -Math.PI / 10,// 右腿向后
      // 脚部跟随腿
      'left-foot': Math.PI / 8,
      'right-foot': -Math.PI / 8,
    }
  },
  dance: {
    name: '舞蹈',
    pose: {
      'left-arm': -Math.PI / 2,
      'right-arm': -Math.PI / 3,
      'left-hand': Math.PI / 4,
      'right-hand': -Math.PI / 4,
    }
  },
}

interface Props {
  characterId: string
  width?: number
  height?: number
}

export default function CharacterPreview({
  characterId,
  width = 600,
  height = 500,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CharacterRenderer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [walkCycle, setWalkCycle] = useState(false)
  const [waveCycle, setWaveCycle] = useState(false)
  const [bowCycle, setBowCycle] = useState(false)
  const [isFlipped, setIsFlipped] = useState(false)
  const walkIntervalRef = useRef<number | null>(null)
  const waveIntervalRef = useRef<number | null>(null)
  const bowIntervalRef = useRef<number | null>(null)

  // Initialize renderer
  useEffect(() => {
    let isMounted = true
    let currentRenderer: CharacterRenderer | null = null
    let initTimeout: number | null = null

    const initRenderer = async () => {
      if (!canvasRef.current || !isMounted) return

      try {
        setLoading(true)
        setError(null)

        // 如果已有 renderer，先销毁
        if (rendererRef.current) {
          await rendererRef.current.destroy()
          rendererRef.current = null
        }

        // 延迟一帧，确保之前的 WebGL context 完全释放
        await new Promise(resolve => {
          initTimeout = window.setTimeout(resolve, 50)
        })
        
        if (!isMounted || !canvasRef.current) return

        // Create new renderer instance
        const renderer = new CharacterRenderer()
        currentRenderer = renderer
        rendererRef.current = renderer

        await renderer.init(canvasRef.current, width, height)

        // 检查组件是否已卸载
        if (!isMounted) {
          await renderer.destroy()
          return
        }

        // Spritesheet is auto-generated when saving pivot config
        // Just load the character directly
        const configUrl = adminApi.getCharacterConfigUrl(characterId)
        await renderer.loadCharacter(configUrl)

        if (isMounted) {
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to initialize preview:', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : '加载预览失败')
          setLoading(false)
        }
      }
    }

    initRenderer()

    return () => {
      isMounted = false
      if (initTimeout) {
        clearTimeout(initTimeout)
      }
      if (walkIntervalRef.current) {
        clearInterval(walkIntervalRef.current)
        walkIntervalRef.current = null
      }
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current)
        waveIntervalRef.current = null
      }
      if (bowIntervalRef.current) {
        clearInterval(bowIntervalRef.current)
        bowIntervalRef.current = null
      }
      // 同步标记销毁，异步执行
      if (currentRenderer) {
        currentRenderer.destroy().catch(console.warn)
      }
      rendererRef.current = null
    }
  }, [characterId, width, height])

  // 鼠标拖动控制
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!rendererRef.current || isAnimating) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // 简单的部件选择逻辑（基于点击位置）
    // 这里可以扩展为更精确的碰撞检测
    const centerX = width / 2
    const centerY = height / 2
    
    // 根据点击位置判断选中的部件
    const dx = x - centerX
    const dy = y - centerY
    
    if (dy < -100) {
      setSelectedPart('head')
    } else if (dx < -50 && dy < 50) {
      setSelectedPart(dy < 0 ? 'left-arm' : 'left-hand')
    } else if (dx > 50 && dy < 50) {
      setSelectedPart(dy < 0 ? 'right-arm' : 'right-hand')
    } else if (dy > 100) {
      setSelectedPart(dx < 0 ? 'left-thigh' : 'right-thigh')
    } else {
      setSelectedPart(null)
    }
  }, [width, height, isAnimating])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedPart || !rendererRef.current || isAnimating) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const centerX = width / 2
    const centerY = height / 2
    
    // 计算角度
    const angle = Math.atan2(y - centerY, x - centerX)
    
    // 限制旋转范围
    const limitedAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle))
    
    rendererRef.current.setPartRotation(selectedPart, limitedAngle)
  }, [selectedPart, width, height, isAnimating])

  const handleMouseUp = useCallback(() => {
    setSelectedPart(null)
  }, [])

  // Refresh preview
  const handleRefresh = useCallback(async () => {
    if (!rendererRef.current) return
    try {
      setLoading(true)
      const configUrl = adminApi.getCharacterConfigUrl(characterId)
      await rendererRef.current.loadCharacter(configUrl)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新失败')
      setLoading(false)
    }
  }, [characterId])

  // 应用预设动作
  const applyPreset = useCallback((presetKey: string) => {
    if (!rendererRef.current || isAnimating) return
    
    const preset = PRESET_POSES[presetKey]
    if (!preset) return
    
    setIsAnimating(true)
    rendererRef.current.animateToPose(preset.pose, 300, () => {
      setIsAnimating(false)
    })
  }, [isAnimating])

  // 重置姿势
  const resetPose = useCallback(() => {
    if (!rendererRef.current || isAnimating) return
    setIsAnimating(true)
    rendererRef.current.animateToPose(PRESET_POSES.idle.pose, 300, () => {
      setIsAnimating(false)
    })
  }, [isAnimating])

  // 走路循环动画
  const toggleWalkCycle = useCallback(() => {
    if (!rendererRef.current) return
    
    if (walkCycle) {
      // 停止走路
      if (walkIntervalRef.current) {
        clearInterval(walkIntervalRef.current)
        walkIntervalRef.current = null
      }
      setWalkCycle(false)
      resetPose()
    } else {
      // 开始走路循环
      setWalkCycle(true)
      let step = 0
      
      const animate = () => {
        if (!rendererRef.current) return
        const pose = step % 2 === 0 ? PRESET_POSES.walk1.pose : PRESET_POSES.walk2.pose
        rendererRef.current.animateToPose(pose, 400)
        step++
      }
      
      animate()
      walkIntervalRef.current = window.setInterval(animate, 500)
    }
  }, [walkCycle, resetPose])

  // 招手循环动画
  const toggleWaveCycle = useCallback(() => {
    if (!rendererRef.current) return
    
    if (waveCycle) {
      // 停止招手
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current)
        waveIntervalRef.current = null
      }
      setWaveCycle(false)
      resetPose()
    } else {
      // 开始招手循环
      setWaveCycle(true)
      let step = 0
      
      const animate = () => {
        if (!rendererRef.current) return
        const pose = step % 2 === 0 ? PRESET_POSES.wave1.pose : PRESET_POSES.wave2.pose
        rendererRef.current.animateToPose(pose, 600)  // 动画时长 600ms
        step++
      }
      
      animate()
      waveIntervalRef.current = window.setInterval(animate, 700)  // 间隔 700ms
    }
  }, [waveCycle, resetPose])

  // 鞠躬循环动画
  const toggleBowCycle = useCallback(() => {
    if (!rendererRef.current) return
    
    if (bowCycle) {
      // 停止鞠躬
      if (bowIntervalRef.current) {
        clearInterval(bowIntervalRef.current)
        bowIntervalRef.current = null
      }
      setBowCycle(false)
      resetPose()
    } else {
      // 开始鞠躬循环
      setBowCycle(true)
      let step = 0
      
      const animate = () => {
        if (!rendererRef.current) return
        const pose = step % 2 === 0 ? PRESET_POSES.bow1.pose : PRESET_POSES.bow2.pose
        rendererRef.current.animateToPose(pose, 800)  // 动画时长 800ms
        step++
      }
      
      animate()
      bowIntervalRef.current = window.setInterval(animate, 1000)  // 间隔 1000ms
    }
  }, [bowCycle, resetPose])

  // 转身动画
  const handleTurnAround = useCallback(() => {
    if (!rendererRef.current || isAnimating) return
    
    setIsAnimating(true)
    rendererRef.current.turnAroundAnimated(300, () => {
      setIsAnimating(false)
      setIsFlipped(rendererRef.current?.isFlipped() ?? false)
    })
  }, [isAnimating])

  if (error) {
    return (
      <div className="character-preview error">
        <div className="error-message">
          <span>⚠️</span>
          <p>{error}</p>
          <p className="hint">请先在枢轴配置中保存部件位置</p>
          <button className="btn-retry" onClick={handleRefresh}>
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="character-preview">
      <div className="preview-main">
        <div className="preview-canvas-container">
          {loading && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <p>加载预览...</p>
            </div>
          )}
          <canvas 
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: selectedPart ? 'grabbing' : 'grab' }}
          />
          {selectedPart && (
            <div className="selected-part-indicator">
              拖动中: {selectedPart}
            </div>
          )}
        </div>

        <div className="preview-sidebar">
          <div className="preset-section">
            <h4>预设动作</h4>
            <div className="preset-buttons">
              {Object.entries(PRESET_POSES)
                .filter(([key]) => !key.startsWith('wave') && !key.startsWith('walk') && !key.startsWith('bow'))
                .map(([key, preset]) => (
                <button
                  key={key}
                  className={`preset-btn ${key === 'idle' ? 'primary' : ''}`}
                  onClick={() => applyPreset(key)}
                  disabled={isAnimating || loading}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="animation-section">
            <h4>动画</h4>
            <button
              className={`animation-btn ${walkCycle ? 'active' : ''}`}
              onClick={toggleWalkCycle}
              disabled={loading || waveCycle}
            >
              {walkCycle ? '⏹ 停止走路' : '🚶 走路循环'}
            </button>
            <button
              className={`animation-btn ${waveCycle ? 'active' : ''}`}
              onClick={toggleWaveCycle}
              disabled={loading || walkCycle || bowCycle}
            >
              {waveCycle ? '⏹ 停止招手' : '👋 招手循环'}
            </button>
            <button
              className={`animation-btn ${bowCycle ? 'active' : ''}`}
              onClick={toggleBowCycle}
              disabled={loading || walkCycle || waveCycle}
            >
              {bowCycle ? '⏹ 停止鞠躬' : '🙇 鞠躬循环'}
            </button>
            <button
              className={`animation-btn ${isFlipped ? 'active' : ''}`}
              onClick={handleTurnAround}
              disabled={isAnimating || loading}
            >
              🔄 转身
            </button>
          </div>

          <div className="control-section">
            <h4>控制</h4>
            <button 
              className="control-btn"
              onClick={resetPose}
              disabled={isAnimating || loading}
            >
              🔄 重置姿势
            </button>
            <button 
              className="control-btn"
              onClick={handleRefresh}
              disabled={loading}
            >
              ♻️ 重新加载
            </button>
          </div>

          <div className="help-section">
            <h4>操作说明</h4>
            <ul>
              <li>点击并拖动画布控制部件旋转</li>
              <li>点击预设按钮播放动作</li>
              <li>走路循环会自动播放</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="preview-footer">
        <span className="hint">💡 提示：鼠标拖动可以手动调整部件角度</span>
      </div>
    </div>
  )
}
