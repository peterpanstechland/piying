import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import CharacterUploadForm from '../components/CharacterUploadForm'
import PivotEditor from '../components/PivotEditor'
import SkeletonBindingEditor from '../components/SkeletonBindingEditor'
import './CharacterEditPage.css'

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

interface Character {
  id: string
  name: string
  description: string | null
  parts: CharacterPart[]
  bindings: SkeletonBinding[]
  thumbnail_path: string | null
  created_at: string
  updated_at: string
}

type TabType = 'info' | 'parts' | 'pivot' | 'binding'

export default function CharacterEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [character, setCharacter] = useState<Character | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('info')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadCharacter = useCallback(async () => {
    if (isNew || !id) return
    try {
      setLoading(true)
      const data = await adminApi.getCharacter(id)
      setCharacter(data)
      setName(data.name)
      setDescription(data.description || '')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load character'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [id, isNew])

  useEffect(() => {
    loadCharacter()
  }, [loadCharacter])


  const handleSaveInfo = async () => {
    try {
      setSaving(true)
      setError(null)
      
      if (isNew) {
        const newChar = await adminApi.createCharacter({ name, description })
        navigate(`/characters/${newChar.id}/edit`, { replace: true })
        setSuccessMessage('人物创建成功')
      } else if (id) {
        await adminApi.updateCharacter(id, { name, description })
        setSuccessMessage('保存成功')
        loadCharacter()
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handlePartsUploaded = () => {
    loadCharacter()
    setSuccessMessage('部件上传成功')
  }

  const handlePivotSaved = async (parts: CharacterPart[]) => {
    if (!id) return
    try {
      setSaving(true)
      await adminApi.updateCharacterPivot(id, { parts })
      setSuccessMessage('枢轴配置保存成功')
      loadCharacter()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save pivot config'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleBindingSaved = async (bindings: SkeletonBinding[]) => {
    if (!id) return
    try {
      setSaving(true)
      await adminApi.updateCharacterBinding(id, { bindings })
      setSuccessMessage('骨骼绑定保存成功')
      loadCharacter()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save binding'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  if (loading) {
    return (
      <div className="character-edit-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="character-edit-page">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/characters')}>
          ← 返回列表
        </button>
        <h1>{isNew ? '新建人物' : `编辑: ${character?.name || ''}`}</h1>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {successMessage && (
        <div className="success-banner">
          <span>{successMessage}</span>
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          基本信息
        </button>
        {!isNew && (
          <>
            <button
              className={`tab ${activeTab === 'parts' ? 'active' : ''}`}
              onClick={() => setActiveTab('parts')}
            >
              部件上传
            </button>
            <button
              className={`tab ${activeTab === 'pivot' ? 'active' : ''}`}
              onClick={() => setActiveTab('pivot')}
              disabled={!character?.parts.length}
            >
              枢轴配置
            </button>
            <button
              className={`tab ${activeTab === 'binding' ? 'active' : ''}`}
              onClick={() => setActiveTab('binding')}
              disabled={!character?.parts.length}
            >
              骨骼绑定
            </button>
          </>
        )}
      </div>

      <div className="tab-content">
        {activeTab === 'info' && (
          <div className="info-form">
            <div className="form-group">
              <label htmlFor="name">人物名称 *</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入人物名称"
                maxLength={100}
              />
            </div>
            <div className="form-group">
              <label htmlFor="description">描述</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入人物描述（可选）"
                rows={4}
                maxLength={500}
              />
            </div>
            <div className="form-actions">
              <button
                className="btn-primary"
                onClick={handleSaveInfo}
                disabled={saving || !name.trim()}
              >
                {saving ? '保存中...' : isNew ? '创建人物' : '保存'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'parts' && id && (
          <CharacterUploadForm
            characterId={id}
            existingParts={character?.parts || []}
            onUploadComplete={handlePartsUploaded}
          />
        )}

        {activeTab === 'pivot' && character && (
          <PivotEditor
            parts={character.parts}
            onSave={handlePivotSaved}
            saving={saving}
          />
        )}

        {activeTab === 'binding' && character && (
          <SkeletonBindingEditor
            parts={character.parts}
            bindings={character.bindings}
            onSave={handleBindingSaved}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}
