import { useState, useRef, useCallback } from 'react'
import { adminApi } from '../services/api'
import './CharacterUploadForm.css'

const REQUIRED_PARTS = [
  'head', 'body', 'left-arm', 'right-arm',
  'left-hand', 'right-hand', 'left-foot', 'right-foot', 'upper-leg'
]

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

interface CharacterPart {
  name: string
  file_path: string
  pivot_x: number
  pivot_y: number
  z_index: number
  connections: string[]
}

interface UploadFile {
  file: File
  partName: string
  preview: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface Props {
  characterId: string
  existingParts: CharacterPart[]
  onUploadComplete: () => void
}

export default function CharacterUploadForm({ characterId, existingParts, onUploadComplete }: Props) {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const existingPartNames = existingParts.map(p => p.name)
  const missingParts = REQUIRED_PARTS.filter(p => !existingPartNames.includes(p))

  const handleDeletePart = async (partName: string) => {
    if (!confirm(`确定要删除 "${PART_LABELS[partName] || partName}" 吗？`)) return
    
    try {
      setDeleting(partName)
      await adminApi.deleteCharacterPart(characterId, partName)
      onUploadComplete() // Refresh the parts list
    } catch (err) {
      console.error('Failed to delete part:', err)
      alert('删除失败，请重试')
    } finally {
      setDeleting(null)
    }
  }

  const validateFile = (file: File): string | null => {
    if (!file.type.includes('png')) {
      return '只支持 PNG 格式'
    }
    if (file.size > 10 * 1024 * 1024) {
      return '文件大小不能超过 10MB'
    }
    return null
  }

  const guessPartName = (filename: string): string => {
    const name = filename.toLowerCase().replace('.png', '')
    for (const part of REQUIRED_PARTS) {
      if (name.includes(part.replace('-', '')) || name.includes(part)) {
        return part
      }
    }
    // Try common variations
    if (name.includes('leftarm') || name.includes('left_arm')) return 'left-arm'
    if (name.includes('rightarm') || name.includes('right_arm')) return 'right-arm'
    if (name.includes('lefthand') || name.includes('left_hand')) return 'left-hand'
    if (name.includes('righthand') || name.includes('right_hand')) return 'right-hand'
    if (name.includes('leftfoot') || name.includes('left_foot')) return 'left-foot'
    if (name.includes('rightfoot') || name.includes('right_foot')) return 'right-foot'
    if (name.includes('upperleg') || name.includes('upper_leg') || name.includes('leg')) return 'upper-leg'
    return ''
  }


  const handleFiles = useCallback((files: FileList | File[]) => {
    const newFiles: UploadFile[] = []
    
    Array.from(files).forEach(file => {
      const error = validateFile(file)
      const partName = guessPartName(file.name)
      
      newFiles.push({
        file,
        partName,
        preview: URL.createObjectURL(file),
        status: error ? 'error' : 'pending',
        error: error || undefined
      })
    })
    
    setUploadFiles(prev => [...prev, ...newFiles])
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
    }
  }

  const updatePartName = (index: number, partName: string) => {
    setUploadFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, partName } : f
    ))
  }

  const removeFile = (index: number) => {
    setUploadFiles(prev => {
      const file = prev[index]
      URL.revokeObjectURL(file.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleUpload = async () => {
    const validFiles = uploadFiles.filter(f => f.status === 'pending' && f.partName)
    if (validFiles.length === 0) return

    setUploading(true)
    
    for (let i = 0; i < uploadFiles.length; i++) {
      const uploadFile = uploadFiles[i]
      if (uploadFile.status !== 'pending' || !uploadFile.partName) continue

      setUploadFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: 'uploading' } : f
      ))

      try {
        const formData = new FormData()
        formData.append('file', uploadFile.file)
        formData.append('part_name', uploadFile.partName)
        
        await adminApi.uploadCharacterParts(characterId, formData)
        
        setUploadFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'success' } : f
        ))
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Upload failed'
        setUploadFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'error', error: errorMessage } : f
        ))
      }
    }

    setUploading(false)
    onUploadComplete()
  }

  const pendingCount = uploadFiles.filter(f => f.status === 'pending' && f.partName).length
  const hasErrors = uploadFiles.some(f => f.status === 'error')
  const hasMissingPartNames = uploadFiles.some(f => f.status === 'pending' && !f.partName)

  return (
    <div className="character-upload-form">
      {missingParts.length > 0 && (
        <div className="missing-parts-warning">
          <strong>缺少必需部件:</strong>
          <div className="missing-parts-list">
            {missingParts.map(part => (
              <span key={part} className="missing-part-tag">
                {PART_LABELS[part] || part}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".png"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="drop-zone-content">
          <span className="drop-icon">📁</span>
          <p>拖拽 PNG 文件到此处，或点击选择文件</p>
          <p className="hint">支持多文件上传，文件名会自动匹配部件名称</p>
        </div>
      </div>

      {uploadFiles.length > 0 && (
        <div className="upload-list">
          <h3>待上传文件</h3>
          {uploadFiles.map((uploadFile, index) => (
            <div key={index} className={`upload-item ${uploadFile.status}`}>
              <div className="upload-preview">
                <img src={uploadFile.preview} alt={uploadFile.file.name} />
              </div>
              <div className="upload-info">
                <div className="file-name">{uploadFile.file.name}</div>
                <select
                  value={uploadFile.partName}
                  onChange={(e) => updatePartName(index, e.target.value)}
                  disabled={uploadFile.status !== 'pending'}
                  className={!uploadFile.partName ? 'error' : ''}
                >
                  <option value="">选择部件类型</option>
                  {REQUIRED_PARTS.map(part => (
                    <option key={part} value={part}>
                      {PART_LABELS[part] || part}
                    </option>
                  ))}
                </select>
                {uploadFile.error && (
                  <div className="upload-error">{uploadFile.error}</div>
                )}
              </div>
              <div className="upload-status">
                {uploadFile.status === 'pending' && (
                  <button className="btn-remove" onClick={() => removeFile(index)}>×</button>
                )}
                {uploadFile.status === 'uploading' && (
                  <div className="uploading-spinner"></div>
                )}
                {uploadFile.status === 'success' && (
                  <span className="status-success">✓</span>
                )}
                {uploadFile.status === 'error' && (
                  <span className="status-error">✗</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadFiles.length > 0 && (
        <div className="upload-actions">
          <button
            className="btn-secondary"
            onClick={() => setUploadFiles([])}
            disabled={uploading}
          >
            清空列表
          </button>
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={uploading || pendingCount === 0 || hasMissingPartNames}
          >
            {uploading ? '上传中...' : `上传 ${pendingCount} 个文件`}
          </button>
        </div>
      )}

      {hasErrors && (
        <div className="upload-errors-summary">
          部分文件上传失败，请检查错误信息后重试
        </div>
      )}

      <div className="existing-parts">
        <h3>已上传部件</h3>
        {existingParts.length === 0 ? (
          <p className="no-parts">暂无已上传的部件</p>
        ) : (
          <div className="parts-grid">
            {existingParts.map(part => (
              <div key={part.name} className="part-item">
                <div className="part-preview">
                  <img 
                    src={`/api/admin/characters/${characterId}/parts/${part.name}`} 
                    alt={part.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
                <div className="part-info">
                  <div className="part-name">{PART_LABELS[part.name] || part.name}</div>
                  <button
                    className="btn-delete-part"
                    onClick={() => handleDeletePart(part.name)}
                    disabled={deleting === part.name}
                    title="删除部件"
                  >
                    {deleting === part.name ? '...' : '×'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
