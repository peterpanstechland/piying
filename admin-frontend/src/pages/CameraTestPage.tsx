import { useState, useEffect, useRef, useCallback } from 'react'
import { adminApi } from '../services/api'
import './CameraTestPage.css'

interface CharacterListItem {
  id: string
  name: string
  description: string | null
  thumbnail_path: string | null
  part_count: number
}

interface CharacterPart {
  name: string
  file_path: string
  pivot_x: number
  pivot_y: number
  z_index: number
  connections: string[]
}

interface SkeletonBinding {
  part_name: string
  landmarks: number[]
  rotation_landmark: number | null
  scale_landmarks: number[]
}

interface CharacterDetail {
  id: string
  name: string
  parts: CharacterPart[]
  bindings: SkeletonBinding[]
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

export default function CameraTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const poseDetectorRef = useRef<any>(null)
  const partImagesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [defaultCameraId, setDefaultCameraId] = useState<string>('')
  const [characters, setCharacters] = useState<CharacterListItem[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('')
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [poseDetected, setPoseDetected] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)
  const [mediaPipeLoaded, setMediaPipeLoaded] = useState(false)
  const [currentPose, setCurrentPose] = useState<any>(null)

  // Load available cameras
  const loadCameras = useCallback(async () => {
    try {
      // Request camera permission first to get labels
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
      
      // Try to get default camera from backend
      try {
        const cameraSettings = await adminApi.getCameras()
        if (cameraSettings.default_camera_id) {
          setDefaultCameraId(cameraSettings.default_camera_id)
          // Select default camera if available
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
        // If backend call fails, just use first camera
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
      if (data.length > 0) {
        setSelectedCharacterId(data[0].id)
      }
    } catch (err) {
      console.error('Failed to load characters:', err)
      setError('加载人物列表失败')
    }
  }, [])

  // Load selected character details
  const loadCharacterDetails = useCallback(async (characterId: string) => {
    if (!characterId) {
      setSelectedCharacter(null)
      return
    }
    
    try {
      const data = await adminApi.getCharacter(characterId)
      setSelectedCharacter(data)
      
      // Preload part images
      const imageMap = new Map<string, HTMLImageElement>()
      for (const part of data.parts) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = adminApi.getCharacterPartImageUrl(characterId, part.name)
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
        }).catch(() => {
          console.warn(`Failed to load image for part: ${part.name}`)
        })
        imageMap.set(part.name, img)
      }
      partImagesRef.current = imageMap
    } catch (err) {
      console.error('Failed to load character details:', err)
    }
  }, [])

  // Initialize MediaPipe Pose
  const initMediaPipe = useCallback(async () => {
    try {
      // Check if MediaPipe is available
      if (typeof window !== 'undefined' && (window as any).Pose) {
        const Pose = (window as any).Pose
        const pose = new Pose({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
          }
        })
        
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        })
        
        pose.onResults((results: any) => {
          if (results.poseLandmarks) {
            setPoseDetected(true)
            setCurrentPose(results.poseLandmarks)
          } else {
            setPoseDetected(false)
            setCurrentPose(null)
          }
        })
        
        await pose.initialize()
        poseDetectorRef.current = pose
        setMediaPipeLoaded(true)
      } else {
        console.warn('MediaPipe Pose not loaded, skeleton overlay will be disabled')
        setMediaPipeLoaded(false)
      }
    } catch (err) {
      console.error('Failed to initialize MediaPipe:', err)
      setMediaPipeLoaded(false)
    }
  }, [])

  // Start camera stream
  const startCamera = useCallback(async () => {
    if (!selectedCameraId || !videoRef.current) return
    
    try {
      // Stop any existing stream
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
      
      // Start render loop
      startRenderLoop()
    } catch (err) {
      console.error('Failed to start camera:', err)
      setError('无法启动摄像头。请检查摄像头是否被其他应用占用。')
      setCameraActive(false)
    }
  }, [selectedCameraId])

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
  }, [])

  // Render loop for canvas overlay
  const startRenderLoop = useCallback(() => {
    const render = async () => {
      if (!videoRef.current || !canvasRef.current) {
        animationRef.current = requestAnimationFrame(render)
        return
      }
      
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (!ctx || video.readyState < 2) {
        animationRef.current = requestAnimationFrame(render)
        return
      }
      
      // Match canvas size to video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Send frame to MediaPipe for pose detection
      if (poseDetectorRef.current && mediaPipeLoaded) {
        try {
          await poseDetectorRef.current.send({ image: video })
        } catch (err) {
          // Ignore send errors
        }
      }
      
      // Draw character overlay if pose detected
      if (currentPose && selectedCharacter) {
        drawCharacterOverlay(ctx, canvas.width, canvas.height, currentPose, selectedCharacter)
      } else if (currentPose) {
        // Draw skeleton if no character selected
        drawSkeleton(ctx, canvas.width, canvas.height, currentPose)
      }
      
      animationRef.current = requestAnimationFrame(render)
    }
    
    animationRef.current = requestAnimationFrame(render)
  }, [currentPose, selectedCharacter, mediaPipeLoaded])

  // Draw skeleton visualization
  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    landmarks: any[]
  ) => {
    // Draw connections
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 3
    
    for (const [start, end] of POSE_CONNECTIONS) {
      const startLm = landmarks[start]
      const endLm = landmarks[end]
      
      if (startLm && endLm && startLm.visibility > 0.5 && endLm.visibility > 0.5) {
        ctx.beginPath()
        ctx.moveTo(startLm.x * width, startLm.y * height)
        ctx.lineTo(endLm.x * width, endLm.y * height)
        ctx.stroke()
      }
    }
    
    // Draw landmarks
    ctx.fillStyle = '#ff0000'
    for (const landmark of landmarks) {
      if (landmark.visibility > 0.5) {
        ctx.beginPath()
        ctx.arc(landmark.x * width, landmark.y * height, 5, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  }

  // Draw character parts overlay
  const drawCharacterOverlay = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    landmarks: any[],
    character: CharacterDetail
  ) => {
    // Sort parts by z-index
    const sortedParts = [...character.parts].sort((a, b) => a.z_index - b.z_index)
    
    for (const part of sortedParts) {
      const binding = character.bindings.find(b => b.part_name === part.name)
      const img = partImagesRef.current.get(part.name)
      
      if (!img || !binding || binding.landmarks.length === 0) continue
      
      // Calculate position from landmarks
      const partLandmarks = binding.landmarks
        .map(idx => landmarks[idx])
        .filter(lm => lm && lm.visibility > 0.3)
      
      if (partLandmarks.length === 0) continue
      
      // Calculate center position
      const centerX = partLandmarks.reduce((sum, lm) => sum + lm.x, 0) / partLandmarks.length * width
      const centerY = partLandmarks.reduce((sum, lm) => sum + lm.y, 0) / partLandmarks.length * height
      
      // Calculate scale based on distance between scale landmarks
      let scale = 1
      if (binding.scale_landmarks.length >= 2) {
        const lm1 = landmarks[binding.scale_landmarks[0]]
        const lm2 = landmarks[binding.scale_landmarks[1]]
        if (lm1 && lm2 && lm1.visibility > 0.3 && lm2.visibility > 0.3) {
          const dist = Math.sqrt(
            Math.pow((lm2.x - lm1.x) * width, 2) +
            Math.pow((lm2.y - lm1.y) * height, 2)
          )
          scale = dist / 100 // Normalize scale
        }
      }
      
      // Calculate rotation
      let rotation = 0
      if (binding.rotation_landmark !== null && binding.landmarks.length >= 2) {
        const rotLm = landmarks[binding.rotation_landmark]
        const baseLm = landmarks[binding.landmarks[0]]
        if (rotLm && baseLm && rotLm.visibility > 0.3 && baseLm.visibility > 0.3) {
          rotation = Math.atan2(
            (rotLm.y - baseLm.y) * height,
            (rotLm.x - baseLm.x) * width
          )
        }
      }
      
      // Draw part
      const partWidth = img.width * scale * 0.5
      const partHeight = img.height * scale * 0.5
      
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(rotation)
      ctx.globalAlpha = 0.8
      ctx.drawImage(
        img,
        -partWidth * part.pivot_x,
        -partHeight * part.pivot_y,
        partWidth,
        partHeight
      )
      ctx.restore()
    }
  }

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
    await loadCharacterDetails(characterId)
  }

  // Handle camera selection change
  const handleCameraChange = (cameraId: string) => {
    setSelectedCameraId(cameraId)
    if (cameraActive) {
      stopCamera()
    }
  }

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([loadCameras(), loadCharacters()])
      await initMediaPipe()
      setLoading(false)
    }
    init()
    
    return () => {
      stopCamera()
      if (poseDetectorRef.current) {
        poseDetectorRef.current.close?.()
      }
    }
  }, [loadCameras, loadCharacters, initMediaPipe, stopCamera])

  // Load character details when selection changes
  useEffect(() => {
    if (selectedCharacterId) {
      loadCharacterDetails(selectedCharacterId)
    }
  }, [selectedCharacterId, loadCharacterDetails])

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
        <h1>摄像头测试</h1>
        <div className="header-actions">
          <a href="/characters" className="btn-secondary">返回人物管理</a>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="camera-test-layout">
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
              <option value="">不显示人物叠加</option>
              {characters.map(char => (
                <option key={char.id} value={char.id}>
                  {char.name} ({char.part_count} 个部件)
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>摄像头控制</label>
            <div className="camera-buttons">
              {!cameraActive ? (
                <button
                  className="btn-primary"
                  onClick={startCamera}
                  disabled={!selectedCameraId}
                >
                  启动摄像头
                </button>
              ) : (
                <button
                  className="btn-danger"
                  onClick={stopCamera}
                >
                  停止摄像头
                </button>
              )}
            </div>
          </div>

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
              <span className={`status-dot ${selectedCharacter ? 'active' : ''}`}></span>
              <span>人物叠加: {selectedCharacter ? selectedCharacter.name : '未选择'}</span>
            </div>
          </div>

          {!mediaPipeLoaded && (
            <div className="info-banner">
              <p>
                <strong>提示:</strong> MediaPipe 姿态检测未加载。
                骨骼叠加功能需要加载 MediaPipe 库。
              </p>
            </div>
          )}
        </div>

        <div className="video-panel">
          <div className="video-container">
            <video
              ref={videoRef}
              className="camera-video"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="overlay-canvas"
            />
            {!cameraActive && (
              <div className="video-placeholder">
                <span className="camera-icon">📷</span>
                <p>点击"启动摄像头"开始测试</p>
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
      </div>
    </div>
  )
}
