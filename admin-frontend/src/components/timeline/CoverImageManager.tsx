import { useRef, useState, useCallback } from 'react'
import './CoverImageManager.css'

interface CoverImage {
  original_path: string
  thumbnail_path: string
  medium_path: string
  large_path: string
}

interface CoverImageManagerProps {
  storylineId: string
  currentCover: CoverImage | null
  videoUrl: string | null
  currentTime: number
  onUpload: (file: File) => Promise<void>
  onFrameCapture: (timestamp: number) => Promise<void>
  onDelete: () => Promise<void>
  /** Optional: Video element ref for capturing frames directly */
  videoRef?: React.RefObject<HTMLVideoElement>
}

// Accepted image formats (Requirements 9.1)
const ACCEPTED_IMAGE_FORMATS = '.png,.jpg,.jpeg,.webp'
const VALID_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

/**
 * CoverImageManager - Manager for storyline cover images
 * Requirements: 9.1, 9.2, 9.4, 9.5 - Upload, capture, and manage cover images
 */
export default function CoverImageManager({
  storylineId,
  currentCover,
  videoUrl,
  currentTime,
  onUpload,
  onFrameCapture,
  onDelete,
  videoRef,
}: CoverImageManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showCapturePreview, setShowCapturePreview] = useState(false)
  const [capturePreviewImage, setCapturePreviewImage] = useState<string | null>(null)
  const [captureTimestamp, setCaptureTimestamp] = useState<number>(0)

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type (Requirements 9.1)
    if (!VALID_MIME_TYPES.includes(file.type)) {
      alert('请选择 PNG、JPG 或 WebP 格式的图片 / Please select PNG, JPG, or WebP image')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (event) => {
      setPreviewImage(event.target?.result as string)
      setPendingFile(file)
    }
    reader.readAsDataURL(file)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Confirm upload
  const handleConfirmUpload = async () => {
    if (!pendingFile) return

    setIsUploading(true)
    try {
      await onUpload(pendingFile)
      setPreviewImage(null)
      setPendingFile(null)
    } catch (error) {
      console.error('Failed to upload cover image:', error)
      alert('上传失败，请重试 / Upload failed, please try again')
    } finally {
      setIsUploading(false)
    }
  }

  // Cancel upload preview
  const handleCancelUpload = () => {
    setPreviewImage(null)
    setPendingFile(null)
  }

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  // Capture frame from video element (Requirements 9.2)
  const captureFrameFromVideo = useCallback((): string | null => {
    if (!videoRef?.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return null

    // Set canvas size to match video dimensions
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // Convert to base64 image
    return canvas.toDataURL('image/jpeg', 0.9)
  }, [videoRef])

  // Handle frame capture preview (Requirements 9.2)
  const handleShowCapturePreview = useCallback(() => {
    if (!videoUrl) {
      alert('请先上传视频 / Please upload a video first')
      return
    }

    // Try to capture frame from video element for visual preview
    const frameData = captureFrameFromVideo()
    if (frameData) {
      setCapturePreviewImage(frameData)
    } else {
      // Fallback: show text-based preview if video ref not available
      setCapturePreviewImage(null)
    }
    
    setCaptureTimestamp(currentTime)
    setShowCapturePreview(true)
  }, [videoUrl, currentTime, captureFrameFromVideo])

  // Confirm frame capture
  const handleConfirmCapture = async () => {
    setIsCapturing(true)
    try {
      await onFrameCapture(captureTimestamp)
      setShowCapturePreview(false)
      setCapturePreviewImage(null)
      setCaptureTimestamp(0)
    } catch (error) {
      console.error('Failed to capture frame:', error)
      alert('截取失败，请重试 / Capture failed, please try again')
    } finally {
      setIsCapturing(false)
    }
  }

  // Cancel capture preview
  const handleCancelCapture = () => {
    setShowCapturePreview(false)
    setCapturePreviewImage(null)
    setCaptureTimestamp(0)
  }

  // Handle delete cover image (Requirements 9.4)
  const handleDelete = async () => {
    if (!currentCover) return

    const confirmed = window.confirm(
      '确定要删除封面图片吗？将使用视频第一帧作为默认封面。\n' +
      'Are you sure you want to delete the cover image? The first frame of the video will be used as default.'
    )
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await onDelete()
    } catch (error) {
      console.error('Failed to delete cover image:', error)
      alert('删除失败，请重试 / Delete failed, please try again')
    } finally {
      setIsDeleting(false)
    }
  }

  // Build cover image URL
  const getCoverImageUrl = () => {
    if (currentCover?.large_path) {
      return `/api/admin/storylines/${storylineId}/cover/large`
    }
    return null
  }

  const coverImageUrl = getCoverImageUrl()

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`
  }

  return (
    <div className="cover-image-manager">
      <div className="cover-image-manager__header">
        <h3 className="cover-image-manager__title">
          封面图片
          <span className="cover-image-manager__title-en">Cover Image</span>
        </h3>
      </div>

      {/* Current Cover or Placeholder */}
      <div className="cover-image-manager__preview-container">
        {previewImage ? (
          // Upload Preview
          <div className="cover-image-manager__preview cover-image-manager__preview--pending">
            <img
              src={previewImage}
              alt="Upload Preview"
              className="cover-image-manager__image"
            />
            <div className="cover-image-manager__preview-badge">预览 / Preview</div>
          </div>
        ) : showCapturePreview ? (
          // Capture Preview - show actual frame image if available
          <div className="cover-image-manager__preview cover-image-manager__preview--capture">
            {capturePreviewImage ? (
              // Visual preview of captured frame (Requirements 9.2)
              <>
                <img
                  src={capturePreviewImage}
                  alt="Frame Preview"
                  className="cover-image-manager__image"
                />
                <div className="cover-image-manager__preview-badge cover-image-manager__preview-badge--capture">
                  📷 {formatTime(captureTimestamp)}
                </div>
              </>
            ) : (
              // Fallback text-based preview
              <div className="cover-image-manager__capture-info">
                <span className="cover-image-manager__capture-icon">📷</span>
                <span className="cover-image-manager__capture-text">
                  将截取当前帧作为封面
                </span>
                <span className="cover-image-manager__capture-time">
                  时间点: {formatTime(captureTimestamp)}
                </span>
              </div>
            )}
          </div>
        ) : coverImageUrl ? (
          // Current Cover
          <div className="cover-image-manager__preview">
            <img
              src={coverImageUrl}
              alt="Cover"
              className="cover-image-manager__image"
            />
          </div>
        ) : (
          // Placeholder (Requirements 9.5)
          <div className="cover-image-manager__placeholder">
            <span className="cover-image-manager__placeholder-icon">🖼️</span>
            <span className="cover-image-manager__placeholder-text">
              暂无封面图片
            </span>
            <span className="cover-image-manager__placeholder-hint">
              {videoUrl 
                ? '将使用视频第一帧作为默认封面'
                : '请先上传视频'}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="cover-image-manager__actions">
        {previewImage ? (
          // Upload confirmation actions
          <>
            <button
              className="cover-image-manager__btn cover-image-manager__btn--primary"
              onClick={handleConfirmUpload}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <span className="cover-image-manager__btn-icon">⏳</span>
                  上传中...
                </>
              ) : (
                <>
                  <span className="cover-image-manager__btn-icon">✓</span>
                  确认上传
                </>
              )}
            </button>
            <button
              className="cover-image-manager__btn cover-image-manager__btn--secondary"
              onClick={handleCancelUpload}
              disabled={isUploading}
            >
              <span className="cover-image-manager__btn-icon">✕</span>
              取消
            </button>
          </>
        ) : showCapturePreview ? (
          // Capture confirmation actions
          <>
            <button
              className="cover-image-manager__btn cover-image-manager__btn--primary"
              onClick={handleConfirmCapture}
              disabled={isCapturing}
            >
              {isCapturing ? (
                <>
                  <span className="cover-image-manager__btn-icon">⏳</span>
                  截取中...
                </>
              ) : (
                <>
                  <span className="cover-image-manager__btn-icon">✓</span>
                  确认截取
                </>
              )}
            </button>
            <button
              className="cover-image-manager__btn cover-image-manager__btn--secondary"
              onClick={handleCancelCapture}
              disabled={isCapturing}
            >
              <span className="cover-image-manager__btn-icon">✕</span>
              取消
            </button>
          </>
        ) : (
          // Normal actions
          <>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_FORMATS}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {/* Upload button */}
            <button
              className="cover-image-manager__btn cover-image-manager__btn--primary"
              onClick={handleUploadClick}
            >
              <span className="cover-image-manager__btn-icon">📤</span>
              上传封面
            </button>

            {/* Frame capture button */}
            <button
              className="cover-image-manager__btn cover-image-manager__btn--secondary"
              onClick={handleShowCapturePreview}
              disabled={!videoUrl}
              title={!videoUrl ? '请先上传视频' : '截取当前视频帧作为封面'}
            >
              <span className="cover-image-manager__btn-icon">📷</span>
              截取当前帧
            </button>

            {/* Delete button */}
            {currentCover && (
              <button
                className="cover-image-manager__btn cover-image-manager__btn--danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="cover-image-manager__btn-icon">⏳</span>
                    删除中...
                  </>
                ) : (
                  <>
                    <span className="cover-image-manager__btn-icon">🗑️</span>
                    删除封面
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Hints */}
      <div className="cover-image-manager__hints">
        <p className="cover-image-manager__hint">
          支持 PNG、JPG、WebP 格式，建议尺寸 800×600 像素以上
        </p>
        <p className="cover-image-manager__hint cover-image-manager__hint--en">
          Supports PNG, JPG, WebP. Recommended size: 800×600 pixels or larger
        </p>
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
