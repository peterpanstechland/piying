import { useState, useEffect, useRef, useCallback } from 'react'
import { adminApi } from '../services/api'
import { CharacterRenderer } from '../pixi/CharacterRenderer'
import { visionManager } from '../services/VisionManager'
import { PoseProcessor } from '../pose/PoseProcessor'
import type { ProcessorConfig, ProcessedPose } from '../pose/types'
import { DEFAULT_CONFIG } from '../pose/types'
import type { PoseLandmarks } from '../pixi/types'
import MotionCaptureDebugPanel from '../components/MotionCaptureDebugPanel'
import './CameraTestPage.css'

interface CharacterListItem {
  id: string
  name: string
  description: string | null
  thumbnail_path: string | null
  part_count: number
}

interface CameraDevice {
  deviceId: string
  label: string
}

// MediaPipe Pose landmark connections for drawing skeleton
const POSE_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
]

// Landmark names for debug display
const LANDMARK_NAMES: Record<number, string> = {
  0: '鼻子', 11: '左肩', 12: '右肩', 13: '左肘', 14: '右肘',
  15: '左腕', 16: '右腕', 23: '左髋', 24: '右髋',
  25: '左膝', 26: '右膝', 27: '左踝', 28: '右踝',
}

// Helper to mirror pose landmarks (flip X and swap left/right indices)
const mirrorPoseLandmarks = (landmarks: PoseLandmarks): PoseLandmarks => {
  // Create a copy with flipped X
  const mirrored = landmarks.map(lm => ({ ...lm, x: 1 - lm.x }))
  
  // Swap left/right indices
  // MediaPipe Pose Landmarks: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
  const swap = (i: number, j: number) => {
    if (mirrored[i] && mirrored[j]) {
      const temp = mirrored[i]
      mirrored[i] = mirrored[j]
      mirrored[j] = temp
    }
  }

  // Face
  swap(1, 4)   // Eye Inner
  swap(2, 5)   // Eye
  swap(3, 6)   // Eye Outer
  swap(7, 8)   // Ear
  swap(9, 10)  // Mouth

  // Body
  swap(11, 12) // Shoulders
  swap(13, 14) // Elbows
  swap(15, 16) // Wrists
  swap(17, 18) // Pinkies
  swap(19, 20) // Indices
  swap(21, 22) // Thumbs
  
  // Legs
  swap(23, 24) // Hips
  swap(25, 26) // Knees
  swap(27, 28) // Ankles
  swap(29, 30) // Heels
  swap(31, 32) // Foot indices
  
  return mirrored
}

export default function CameraTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const skeletonCanvasRef = useRef<HTMLCanvasElement>(null)
  const characterCanvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const rendererRef = useRef<CharacterRenderer | null>(null)
  const poseProcessorRef = useRef<PoseProcessor | null>(null)
  const fpsRef = useRef({ frames: 0, lastTime: performance.now(), fps: 0 })

  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [defaultCameraId, setDefaultCameraId] = useState<string>('')
  const [characters, setCharacters] = useState<CharacterListItem[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [poseDetected, setPoseDetected] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)
  const [mediaPipeLoaded, setMediaPipeLoaded] = useState(false)
  const [currentPose, setCurrentPose] = useState<PoseLandmarks | null>(null)
  const [processedPose, setProcessedPose] = useState<ProcessedPose | null>(null)
  const [fps, setFps] = useState(0)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [showDebugPanel, setShowDebugPanel] = useState(true)
  const [showCharacterPreview, setShowCharacterPreview] = useState(true)
  const [showStaticPose, setShowStaticPose] = useState(true)
  const [characterLoaded, setCharacterLoaded] = useState(false)
  const [mirrorMode, setMirrorMode] = useState(true)
  const [usePipeline, setUsePipeline] = useState(true)
  
  // Pipeline config state
  const [pipelineConfig, setPipelineConfig] = useState<ProcessorConfig>(DEFAULT_CONFIG)


  // Load available cameras
  const loadCameras = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => stream.getTracks().forEach(track => track.stop()))
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
        }))
      
      setCameras(videoDevices)
      
      try {
        const cameraSettings = await adminApi.getCameras()
        if (cameraSettings.default_camera_id) {
          setDefaultCameraId(cameraSettings.default_camera_id)
          const defaultExists = videoDevices.some(d => d.deviceId === cameraSettings.default_camera_id)
          if (defaultExists) {
            setSelectedCameraId(cameraSettings.default_camera_id)
          } else if (videoDevices.length > 0) {
            setSelectedCameraId(videoDevices[0].deviceId)
          }
        } else if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId)
        }
      } catch {
        if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId)
        }
      }
    } catch (err) {
      console.error('Failed to enumerate cameras:', err)
      setError('无法访问摄像头。请确保已授予摄像头权限。')
    }
  }, [])

  // Load characters
  const loadCharacters = useCallback(async () => {
    try {
      const data = await adminApi.getCharacters()
      setCharacters(data)
    } catch (err) {
      console.error('Failed to load characters:', err)
      setError('加载人物列表失败')
    }
  }, [])

  // Load character into renderer
  const loadCharacterIntoRenderer = useCallback(async (characterId: string, staticPose: boolean) => {
    if (!rendererRef.current || !characterId) {
      console.log('Cannot load character:', { hasRenderer: !!rendererRef.current, characterId })
      setCharacterLoaded(false)
      return
    }
    
    try {
      const configUrl = adminApi.getCharacterConfigUrl(characterId)
      console.log('Loading character from:', configUrl, 'staticPose:', staticPose)
      await rendererRef.current.loadCharacter(configUrl)
      
      rendererRef.current.setShowStaticPose(staticPose)
      
      setCharacterLoaded(true)
      console.log('Character loaded successfully, visible:', staticPose)
    } catch (err) {
      console.error('Failed to load character:', err)
      setCharacterLoaded(false)
    }
  }, [])


  // Store pose in ref for use in callbacks
  const currentPoseRef = useRef<PoseLandmarks | null>(null)

  // Initialize MediaPipe Pose using VisionManager
  const initMediaPipe = useCallback(async () => {
    try {
      await visionManager.initialize()
      setMediaPipeLoaded(visionManager.isReady())
      console.log('MediaPipe Pose initialized successfully via VisionManager')
    } catch (err) {
      console.error('Failed to initialize MediaPipe:', err)
      setMediaPipeLoaded(false)
    }
  }, [])

  // Initialize PoseProcessor
  const initPoseProcessor = useCallback(() => {
    if (!poseProcessorRef.current) {
      poseProcessorRef.current = new PoseProcessor(pipelineConfig)
      
      // Set turn callback to animate character turn
      poseProcessorRef.current.setOnTurn((facing) => {
        if (rendererRef.current) {
          rendererRef.current.setFacingDirection(facing, true, pipelineConfig.turn.animationDuration)
        }
      })
      
      console.log('PoseProcessor initialized')
    }
  }, [pipelineConfig])

  // Handle pipeline config change
  const handleConfigChange = useCallback((partialConfig: Partial<ProcessorConfig>) => {
    setPipelineConfig(prev => {
      // Deep merge the config
      const newConfig: ProcessorConfig = {
        calibration: { ...prev.calibration, ...(partialConfig.calibration || {}) },
        filter: { ...prev.filter, ...(partialConfig.filter || {}) },
        turn: { ...prev.turn, ...(partialConfig.turn || {}) },
        scale: { ...prev.scale, ...(partialConfig.scale || {}) },
        leg: { ...prev.leg, ...(partialConfig.leg || {}) },
        ik: { ...prev.ik, ...(partialConfig.ik || {}) },
        secondary: { ...prev.secondary, ...(partialConfig.secondary || {}) },
      }
      
      // Update processor with new config
      if (poseProcessorRef.current) {
        poseProcessorRef.current.updateConfig(partialConfig)
      }
      
      return newConfig
    })
  }, [])

  // Handle manual calibration
  const handleCalibrate = useCallback(() => {
    if (!currentPoseRef.current || !poseProcessorRef.current) {
      alert('请先检测到人体姿态')
      return
    }
    
    const result = poseProcessorRef.current.calibrate(currentPoseRef.current)
    if (result) {
      console.log('✓ Manual calibration complete')
    }
  }, [])

  // Handle clear calibration
  const handleClearCalibration = useCallback(() => {
    if (poseProcessorRef.current) {
      poseProcessorRef.current.clearCalibration()
      console.log('Calibration cleared')
    }
    if (rendererRef.current) {
      rendererRef.current.clearReferencePose()
    }
  }, [])

  // Export config to JSON
  const handleExportConfig = useCallback(() => {
    const configJson = JSON.stringify(pipelineConfig, null, 2)
    const blob = new Blob([configJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mocap-config-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [pipelineConfig])

  // Import config from JSON
  const handleImportConfig = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      
      try {
        const text = await file.text()
        const imported = JSON.parse(text) as ProcessorConfig
        setPipelineConfig(imported)
        if (poseProcessorRef.current) {
          poseProcessorRef.current.updateConfig(imported)
        }
        console.log('Config imported successfully')
      } catch (err) {
        console.error('Failed to import config:', err)
        alert('配置文件格式错误')
      }
    }
    input.click()
  }, [])

  // Draw skeleton on canvas
  const drawSkeleton = useCallback((landmarks: PoseLandmarks) => {
    const canvas = skeletonCanvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const width = canvas.width
    const height = canvas.height
    
    ctx.clearRect(0, 0, width, height)
    
    if (!showSkeleton) return
    
    // Draw connections
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    
    for (const [start, end] of POSE_CONNECTIONS) {
      const startLm = landmarks[start]
      const endLm = landmarks[end]
      
      if (startLm && endLm && (startLm.visibility ?? 0) > 0.3 && (endLm.visibility ?? 0) > 0.3) {
        ctx.beginPath()
        ctx.moveTo(startLm.x * width, startLm.y * height)
        ctx.lineTo(endLm.x * width, endLm.y * height)
        ctx.stroke()
      }
    }
    
    // Draw landmarks
    ctx.fillStyle = '#ff0000'
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i]
      if ((lm.visibility ?? 0) > 0.3) {
        ctx.beginPath()
        ctx.arc(lm.x * width, lm.y * height, 5, 0, 2 * Math.PI)
        ctx.fill()
        
        // Draw landmark index for key points
        if (LANDMARK_NAMES[i]) {
          ctx.fillStyle = '#ffffff'
          ctx.font = '10px sans-serif'
          ctx.fillText(String(i), lm.x * width + 8, lm.y * height - 8)
          ctx.fillStyle = '#ff0000'
        }
      }
    }
  }, [showSkeleton])

  // Render loop - must be defined before startCamera
  const startRenderLoop = useCallback(() => {
    const render = async () => {
      if (!videoRef.current || !skeletonCanvasRef.current) {
        animationRef.current = requestAnimationFrame(render)
        return
      }
      
      const video = videoRef.current
      const canvas = skeletonCanvasRef.current
      
      if (video.readyState < 2) {
        animationRef.current = requestAnimationFrame(render)
        return
      }
      
      // Match canvas size to video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      
      // Calculate FPS
      fpsRef.current.frames++
      const now = performance.now()
      if (now - fpsRef.current.lastTime >= 1000) {
        fpsRef.current.fps = fpsRef.current.frames
        fpsRef.current.frames = 0
        fpsRef.current.lastTime = now
        setFps(fpsRef.current.fps)
      }
      
      // Detect pose using VisionManager
      if (visionManager.isReady()) {
        try {
          const result = visionManager.detectPose(video)
          if (result && result.landmarks && result.landmarks.length > 0) {
            setPoseDetected(true)
            
            // 原始 landmarks - 用于骨骼绘制（CSS 会处理镜像）
            const rawLandmarks: PoseLandmarks = result.landmarks[0].map((lm) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility
            }))
            
            // 骨骼绘制使用原始 landmarks
            setCurrentPose(rawLandmarks)
            currentPoseRef.current = rawLandmarks
            
            // 镜像模式下翻转 X 坐标，让角度计算与镜像显示一致
            // 这样用户向左伸手时，皮影也向左
            const processLandmarks: PoseLandmarks = mirrorMode
              ? rawLandmarks.map((lm) => ({ ...lm, x: 1 - lm.x }))
              : rawLandmarks
            
            // Process through pipeline or direct
            if (usePipeline && poseProcessorRef.current) {
              const processed = poseProcessorRef.current.process(processLandmarks)
              setProcessedPose(processed)
              
              // Update character with processed pose
                if (rendererRef.current) {
                rendererRef.current.updatePoseFromProcessed(processed)
              }
            } else {
              // Legacy: Direct update without pipeline
            if (rendererRef.current) {
                rendererRef.current.updatePose(processLandmarks)
              }
            }
          } else {
            setPoseDetected(false)
            setCurrentPose(null)
            currentPoseRef.current = null
            
            // Process null pose through pipeline
            if (usePipeline && poseProcessorRef.current) {
              const processed = poseProcessorRef.current.process(null)
              setProcessedPose(processed)
            }
            
            // Show static pose when no detection
            if (rendererRef.current) {
              if (usePipeline) {
                rendererRef.current.updatePoseFromProcessed({
                  rawLandmarks: null,
                  filteredLandmarks: null,
                  partAngles: {},
                  turnState: { currentFacing: 'right', currentDepthDiff: 0, inDeadzone: true, isTurning: false },
                  scaleState: { currentScale: 1, currentTorsoHeight: 0, referenceTorsoHeight: 0 },
                  legState: { left: { intent: 'STANDING' as never, kneeHeightDelta: 0, ankleHeightDelta: 0, thighLengthRatio: 1, isLifted: false }, right: { intent: 'STANDING' as never, kneeHeightDelta: 0, ankleHeightDelta: 0, thighLengthRatio: 1, isLifted: false }, overallIntent: 'STANDING' as never, isFlying: false },
                  ikState: { left: { thighAngle: 0, kneeAngle: 0, distance: 0, valid: true }, right: { thighAngle: 0, kneeAngle: 0, distance: 0, valid: true } },
                  calibration: null,
                  isCalibrated: false,
                  frameCount: 0,
                  processingTime: 0,
                })
              } else {
              rendererRef.current.updatePose(null)
              }
            }
          }
        } catch (err) {
          console.debug('MediaPipe detect error:', err)
        }
      }
      
      // Draw skeleton overlay (use ref to get latest pose)
      if (currentPoseRef.current) {
        drawSkeleton(currentPoseRef.current)
      }
      
      animationRef.current = requestAnimationFrame(render)
    }
    
    animationRef.current = requestAnimationFrame(render)
  }, [drawSkeleton, usePipeline])

  // Start camera stream
  const startCamera = useCallback(async () => {
    if (!selectedCameraId || !videoRef.current) return
    
    try {
      if (videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(track => track.stop())
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: selectedCameraId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      })
      
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraActive(true)
      setError(null)
      
      console.log('Camera started, starting render loop...')
      startRenderLoop()
    } catch (err) {
      console.error('Failed to start camera:', err)
      setError('无法启动摄像头。请检查摄像头是否被其他应用占用。')
      setCameraActive(false)
    }
  }, [selectedCameraId, startRenderLoop])

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    
    setCameraActive(false)
    setPoseDetected(false)
    setCurrentPose(null)
    setProcessedPose(null)
    
    // Clear skeleton canvas
    const canvas = skeletonCanvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  // Set default camera
  const handleSetDefaultCamera = async () => {
    if (!selectedCameraId) return
    
    try {
      setSavingDefault(true)
      await adminApi.setDefaultCamera(selectedCameraId)
      setDefaultCameraId(selectedCameraId)
      setError(null)
    } catch (err) {
      console.error('Failed to set default camera:', err)
      setError('保存默认摄像头失败')
    } finally {
      setSavingDefault(false)
    }
  }

  // Handle character selection change
  const handleCharacterChange = async (characterId: string) => {
    setSelectedCharacterId(characterId)
    loadedCharacterRef.current = characterId
    
    if (characterId) {
      await loadCharacterIntoRenderer(characterId, showStaticPose)
    } else {
      setCharacterLoaded(false)
      rendererRef.current?.hide()
    }
  }

  // Handle camera selection change
  const handleCameraChange = (cameraId: string) => {
    setSelectedCameraId(cameraId)
    if (cameraActive) {
      stopCamera()
    }
  }

  // Reset character pose
  const handleResetPose = () => {
    rendererRef.current?.resetPose()
    poseProcessorRef.current?.reset()
  }

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([loadCameras(), loadCharacters()])
      await initMediaPipe()
      initPoseProcessor()
      setLoading(false)
    }
    init()
    
    return () => {
      stopCamera()
      rendererRef.current?.destroy()
    }
  }, [])

  // Track loaded character to prevent duplicate loads
  const loadedCharacterRef = useRef<string>('')
  const rendererInitializedRef = useRef<boolean>(false)

  // Initialize character renderer and load character if selected
  useEffect(() => {
    if (loading || !characterCanvasRef.current) return
    if (rendererInitializedRef.current) return
    
    const initAndLoad = async () => {
      console.log('Initializing character renderer...')
      rendererInitializedRef.current = true
      
      try {
        const renderer = new CharacterRenderer()
        await renderer.init(characterCanvasRef.current!, 640, 480)
        rendererRef.current = renderer
        console.log('Character renderer initialized')
        
        if (selectedCharacterId) {
          console.log('Loading initial character:', selectedCharacterId)
          loadedCharacterRef.current = selectedCharacterId
          await loadCharacterIntoRenderer(selectedCharacterId, showStaticPose)
        }
      } catch (err) {
        console.error('Failed to init character renderer:', err)
        rendererInitializedRef.current = false
      }
    }
    
    initAndLoad()
  }, [loading, selectedCharacterId, showStaticPose, loadCharacterIntoRenderer])

  // Load character when selection changes
  useEffect(() => {
    if (!rendererRef.current || !selectedCharacterId) return
    if (loadedCharacterRef.current === selectedCharacterId) return
    
    console.log('Loading character (selection changed):', selectedCharacterId)
    loadedCharacterRef.current = selectedCharacterId
    loadCharacterIntoRenderer(selectedCharacterId, showStaticPose)
  }, [selectedCharacterId, showStaticPose, loadCharacterIntoRenderer])
  
  // Update static pose visibility without reloading character
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowStaticPose(showStaticPose)
    }
  }, [showStaticPose])

  // Restart camera when camera selection changes
  useEffect(() => {
    if (cameraActive && selectedCameraId) {
      startCamera()
    }
  }, [selectedCameraId])

  if (loading) {
    return (
      <div className="camera-test-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }


  return (
    <div className="camera-test-page">
      <div className="page-header">
        <a href="/admin/dashboard" className="btn-back">← 返回首页</a>
        <h1>摄像头测试</h1>
        <div className="header-actions">
          <label className="toggle-label" style={{ marginRight: 16 }}>
            <input
              type="checkbox"
              checked={usePipeline}
              onChange={(e) => setUsePipeline(e.target.checked)}
            />
            <span>使用处理管线</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="camera-test-layout">
        {/* Left: Controls Panel */}
        <div className="controls-panel">
          <div className="control-group">
            <label>选择摄像头</label>
            <select
              value={selectedCameraId}
              onChange={(e) => handleCameraChange(e.target.value)}
              disabled={cameras.length === 0}
            >
              {cameras.length === 0 ? (
                <option value="">未检测到摄像头</option>
              ) : (
                cameras.map(camera => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                    {camera.deviceId === defaultCameraId ? ' (默认)' : ''}
                  </option>
                ))
              )}
            </select>
            <button
              className="btn-secondary btn-small"
              onClick={handleSetDefaultCamera}
              disabled={!selectedCameraId || selectedCameraId === defaultCameraId || savingDefault}
            >
              {savingDefault ? '保存中...' : '设为默认摄像头'}
            </button>
          </div>

          <div className="control-group">
            <label>选择人物</label>
            <select
              value={selectedCharacterId}
              onChange={(e) => handleCharacterChange(e.target.value)}
              disabled={characters.length === 0}
            >
              <option value="">不显示人物</option>
              {characters.map(char => (
                <option key={char.id} value={char.id}>
                  {char.name} ({char.part_count} 部件)
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>摄像头控制</label>
            <div className="camera-buttons">
              {!cameraActive ? (
                <button className="btn-primary" onClick={startCamera} disabled={!selectedCameraId}>
                  ▶ 启动摄像头
                </button>
              ) : (
                <button className="btn-danger" onClick={stopCamera}>
                  ⏹ 停止摄像头
                </button>
              )}
            </div>
          </div>

          <div className="control-group">
            <label>显示选项</label>
            <div className="toggle-options">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showSkeleton}
                  onChange={(e) => setShowSkeleton(e.target.checked)}
                />
                <span>显示骨骼</span>
              </label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={mirrorMode}
                  onChange={(e) => setMirrorMode(e.target.checked)}
                />
                <span>镜像模式</span>
              </label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showDebugPanel}
                  onChange={(e) => setShowDebugPanel(e.target.checked)}
                />
                <span>调试面板</span>
              </label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showCharacterPreview}
                  onChange={(e) => setShowCharacterPreview(e.target.checked)}
                />
                <span>人物预览</span>
              </label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showStaticPose}
                  onChange={(e) => {
                    setShowStaticPose(e.target.checked)
                    if (rendererRef.current) {
                      rendererRef.current.setShowStaticPose(e.target.checked)
                    }
                  }}
                />
                <span>静态姿势</span>
              </label>
            </div>
          </div>

          {characterLoaded && (
            <div className="control-group">
              <label>人物控制</label>
              <button className="btn-secondary btn-small" onClick={handleResetPose}>
                🔄 重置姿势
              </button>
            </div>
          )}

          <div className="status-panel">
            <h3>状态</h3>
            <div className="status-item">
              <span className={`status-dot ${cameraActive ? 'active' : ''}`}></span>
              <span>摄像头: {cameraActive ? '运行中' : '已停止'}</span>
            </div>
            <div className="status-item">
              <span className={`status-dot ${mediaPipeLoaded ? 'active' : 'warning'}`}></span>
              <span>姿态检测: {mediaPipeLoaded ? '已加载' : '未加载'}</span>
            </div>
            <div className="status-item">
              <span className={`status-dot ${poseDetected ? 'active' : ''}`}></span>
              <span>人物检测: {poseDetected ? '已检测到' : '未检测到'}</span>
            </div>
            <div className="status-item">
              <span className={`status-dot ${characterLoaded ? 'active' : ''}`}></span>
              <span>人物加载: {characterLoaded ? '已加载' : '未加载'}</span>
            </div>
            <div className="status-item">
              <span className={`status-dot ${usePipeline ? 'active' : ''}`}></span>
              <span>处理管线: {usePipeline ? '启用' : '禁用'}</span>
            </div>
            {cameraActive && (
              <div className="status-item fps">
                <span>FPS: {fps}</span>
              </div>
            )}
          </div>
        </div>


        {/* Center: Video Panel */}
        <div className="video-panel">
          <div className={`video-container ${mirrorMode ? 'mirrored' : ''}`}>
            <video
              ref={videoRef}
              className="camera-video"
              playsInline
              muted
            />
            <canvas
              ref={skeletonCanvasRef}
              className="skeleton-canvas"
            />
            {!cameraActive && (
              <div className="video-placeholder">
                <span className="camera-icon">📷</span>
                <p>点击"启动摄像头"开始测试</p>
              </div>
            )}
            {cameraActive && fps > 0 && (
              <div className="fps-overlay">
                {fps} FPS
              </div>
            )}
          </div>
          <div className="video-info">
            {cameraActive && videoRef.current && (
              <span>
                分辨率: {videoRef.current.videoWidth} × {videoRef.current.videoHeight}
              </span>
            )}
          </div>
        </div>

        {/* Right: Character Preview */}
        {showCharacterPreview && (
          <div className="character-panel">
            <div className="character-header">
              <h3>人物预览</h3>
              {characterLoaded && (
                <span className="character-status">✓ 已加载</span>
              )}
            </div>
            <div className="character-container">
              <canvas ref={characterCanvasRef} />
              {!characterLoaded && (
                <div className="character-placeholder">
                  <span>🎭</span>
                  <p>选择人物以预览</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Debug Panel - Motion Capture */}
      {showDebugPanel && usePipeline && (
        <div className="debug-panel-container">
          <MotionCaptureDebugPanel
            config={pipelineConfig}
            onConfigChange={handleConfigChange}
            processedPose={processedPose}
            onCalibrate={handleCalibrate}
            onClearCalibration={handleClearCalibration}
            onExportConfig={handleExportConfig}
            onImportConfig={handleImportConfig}
          />
        </div>
      )}

      {/* Legacy Debug Panel - Raw Pose Data */}
      {showDebugPanel && !usePipeline && currentPose && (
        <div className="debug-panel">
          <h3>姿态数据 (关键点)</h3>
          <div className="debug-grid">
            {Object.entries(LANDMARK_NAMES).map(([idx, name]) => {
              const lm = currentPose[parseInt(idx)]
              if (!lm) return null
              return (
                <div key={idx} className="debug-item">
                  <span className="debug-label">{name} ({idx})</span>
                  <span className="debug-value">
                    x: {lm.x.toFixed(3)}, y: {lm.y.toFixed(3)}
                    {lm.visibility !== undefined && ` (${(lm.visibility * 100).toFixed(0)}%)`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
