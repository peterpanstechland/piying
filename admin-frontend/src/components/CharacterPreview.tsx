/**
 * Character Preview Component
 * Shows the assembled character using PixiJS
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { CharacterRenderer } from '../pixi/CharacterRenderer'
import { adminApi } from '../services/api'
import './CharacterPreview.css'

interface Props {
  characterId: string
  width?: number
  height?: number
}

export default function CharacterPreview({
  characterId,
  width = 500,
  height = 600,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CharacterRenderer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize renderer
  useEffect(() => {
    const initRenderer = async () => {
      if (!canvasRef.current) return

      try {
        setLoading(true)
        setError(null)

        // Create new renderer instance
        const renderer = new CharacterRenderer()
        rendererRef.current = renderer

        await renderer.init(canvasRef.current, width, height)

        // Spritesheet is auto-generated when saving pivot config
        // Just load the character directly
        const configUrl = adminApi.getCharacterConfigUrl(characterId)
        await renderer.loadCharacter(configUrl)

        setLoading(false)
      } catch (err) {
        console.error('Failed to initialize preview:', err)
        setError(err instanceof Error ? err.message : '加载预览失败')
        setLoading(false)
      }
    }

    initRenderer()

    return () => {
      rendererRef.current?.destroy()
    }
  }, [characterId, width, height])


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
      <div className="preview-canvas-container">
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>加载预览...</p>
          </div>
        )}
        <canvas ref={canvasRef} />
      </div>

      <div className="preview-controls">
        <div className="preview-info">
          <span>📐 组装预览</span>
          <span className="hint">显示枢轴配置中保存的人偶形态</span>
        </div>
        <button className="action-btn" onClick={handleRefresh} disabled={loading}>
          🔄 刷新
        </button>
      </div>
    </div>
  )
}
