import { useState, useEffect, useCallback } from 'react'
import './BasicInfoForm.css'

// Common emoji icons for storylines
const ICON_OPTIONS = [
  '⛏️', '🎭', '🎬', '🎪', '🏮', '🎎', '🎨', '🌙',
  '⭐', '🌸', '🐉', '🦋', '🎋', '🏯', '🎑', '🎐',
  '🌺', '🍃', '🎊', '🎉', '🌟', '💫', '✨', '🔮'
]

// Character limits per Requirements 8.1
const SYNOPSIS_CHINESE_LIMIT = 500
const SYNOPSIS_ENGLISH_LIMIT = 1000
const NAME_LIMIT = 100

export interface BasicInfoFormData {
  name: string
  name_en: string
  synopsis: string
  synopsis_en: string
  icon: string
}

interface BasicInfoFormProps {
  initialData?: Partial<BasicInfoFormData>
  onChange?: (data: BasicInfoFormData, isValid: boolean) => void
  onSave?: (data: BasicInfoFormData) => Promise<void>
  saving?: boolean
  disabled?: boolean
}

/**
 * BasicInfoForm component for editing storyline basic information
 * Requirements: 1.1, 8.1, 8.2
 * - Name (Chinese required, English optional)
 * - Synopsis (Chinese required, English optional) with character limits
 * - Icon selection
 */
export default function BasicInfoForm({
  initialData,
  onChange,
  onSave,
  saving = false,
  disabled = false,
}: BasicInfoFormProps) {
  const [name, setName] = useState(initialData?.name || '')
  const [nameEn, setNameEn] = useState(initialData?.name_en || '')
  const [synopsis, setSynopsis] = useState(initialData?.synopsis || '')
  const [synopsisEn, setSynopsisEn] = useState(initialData?.synopsis_en || '')
  const [icon, setIcon] = useState(initialData?.icon || '⛏️')
  const [showIconPicker, setShowIconPicker] = useState(false)

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Get current form data
  const getFormData = useCallback((): BasicInfoFormData => ({
    name: name.trim(),
    name_en: nameEn.trim(),
    synopsis: synopsis.trim(),
    synopsis_en: synopsisEn.trim(),
    icon,
  }), [name, nameEn, synopsis, synopsisEn, icon])

  // Validate form data (Requirements 1.1, 8.2)
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    // Name (Chinese) is required
    if (!name.trim()) {
      newErrors.name = '请输入故事线名称（中文）'
    } else if (name.length > NAME_LIMIT) {
      newErrors.name = `名称不能超过 ${NAME_LIMIT} 个字符`
    }

    // Name (English) length check
    if (nameEn.length > NAME_LIMIT) {
      newErrors.nameEn = `Name cannot exceed ${NAME_LIMIT} characters`
    }

    // Synopsis (Chinese) is required per Requirements 8.2
    if (!synopsis.trim()) {
      newErrors.synopsis = '请输入故事简介（中文）'
    } else if (synopsis.length > SYNOPSIS_CHINESE_LIMIT) {
      newErrors.synopsis = `简介不能超过 ${SYNOPSIS_CHINESE_LIMIT} 个字符`
    }

    // Synopsis (English) length check
    if (synopsisEn.length > SYNOPSIS_ENGLISH_LIMIT) {
      newErrors.synopsisEn = `Synopsis cannot exceed ${SYNOPSIS_ENGLISH_LIMIT} characters`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [name, nameEn, synopsis, synopsisEn])

  // Notify parent of changes
  useEffect(() => {
    if (onChange) {
      const isValid = validateForm()
      onChange(getFormData(), isValid)
    }
  }, [name, nameEn, synopsis, synopsisEn, icon, onChange, getFormData, validateForm])

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '')
      setNameEn(initialData.name_en || '')
      setSynopsis(initialData.synopsis || '')
      setSynopsisEn(initialData.synopsis_en || '')
      setIcon(initialData.icon || '⛏️')
    }
  }, [initialData])

  // Handle save
  const handleSave = async () => {
    console.log('BasicInfoForm handleSave called')
    console.log('validateForm result:', validateForm())
    console.log('onSave exists:', !!onSave)
    console.log('Form data:', getFormData())
    console.log('Errors:', errors)
    
    if (!validateForm()) {
      console.log('Validation failed')
      return
    }
    if (!onSave) {
      console.log('No onSave handler')
      return
    }
    await onSave(getFormData())
  }

  // Handle icon selection
  const handleIconSelect = (selectedIcon: string) => {
    setIcon(selectedIcon)
    setShowIconPicker(false)
  }

  return (
    <div className="basic-info-form">
      <h3 className="basic-info-form__title">基本信息</h3>
      
      <div className="basic-info-form__grid">
        {/* Name (Chinese) - Required */}
        <div className="basic-info-form__group">
          <label htmlFor="storyline-name" className="basic-info-form__label">
            名称 (中文) <span className="required">*</span>
          </label>
          <input
            id="storyline-name"
            type="text"
            className={`basic-info-form__input ${errors.name ? 'error' : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入故事线名称"
            maxLength={NAME_LIMIT}
            disabled={disabled || saving}
          />
          <div className="basic-info-form__meta">
            {errors.name ? (
              <span className="basic-info-form__error">{errors.name}</span>
            ) : (
              <span className="basic-info-form__counter">{name.length}/{NAME_LIMIT}</span>
            )}
          </div>
        </div>

        {/* Name (English) - Optional */}
        <div className="basic-info-form__group">
          <label htmlFor="storyline-name-en" className="basic-info-form__label">
            名称 (英文)
          </label>
          <input
            id="storyline-name-en"
            type="text"
            className={`basic-info-form__input ${errors.nameEn ? 'error' : ''}`}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Enter storyline name"
            maxLength={NAME_LIMIT}
            disabled={disabled || saving}
          />
          <div className="basic-info-form__meta">
            {errors.nameEn ? (
              <span className="basic-info-form__error">{errors.nameEn}</span>
            ) : (
              <span className="basic-info-form__counter">{nameEn.length}/{NAME_LIMIT}</span>
            )}
          </div>
        </div>

        {/* Synopsis (Chinese) - Required */}
        <div className="basic-info-form__group full-width">
          <label htmlFor="storyline-synopsis" className="basic-info-form__label">
            故事简介 (中文) <span className="required">*</span>
          </label>
          <textarea
            id="storyline-synopsis"
            className={`basic-info-form__textarea ${errors.synopsis ? 'error' : ''}`}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="输入故事简介，将显示在前端故事选择页面"
            maxLength={SYNOPSIS_CHINESE_LIMIT}
            rows={4}
            disabled={disabled || saving}
          />
          <div className="basic-info-form__meta">
            {errors.synopsis ? (
              <span className="basic-info-form__error">{errors.synopsis}</span>
            ) : (
              <span className="basic-info-form__counter">{synopsis.length}/{SYNOPSIS_CHINESE_LIMIT}</span>
            )}
          </div>
        </div>

        {/* Synopsis (English) - Optional */}
        <div className="basic-info-form__group full-width">
          <label htmlFor="storyline-synopsis-en" className="basic-info-form__label">
            故事简介 (英文)
          </label>
          <textarea
            id="storyline-synopsis-en"
            className={`basic-info-form__textarea ${errors.synopsisEn ? 'error' : ''}`}
            value={synopsisEn}
            onChange={(e) => setSynopsisEn(e.target.value)}
            placeholder="Enter story synopsis for frontend scene selection page"
            maxLength={SYNOPSIS_ENGLISH_LIMIT}
            rows={4}
            disabled={disabled || saving}
          />
          <div className="basic-info-form__meta">
            {errors.synopsisEn ? (
              <span className="basic-info-form__error">{errors.synopsisEn}</span>
            ) : (
              <span className="basic-info-form__counter">{synopsisEn.length}/{SYNOPSIS_ENGLISH_LIMIT}</span>
            )}
          </div>
        </div>

        {/* Icon Selection */}
        <div className="basic-info-form__group">
          <label className="basic-info-form__label">图标</label>
          <div className="basic-info-form__icon-selector">
            <button
              type="button"
              className="basic-info-form__icon-button"
              onClick={() => setShowIconPicker(!showIconPicker)}
              disabled={disabled || saving}
            >
              <span className="basic-info-form__icon-preview">{icon}</span>
              <span className="basic-info-form__icon-label">选择图标</span>
            </button>
            
            {showIconPicker && (
              <div className="basic-info-form__icon-picker">
                {ICON_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`basic-info-form__icon-option ${icon === emoji ? 'selected' : ''}`}
                    onClick={() => handleIconSelect(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      {onSave && (
        <div className="basic-info-form__actions">
          <button
            type="button"
            className="basic-info-form__save-btn"
            onClick={handleSave}
            disabled={disabled || saving || Object.keys(errors).length > 0}
          >
            {saving ? '保存中...' : '保存基本信息'}
          </button>
        </div>
      )}
    </div>
  )
}
