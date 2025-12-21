/**
 * Character Preview Component
 * Shows the assembled character using PixiJS with interactive controls
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { CharacterRenderer } from '@renderer'
import { adminApi } from '../services/api'
import './CharacterPreview.css'

// 预设动作定义
const PRESET_POSES: Record<string, { name: string; pose: Record<string, number> }> = {
  idle: {
    name: '站立',
    pose: {
      'body': 0,
      'head': 0,
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
  // 招手动画 (FK系统：手自动跟随手臂)
  wave1: {
    name: '招手1',
    pose: {
      'left-arm': 2.5,
      'right-arm': 0,
      'left-hand': 0.3,  // 手腕微调
      'right-hand': 0,
    }
  },
  wave2: {
    name: '招手2',
    pose: {
      'left-arm': 2.0,
      'right-arm': 0,
      'left-hand': -0.3, // 手腕摆动
      'right-hand': 0,
    }
  },
  // 鞠躬动画
  bow1: {
    name: '鞠躬1',
    pose: {
      'body': -0.5,      // 身体前倾
      'head': -0.2,      // 头微低
      'left-arm': -0.5,  // 手臂自然下垂
      'right-arm': -0.5,
    }
  },
  bow2: {
    name: '鞠躬2',
    pose: {
      'body': 0,
      'head': 0,
      'left-arm': 0,
      'right-arm': 0,
    }
  },
  // 走路动画
  walk1: {
    name: '走路1',
    pose: {
      'left-arm': 0.5,
      'right-arm': -0.5,
      'left-thigh': -0.4,
      'right-thigh': 0.4,
      'left-foot': -0.2,
      'right-foot': 0.2,
    }
  },
  walk2: {
    name: '走路2',
    pose: {
      'left-arm': -0.5,
      'right-arm': 0.5,
      'left-thigh': 0.4,
      'right-thigh': -0.4,
      'left-foot': 0.2,
      'right-foot': -0.2,
    }
  },
  // 舞蹈动作
  dance1: {
    name: '舞蹈1',
    pose: {
      'body': 0.1,
      'head': -0.15,
      'left-arm': 2.2,
      'right-arm': 1.0,
      'left-hand': 0.5,
      'right-hand': -0.5,
      'left-thigh': 0.2,
      'right-thigh': -0.2,
      'skirt': 0.1,
    }
  },
  dance2: {
    name: '舞蹈2',
    pose: {
      'body': -0.1,
      'head': 0.15,
      'left-arm': 1.0,
      'right-arm': 2.2,
      'left-hand': -0.5,
      'right-hand': 0.5,
      'left-thigh': -0.2,
      'right-thigh': 0.2,
      'skirt': -0.1,
    }
  },
  // 跳跃动作
  jump_prep: {
    name: '起跳准备',
    pose: {
      'body': 0.2,        // 身体微后仰
      'left-thigh': -0.8, // 蹲下
      'right-thigh': -0.8,
      'left-foot': 0.8,
      'right-foot': 0.8,
      'left-arm': -0.5,   // 手臂向后甩蓄力
      'right-arm': -0.5,
    }
  },
  jump_air: {
    name: '腾空',
    pose: {
      'body': -0.2,
      'left-thigh': 0.4,  // 腿向后伸展
      'right-thigh': 0.4,
      'left-foot': 0.5,
      'right-foot': 0.5,
      'left-arm': 2.5,    // 手臂向上举
      'right-arm': 2.5,
      'head': -0.3,       // 抬头
    }
  },
  // 踢腿
  kick: {
    name: '踢腿',
    pose: {
      'body': -0.2,
      'left-thigh': -1.8, // 高踢腿
      'left-foot': 0.2,
      'right-thigh': 0.2, // 支撑腿微屈
      'right-foot': 0,
      'left-arm': -0.5,   // 保持平衡
      'right-arm': 0.5,
    }
  },
  // 点头
  nod1: {
    name: '点头1',
    pose: { 'head': 0.2 }
  },
  nod2: {
    name: '点头2',
    pose: { 'head': -0.1 }
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
  const [isFlipped, setIsFlipped] = useState(false)

  // 动画状态
  const [activeCycle, setActiveCycle] = useState<string | null>(null)
  const animationIntervalRef = useRef<number | null>(null)

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

        if (!isMounted) return

        // Fetch configs
        const [configRes, spritesheetRes] = await Promise.all([
          adminApi.getCharacterConfig(characterId),
          adminApi.getCharacterSpritesheet(characterId)
        ])

        console.log('[CharacterPreview] Data loaded:', {
          config: configRes,
          spritesheet: spritesheetRes
        })

        if (!isMounted) return

        currentRenderer = new CharacterRenderer({
          canvas: canvasRef.current,
          width,
          height,
          config: configRes,
          spritesheetData: spritesheetRes,
          imageUrl: adminApi.getSpritesheetPngUrl(characterId),
          onPartSelected: (partName) => {
            if (isMounted) setSelectedPart(partName)
          }
        })

        await currentRenderer.init()
        
        if (isMounted) {
          rendererRef.current = currentRenderer
          setLoading(false)
          // Initial render
          currentRenderer.render()
        } else {
          await currentRenderer.destroy()
        }
      } catch (err) {
        console.error('Failed to init renderer:', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : '加载失败')
          setLoading(false)
        }
      }
    }

    initRenderer()

    return () => {
      isMounted = false
      if (initTimeout) window.clearTimeout(initTimeout)
      if (animationIntervalRef.current) {
        window.clearInterval(animationIntervalRef.current)
      }
      if (currentRenderer) {
        currentRenderer.destroy().catch(console.error)
      }
      if (rendererRef.current) {
        rendererRef.current.destroy().catch(console.error)
        rendererRef.current = null
      }
    }
  }, [characterId, width, height])

  // Handle refresh
  const handleRefresh = async () => {
    if (rendererRef.current) {
      setLoading(true)
      try {
        // Stop animation
        stopAnimation()
        
        // Reload configs
        const [configRes, spritesheetRes] = await Promise.all([
          adminApi.getCharacterConfig(characterId),
          adminApi.getCharacterSpritesheet(characterId)
        ])
        
        // Update renderer
        await rendererRef.current.updateConfig(configRes, spritesheetRes)
        setLoading(false)
      } catch (err) {
        console.error('Failed to refresh:', err)
        setError('重新加载失败')
        setLoading(false)
      }
    }
  }

  // Apply single preset
  const applyPreset = useCallback((presetKey: string) => {
    if (!rendererRef.current) return
    
    // 如果正在循环动画，先停止
    if (activeCycle) stopAnimation()

    const preset = PRESET_POSES[presetKey]
    if (!preset) return

    setIsAnimating(true)
    rendererRef.current.animateToPose(preset.pose, 500, () => {
      setIsAnimating(false)
    })
  }, [activeCycle])

  // 重置姿势
  const resetPose = useCallback(() => {
    if (!rendererRef.current || isAnimating) return
    stopAnimation()
    
    setIsAnimating(true)
    rendererRef.current.animateToPose(PRESET_POSES.idle.pose, 300, () => {
      setIsAnimating(false)
    })
  }, [isAnimating])

  // 停止当前循环动画
  const stopAnimation = useCallback(() => {
    if (animationIntervalRef.current) {
      window.clearInterval(animationIntervalRef.current)
      animationIntervalRef.current = null
    }
    setActiveCycle(null)
  }, [])

  // 通用循环动画处理器
  const toggleAnimationCycle = useCallback((cycleName: string, frames: string[], interval: number, duration: number = 500) => {
    if (!rendererRef.current) return

    if (activeCycle === cycleName) {
      // 停止当前动画
      stopAnimation()
      resetPose()
    } else {
      // 停止之前的动画
      stopAnimation()
      
      // 开始新动画
      setActiveCycle(cycleName)
      let step = 0

      const animate = () => {
        if (!rendererRef.current) return
        const poseKey = frames[step % frames.length]
        const pose = PRESET_POSES[poseKey].pose
        rendererRef.current.animateToPose(pose, duration)
        step++
      }

      animate()
      animationIntervalRef.current = window.setInterval(animate, interval)
    }
  }, [activeCycle, stopAnimation, resetPose])

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
      <div className="preview-container">
        {loading && <div className="loading-overlay">加载中...</div>}
        <canvas ref={canvasRef} />
        <div className="controls-overlay">
          {selectedPart && (
            <div className="part-label">
              选中部件: {selectedPart}
            </div>
          )}
        </div>
      </div>

      <div className="preview-controls">
        <div className="control-groups">
          
          {/* 基础控制 */}
          <div className="control-group">
            <h4>基础控制</h4>
            <div className="btn-row">
              <button className="control-btn" onClick={resetPose} disabled={isAnimating}>
                🔄 复位
              </button>
              <button 
                className={`control-btn ${isFlipped ? 'active' : ''}`}
                onClick={handleTurnAround}
                disabled={isAnimating}
              >
                ↔️ 转身
              </button>
              <button className="control-btn" onClick={handleRefresh}>
                ♻️ 刷新
              </button>
            </div>
          </div>

          {/* 循环动画 */}
          <div className="control-group">
            <h4>循环动画</h4>
            <div className="btn-grid">
              <button
                className={`animation-btn ${activeCycle === 'walk' ? 'active' : ''}`}
                onClick={() => toggleAnimationCycle('walk', ['walk1', 'walk2'], 600, 500)}
              >
                🚶 走路
              </button>
              <button
                className={`animation-btn ${activeCycle === 'wave' ? 'active' : ''}`}
                onClick={() => toggleAnimationCycle('wave', ['wave1', 'wave2'], 800, 700)}
              >
                👋 招手
              </button>
              <button
                className={`animation-btn ${activeCycle === 'dance' ? 'active' : ''}`}
                onClick={() => toggleAnimationCycle('dance', ['dance1', 'dance2'], 700, 600)}
              >
                💃 舞蹈
              </button>
              <button
                className={`animation-btn ${activeCycle === 'jump' ? 'active' : ''}`}
                onClick={() => toggleAnimationCycle('jump', ['jump_prep', 'jump_air'], 1000, 400)}
              >
                🦘 跳跃
              </button>
              <button
                className={`animation-btn ${activeCycle === 'nod' ? 'active' : ''}`}
                onClick={() => toggleAnimationCycle('nod', ['nod1', 'nod2'], 600, 400)}
              >
                🙇 点头
              </button>
              <button
                className={`animation-btn ${activeCycle === 'bow' ? 'active' : ''}`}
                onClick={() => toggleAnimationCycle('bow', ['bow1', 'bow2'], 1500, 800)}
              >
                🙏 鞠躬
              </button>
            </div>
          </div>

          {/* 单次动作 */}
          <div className="control-group">
            <h4>单次动作</h4>
            <div className="btn-grid">
              <button className="preset-btn" onClick={() => applyPreset('kick')}>
                🦵 踢腿
              </button>
              <button className="preset-btn" onClick={() => applyPreset('dance1')}>
                💃 舞姿1
              </button>
              <button className="preset-btn" onClick={() => applyPreset('dance2')}>
                🕺 舞姿2
              </button>
              <button className="preset-btn" onClick={() => applyPreset('jump_air')}>
                ✈️ 腾空
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
