/**
 * CharacterSelector Component
 * 
 * Multi-select interface for configuring available characters for a storyline.
 * Implements Requirements 7.1, 7.2, 7.3, 7.4:
 * - Display all characters with thumbnails (7.1)
 * - Checkbox selection with 1-10 limit (7.2)
 * - Radio button for default character (7.3)
 * - Drag-to-reorder functionality (7.4)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { adminApi } from '../../services/api'
import './CharacterSelector.css'

interface Character {
  id: string
  name: string
  description?: string
  thumbnail_path?: string
}

interface CharacterSelectorProps {
  /** All available characters in the system */
  allCharacters?: Character[]
  /** Currently selected character IDs */
  selectedCharacterIds: string[]
  /** ID of the default character */
  defaultCharacterId: string | null
  /** Callback when selection changes */
  onSelectionChange: (characterIds: string[]) => void
  /** Callback when default character changes */
  onDefaultChange: (characterId: string) => void
  /** Callback when display order changes via drag */
  onReorder: (characterIds: string[]) => void
  /** Whether the component is disabled */
  disabled?: boolean
}

// Minimum and maximum character selection limits (Requirements 7.2)
const MIN_CHARACTERS = 1
const MAX_CHARACTERS = 10

export default function CharacterSelector({
  allCharacters: propCharacters,
  selectedCharacterIds,
  defaultCharacterId,
  onSelectionChange,
  onDefaultChange,
  onReorder,
  disabled = false,
}: CharacterSelectorProps) {
  const [characters, setCharacters] = useState<Character[]>(propCharacters || [])
  const [loading, setLoading] = useState(!propCharacters)
  const [error, setError] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  // Load characters if not provided via props
  useEffect(() => {
    if (propCharacters) {
      setCharacters(propCharacters)
      setLoading(false)
      return
    }

    const loadCharacters = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await adminApi.getCharacters()
        setCharacters(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载角色失败')
      } finally {
        setLoading(false)
      }
    }

    loadCharacters()
  }, [propCharacters])

  // Handle checkbox toggle for character selection (Requirements 7.2)
  const handleToggleCharacter = useCallback((characterId: string) => {
    if (disabled) return

    const isSelected = selectedCharacterIds.includes(characterId)
    
    if (isSelected) {
      // Don't allow deselecting if it would go below minimum
      if (selectedCharacterIds.length <= MIN_CHARACTERS) {
        return
      }
      
      // Remove from selection
      const newSelection = selectedCharacterIds.filter(id => id !== characterId)
      onSelectionChange(newSelection)
      
      // If deselected character was the default, set new default
      if (characterId === defaultCharacterId && newSelection.length > 0) {
        onDefaultChange(newSelection[0])
      }
    } else {
      // Don't allow selecting if at maximum
      if (selectedCharacterIds.length >= MAX_CHARACTERS) {
        return
      }
      
      // Add to selection
      const newSelection = [...selectedCharacterIds, characterId]
      onSelectionChange(newSelection)
      
      // If this is the first selection, make it default
      if (newSelection.length === 1) {
        onDefaultChange(characterId)
      }
    }
  }, [disabled, selectedCharacterIds, defaultCharacterId, onSelectionChange, onDefaultChange])

  // Handle default character selection (Requirements 7.3)
  const handleSetDefault = useCallback((characterId: string) => {
    if (disabled) return
    
    // Can only set default if character is selected
    if (!selectedCharacterIds.includes(characterId)) {
      return
    }
    
    onDefaultChange(characterId)
  }, [disabled, selectedCharacterIds, onDefaultChange])

  // Drag and drop handlers for reordering (Requirements 7.4)
  const handleDragStart = useCallback((e: React.DragEvent, characterId: string) => {
    if (disabled || !selectedCharacterIds.includes(characterId)) return
    
    setDraggedId(characterId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', characterId)
    
    // Store reference to dragged element for styling
    dragNodeRef.current = e.currentTarget as HTMLDivElement
    
    // Add dragging class after a small delay to prevent flash
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.classList.add('dragging')
      }
    }, 0)
  }, [disabled, selectedCharacterIds])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
    
    if (dragNodeRef.current) {
      dragNodeRef.current.classList.remove('dragging')
      dragNodeRef.current = null
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, characterId: string) => {
    e.preventDefault()
    
    if (!draggedId || draggedId === characterId) return
    if (!selectedCharacterIds.includes(characterId)) return
    
    setDragOverId(characterId)
    e.dataTransfer.dropEffect = 'move'
  }, [draggedId, selectedCharacterIds])

  const handleDragLeave = useCallback(() => {
    setDragOverId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }
    
    // Reorder the selected characters
    const currentOrder = [...selectedCharacterIds]
    const draggedIndex = currentOrder.indexOf(draggedId)
    const targetIndex = currentOrder.indexOf(targetId)
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }
    
    // Remove dragged item and insert at target position
    currentOrder.splice(draggedIndex, 1)
    currentOrder.splice(targetIndex, 0, draggedId)
    
    onReorder(currentOrder)
    setDraggedId(null)
    setDragOverId(null)
  }, [draggedId, selectedCharacterIds, onReorder])

  // Get thumbnail URL for a character
  const getThumbnailUrl = useCallback((character: Character) => {
    // Use the preview endpoint with timestamp to prevent caching
    return `/api/admin/characters/${character.id}/preview?t=${Date.now()}`
  }, [])

  // Sort characters: selected first (in order), then unselected
  const sortedCharacters = [...characters].sort((a, b) => {
    const aSelected = selectedCharacterIds.includes(a.id)
    const bSelected = selectedCharacterIds.includes(b.id)
    
    if (aSelected && bSelected) {
      // Both selected: sort by display order
      return selectedCharacterIds.indexOf(a.id) - selectedCharacterIds.indexOf(b.id)
    }
    if (aSelected) return -1
    if (bSelected) return 1
    
    // Both unselected: sort by name
    return a.name.localeCompare(b.name)
  })

  if (loading) {
    return (
      <div className="character-selector character-selector--loading">
        <div className="character-selector__spinner"></div>
        <p>加载角色列表...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="character-selector character-selector--error">
        <p>⚠️ {error}</p>
      </div>
    )
  }

  if (characters.length === 0) {
    return (
      <div className="character-selector character-selector--empty">
        <p>暂无可用角色</p>
        <p className="character-selector__hint">请先在角色管理中创建角色</p>
      </div>
    )
  }

  return (
    <div className={`character-selector ${disabled ? 'character-selector--disabled' : ''}`}>
      <div className="character-selector__header">
        <h4>可选角色配置</h4>
        <span className="character-selector__count">
          已选择 {selectedCharacterIds.length}/{MAX_CHARACTERS} 个角色
        </span>
      </div>
      
      <p className="character-selector__hint">
        勾选角色以添加到故事线，点击星标设为默认角色，拖拽已选角色调整顺序
      </p>

      <div className="character-selector__list">
        {sortedCharacters.map((character) => {
          const isSelected = selectedCharacterIds.includes(character.id)
          const isDefault = character.id === defaultCharacterId
          const isDragging = character.id === draggedId
          const isDragOver = character.id === dragOverId
          const canSelect = isSelected || selectedCharacterIds.length < MAX_CHARACTERS
          const canDeselect = !isSelected || selectedCharacterIds.length > MIN_CHARACTERS
          
          return (
            <div
              key={character.id}
              className={`character-selector__item ${isSelected ? 'character-selector__item--selected' : ''} ${isDefault ? 'character-selector__item--default' : ''} ${isDragging ? 'character-selector__item--dragging' : ''} ${isDragOver ? 'character-selector__item--drag-over' : ''}`}
              draggable={isSelected && !disabled}
              onDragStart={(e) => handleDragStart(e, character.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, character.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, character.id)}
            >
              {/* Drag handle - only for selected characters */}
              {isSelected && (
                <div className="character-selector__drag-handle" title="拖拽调整顺序">
                  ⋮⋮
                </div>
              )}
              
              {/* Checkbox for selection */}
              <label className="character-selector__checkbox">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleCharacter(character.id)}
                  disabled={disabled || (!canSelect && !isSelected) || (!canDeselect && isSelected)}
                />
                <span className="character-selector__checkmark"></span>
              </label>
              
              {/* Thumbnail */}
              <div className="character-selector__thumbnail">
                <img 
                  src={getThumbnailUrl(character)} 
                  alt={character.name}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement
                    img.style.display = 'none'
                    const placeholder = img.nextElementSibling as HTMLElement
                    if (placeholder) placeholder.style.display = 'flex'
                  }}
                />
                <div className="character-selector__thumbnail-placeholder" style={{ display: 'none' }}>
                  🎭
                </div>
              </div>
              
              {/* Character info */}
              <div className="character-selector__info">
                <span className="character-selector__name">{character.name}</span>
                {character.description && (
                  <span className="character-selector__description">
                    {character.description}
                  </span>
                )}
              </div>
              
              {/* Default indicator / radio button (Requirements 7.3) */}
              {isSelected && (
                <label 
                  className={`character-selector__default-radio ${isDefault ? 'character-selector__default-radio--active' : ''}`}
                  title={isDefault ? '默认角色' : '设为默认角色'}
                >
                  <input
                    type="radio"
                    name="default-character"
                    checked={isDefault}
                    onChange={() => handleSetDefault(character.id)}
                    disabled={disabled}
                  />
                  <span className="character-selector__default-indicator">
                    {isDefault ? '★' : '☆'}
                  </span>
                  <span className="character-selector__default-label">
                    {isDefault ? '默认' : '设为默认'}
                  </span>
                </label>
              )}
              
              {/* Order indicator for selected characters */}
              {isSelected && (
                <span className="character-selector__order">
                  #{selectedCharacterIds.indexOf(character.id) + 1}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {selectedCharacterIds.length === 0 && (
        <div className="character-selector__warning">
          ⚠️ 请至少选择 {MIN_CHARACTERS} 个角色
        </div>
      )}
      
      {selectedCharacterIds.length >= MAX_CHARACTERS && (
        <div className="character-selector__info-message">
          已达到最大选择数量 ({MAX_CHARACTERS} 个)
        </div>
      )}
    </div>
  )
}
