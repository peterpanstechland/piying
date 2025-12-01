import { useRef, useState } from 'react'
import './GuidanceEditor.css'

interface GuidanceEditorProps {
  guidanceText: string
  guidanceTextEn: string
  guidanceImage: string | null
  storylineId?: string
  segmentId: string
  onTextChange: (text: string, textEn: string) => void
  onImageUpload: (file: File) => Promise<void>
  onFrameCapture: () => Promise<void>
}

// Accepted image formats
const ACCEPTED_IMAGE_FORMATS = '.png,.jpg,.jpeg'

/**
 * GuidanceEditor - Editor for segment guidance text and images
 * Requirements: 8.4, 12.1, 12.2 - Configure guidance text and images
 */
export default function GuidanceEditor({
  guidanceText,
  guidanceTextEn,
  guidanceImage,
  storylineId,
  segmentId,
  onTextChange,
  onImageUpload,
  onFrameCapture,
}: GuidanceEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)

  // Handle Chinese text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTextChange(e.target.value, guidanceTextEn)
  }

  // Handle English text change
  const handleTextEnChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTextChange(guidanceText, e.target.value)
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg']
    if (!validTypes.includes(file.type)) {
      alert('请选择 PNG 或 JPG 格式的图片 / Please select PNG or JPG image')
      return
    }

    setIsUploading(true)
    try {
      await onImageUpload(file)
    } catch (error) {
      console.error('Failed to upload guidance image:', error)
      alert('上传失败，请重试 / Upload failed, please try again')
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle frame capture
  const handleFrameCapture = async () => {
    setIsCapturing(true)
    try {
      await onFrameCapture()
    } catch (error) {
      console.error('Failed to capture frame:', error)
      alert('截取失败，请重试 / Capture failed, please try again')
    } finally {
      setIsCapturing(false)
    }
  }

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  // Build image URL
  const imageUrl = guidanceImage
    ? `/api/admin/storylines/${storylineId}/segments/${segmentId}/guidance-image`
    : null

  return (
    <div className="guidance-editor">
      {/* Chinese Text */}
      <div className="guidance-editor__field">
        <label className="guidance-editor__label">
          引导文字 (中文)
          <span className="guidance-editor__label-en">Guidance Text (Chinese)</span>
        </label>
        <textarea
          className="guidance-editor__textarea"
          value={guidanceText}
          onChange={handleTextChange}
          placeholder="输入引导文字..."
          rows={3}
        />
      </div>

      {/* English Text */}
      <div className="guidance-editor__field">
        <label className="guidance-editor__label">
          引导文字 (英文)
          <span className="guidance-editor__label-en">Guidance Text (English)</span>
        </label>
        <textarea
          className="guidance-editor__textarea"
          value={guidanceTextEn}
          onChange={handleTextEnChange}
          placeholder="Enter guidance text..."
          rows={3}
        />
      </div>

      {/* Guidance Image */}
      <div className="guidance-editor__field">
        <label className="guidance-editor__label">
          引导图片
          <span className="guidance-editor__label-en">Guidance Image</span>
        </label>

        {/* Image Preview */}
        <div className="guidance-editor__image-container">
          {guidanceImage && imageUrl ? (
            <div className="guidance-editor__image-preview">
              <img
                src={imageUrl}
                alt="Guidance"
                className="guidance-editor__image"
              />
            </div>
          ) : (
            <div className="guidance-editor__image-placeholder">
              <span className="guidance-editor__placeholder-icon">🖼️</span>
              <span className="guidance-editor__placeholder-text">
                暂无引导图片
              </span>
              <span className="guidance-editor__placeholder-hint">
                No guidance image set
              </span>
            </div>
          )}
        </div>

        {/* Image Actions */}
        <div className="guidance-editor__image-actions">
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
            className="guidance-editor__btn"
            onClick={handleUploadClick}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <span className="guidance-editor__btn-icon">⏳</span>
                上传中...
              </>
            ) : (
              <>
                <span className="guidance-editor__btn-icon">📤</span>
                上传图片
              </>
            )}
          </button>

          {/* Frame capture button */}
          <button
            className="guidance-editor__btn guidance-editor__btn--secondary"
            onClick={handleFrameCapture}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <>
                <span className="guidance-editor__btn-icon">⏳</span>
                截取中...
              </>
            ) : (
              <>
                <span className="guidance-editor__btn-icon">📷</span>
                截取当前帧
              </>
            )}
          </button>
        </div>

        <div className="guidance-editor__hint">
          支持 PNG、JPG 格式 / Supports PNG, JPG formats
        </div>
      </div>
    </div>
  )
}
