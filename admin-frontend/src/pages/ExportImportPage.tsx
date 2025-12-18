import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../services/api'
import './ExportImportPage.css'

interface ImportPreview {
  valid: boolean
  error?: string
  characters: Array<{ id: string; name: string }>
  storylines: Array<{ id: string; name: string }>
  settings: boolean
}

interface ImportResult {
  success: boolean
  message: string
  characters_imported: number
  characters_skipped: number
  storylines_imported: number
  storylines_skipped: number
  settings_imported: boolean
}

interface ExportCharacter {
  id: string
  name: string
  thumbnail_path: string | null
}

interface ExportStoryline {
  id: string
  name: string
  name_en: string
  icon: string
  required_character_ids: string[]
}

interface ExportableContent {
  characters: ExportCharacter[]
  storylines: ExportStoryline[]
  settings_available: boolean
}

export default function ExportImportPage() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportSuccess, setExportSuccess] = useState('')
  
  // Export options dialog state
  const [showExportOptionsDialog, setShowExportOptionsDialog] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [exportableContent, setExportableContent] = useState<ExportableContent | null>(null)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set())
  const [selectedStorylineIds, setSelectedStorylineIds] = useState<Set<string>>(new Set())
  const [includeSettings, setIncludeSettings] = useState(true)
  const [requiredCharacterIds, setRequiredCharacterIds] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<{ characters: boolean; storylines: boolean }>({
    characters: true,
    storylines: true
  })
  
  // Import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [overwriteExisting, setOverwriteExisting] = useState(false)

  // Calculate required characters when storyline selection changes
  const updateRequiredCharacters = useCallback(() => {
    if (!exportableContent) return
    
    const required = new Set<string>()
    exportableContent.storylines.forEach(storyline => {
      if (selectedStorylineIds.has(storyline.id)) {
        storyline.required_character_ids.forEach(charId => required.add(charId))
      }
    })
    setRequiredCharacterIds(required)
    
    // Auto-select required characters
    setSelectedCharacterIds(prev => {
      const newSet = new Set(prev)
      required.forEach(id => newSet.add(id))
      return newSet
    })
  }, [exportableContent, selectedStorylineIds])

  useEffect(() => {
    updateRequiredCharacters()
  }, [updateRequiredCharacters])

  // Load exportable content when dialog opens
  const loadExportableContent = async () => {
    try {
      setLoadingContent(true)
      const content = await adminApi.getExportableContent()
      setExportableContent(content)
      
      // Select all by default
      setSelectedCharacterIds(new Set(content.characters.map(c => c.id)))
      setSelectedStorylineIds(new Set(content.storylines.map(s => s.id)))
      setIncludeSettings(content.settings_available)
    } catch (err: any) {
      setExportError(err.detail || err.message || t('exportImport.loadContentError'))
    } finally {
      setLoadingContent(false)
    }
  }

  const handleOpenExportOptions = async () => {
    setExportError('')
    setExportSuccess('')
    setShowExportOptionsDialog(true)
    await loadExportableContent()
  }

  const handleCloseExportOptions = () => {
    setShowExportOptionsDialog(false)
    setExportableContent(null)
  }

  const handleSelectAllCharacters = (checked: boolean) => {
    if (!exportableContent) return
    if (checked) {
      setSelectedCharacterIds(new Set(exportableContent.characters.map(c => c.id)))
    } else {
      // Only deselect non-required characters
      setSelectedCharacterIds(new Set(requiredCharacterIds))
    }
  }

  const handleSelectAllStorylines = (checked: boolean) => {
    if (!exportableContent) return
    if (checked) {
      setSelectedStorylineIds(new Set(exportableContent.storylines.map(s => s.id)))
    } else {
      setSelectedStorylineIds(new Set())
    }
  }

  const handleToggleCharacter = (characterId: string) => {
    // Don't allow deselecting required characters
    if (requiredCharacterIds.has(characterId)) return
    
    setSelectedCharacterIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(characterId)) {
        newSet.delete(characterId)
      } else {
        newSet.add(characterId)
      }
      return newSet
    })
  }

  const handleToggleStoryline = (storylineId: string) => {
    setSelectedStorylineIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(storylineId)) {
        newSet.delete(storylineId)
      } else {
        newSet.add(storylineId)
      }
      return newSet
    })
  }

  const toggleSection = (section: 'characters' | 'storylines') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const isExportDisabled = () => {
    return selectedCharacterIds.size === 0 && selectedStorylineIds.size === 0 && !includeSettings
  }

  const handleConfirmExport = async () => {
    try {
      setExporting(true)
      setExportError('')
      setExportSuccess('')
      setShowExportOptionsDialog(false)
      
      // Build export options
      const options = {
        character_ids: Array.from(selectedCharacterIds),
        storyline_ids: Array.from(selectedStorylineIds),
        include_settings: includeSettings
      }
      
      // Request export
      const result = await adminApi.exportConfiguration(options)
      
      if (result.success) {
        // Download the file
        const blob = await adminApi.downloadExport(result.filename)
        
        // Create download link
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        
        setExportSuccess(t('exportImport.exportSuccess'))
      }
    } catch (err: any) {
      setExportError(err.detail || err.message || t('exportImport.exportError'))
    } finally {
      setExporting(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setImportPreview(null)
      setImportResult(null)
      setImportError('')
    }
  }

  const handlePreviewImport = async () => {
    if (!selectedFile) return
    
    try {
      setPreviewing(true)
      setImportError('')
      
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      const preview = await adminApi.previewImport(formData)
      setImportPreview(preview)
      
      if (!preview.valid) {
        setImportError(preview.error || t('exportImport.invalidFile'))
      }
    } catch (err: any) {
      setImportError(err.detail || err.message || t('exportImport.previewError'))
    } finally {
      setPreviewing(false)
    }
  }

  const handleImportClick = () => {
    if (!importPreview?.valid) return
    setShowConfirmDialog(true)
  }

  const handleConfirmImport = async () => {
    if (!selectedFile) return
    
    try {
      setImporting(true)
      setImportError('')
      setShowConfirmDialog(false)
      
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      const result = await adminApi.importConfiguration(formData, overwriteExisting)
      setImportResult(result)
      
      // Clear file selection after successful import
      if (result.success) {
        setSelectedFile(null)
        setImportPreview(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    } catch (err: any) {
      setImportError(err.detail || err.message || t('exportImport.importError'))
    } finally {
      setImporting(false)
    }
  }

  const handleCancelImport = () => {
    setShowConfirmDialog(false)
    setOverwriteExisting(false)
  }

  const clearFileSelection = () => {
    setSelectedFile(null)
    setImportPreview(null)
    setImportResult(null)
    setImportError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="export-import-container">
      <header className="page-header">
        <Link to="/dashboard" className="btn-back">← 返回首页</Link>
        <h1>{t('exportImport.title')}</h1>
        <div className="header-actions">
          <span className="user-name">{user?.username}</span>
          <button className="btn-secondary" onClick={logout}>{t('dashboard.logout')}</button>
        </div>
      </header>

      <main className="page-content">
        {/* Export Section */}
        <div className="settings-card">
          <h2>{t('exportImport.exportTitle')}</h2>
          <p className="section-description">{t('exportImport.exportDescription')}</p>
          
          {exportError && <div className="error-message">{exportError}</div>}
          {exportSuccess && <div className="success-message">{exportSuccess}</div>}
          
          <div className="export-info">
            <div className="info-item">
              <span className="info-icon">📁</span>
              <span>{t('exportImport.exportIncludes.characters')}</span>
            </div>
            <div className="info-item">
              <span className="info-icon">🎬</span>
              <span>{t('exportImport.exportIncludes.storylines')}</span>
            </div>
            <div className="info-item">
              <span className="info-icon">⚙️</span>
              <span>{t('exportImport.exportIncludes.settings')}</span>
            </div>
          </div>
          
          <button
            className="export-btn"
            onClick={handleOpenExportOptions}
            disabled={exporting}
          >
            {exporting ? t('exportImport.exporting') : t('exportImport.exportButton')}
          </button>
        </div>

        {/* Import Section */}
        <div className="settings-card">
          <h2>{t('exportImport.importTitle')}</h2>
          <p className="section-description">{t('exportImport.importDescription')}</p>
          
          {importError && <div className="error-message">{importError}</div>}
          {importResult && (
            <div className={`result-message ${importResult.success ? 'success' : 'error'}`}>
              <p>{importResult.message}</p>
            </div>
          )}
          
          <div className="file-upload-area">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="file-input"
              id="import-file"
            />
            <label htmlFor="import-file" className="file-label">
              {selectedFile ? (
                <div className="selected-file">
                  <span className="file-icon">📦</span>
                  <span className="file-name">{selectedFile.name}</span>
                  <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <div className="upload-prompt">
                  <span className="upload-icon">📤</span>
                  <span>{t('exportImport.selectFile')}</span>
                  <span className="file-hint">{t('exportImport.fileHint')}</span>
                </div>
              )}
            </label>
            
            {selectedFile && (
              <button className="clear-file-btn" onClick={clearFileSelection}>
                ✕
              </button>
            )}
          </div>
          
          {selectedFile && !importPreview && (
            <button
              className="preview-btn"
              onClick={handlePreviewImport}
              disabled={previewing}
            >
              {previewing ? t('exportImport.previewing') : t('exportImport.previewButton')}
            </button>
          )}
          
          {importPreview?.valid && (
            <div className="import-preview">
              <h3>{t('exportImport.previewTitle')}</h3>
              
              {importPreview.characters.length > 0 && (
                <div className="preview-section">
                  <h4>
                    <span className="preview-icon">👤</span>
                    {t('exportImport.characters')} ({importPreview.characters.length})
                  </h4>
                  <ul className="preview-list">
                    {importPreview.characters.map(char => (
                      <li key={char.id}>{char.name}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {importPreview.storylines.length > 0 && (
                <div className="preview-section">
                  <h4>
                    <span className="preview-icon">🎬</span>
                    {t('exportImport.storylines')} ({importPreview.storylines.length})
                  </h4>
                  <ul className="preview-list">
                    {importPreview.storylines.map(story => (
                      <li key={story.id}>{story.name}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {importPreview.settings && (
                <div className="preview-section">
                  <h4>
                    <span className="preview-icon">⚙️</span>
                    {t('exportImport.settingsIncluded')}
                  </h4>
                </div>
              )}
              
              <button
                className="import-btn"
                onClick={handleImportClick}
                disabled={importing}
              >
                {importing ? t('exportImport.importing') : t('exportImport.importButton')}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="dialog-overlay">
          <div className="confirm-dialog">
            <h3>{t('exportImport.confirmTitle')}</h3>
            <p>{t('exportImport.confirmMessage')}</p>
            
            <div className="overwrite-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={overwriteExisting}
                  onChange={(e) => setOverwriteExisting(e.target.checked)}
                />
                <span>{t('exportImport.overwriteExisting')}</span>
              </label>
              <span className="option-hint">{t('exportImport.overwriteHint')}</span>
            </div>
            
            <div className="dialog-actions">
              <button className="cancel-btn" onClick={handleCancelImport}>
                {t('exportImport.cancel')}
              </button>
              <button className="confirm-btn" onClick={handleConfirmImport}>
                {t('exportImport.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Options Dialog */}
      {showExportOptionsDialog && (
        <div className="dialog-overlay">
          <div className="export-options-dialog">
            <h3>{t('exportImport.selectExportContent')}</h3>
            
            {loadingContent ? (
              <div className="loading-content">
                <span className="loading-spinner">⏳</span>
                <span>{t('exportImport.loadingContent')}</span>
              </div>
            ) : exportableContent ? (
              <div className="export-options-content">
                {/* Characters Section */}
                <div className="export-section">
                  <div 
                    className="section-header" 
                    onClick={() => toggleSection('characters')}
                  >
                    <span className={`expand-icon ${expandedSections.characters ? 'expanded' : ''}`}>▶</span>
                    <span className="section-icon">👤</span>
                    <span className="section-title">
                      {t('exportImport.characters')} ({exportableContent.characters.length})
                    </span>
                    <label className="checkbox-label section-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedCharacterIds.size === exportableContent.characters.length}
                        onChange={(e) => handleSelectAllCharacters(e.target.checked)}
                      />
                    </label>
                  </div>
                  
                  {expandedSections.characters && (
                    <div className="section-items">
                      {exportableContent.characters.map(character => {
                        const isRequired = requiredCharacterIds.has(character.id)
                        const isSelected = selectedCharacterIds.has(character.id)
                        
                        return (
                          <label 
                            key={character.id} 
                            className={`item-checkbox ${isRequired ? 'required' : ''}`}
                            title={isRequired ? t('exportImport.requiredByStoryline') : ''}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleCharacter(character.id)}
                              disabled={isRequired}
                            />
                            <span className="item-name">{character.name}</span>
                            {isRequired && (
                              <span className="required-badge" title={t('exportImport.requiredByStoryline')}>
                                🔒
                              </span>
                            )}
                          </label>
                        )
                      })}
                      {exportableContent.characters.length === 0 && (
                        <div className="no-items">{t('exportImport.noCharacters')}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Storylines Section */}
                <div className="export-section">
                  <div 
                    className="section-header" 
                    onClick={() => toggleSection('storylines')}
                  >
                    <span className={`expand-icon ${expandedSections.storylines ? 'expanded' : ''}`}>▶</span>
                    <span className="section-icon">🎬</span>
                    <span className="section-title">
                      {t('exportImport.storylines')} ({exportableContent.storylines.length})
                    </span>
                    <label className="checkbox-label section-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedStorylineIds.size === exportableContent.storylines.length}
                        onChange={(e) => handleSelectAllStorylines(e.target.checked)}
                      />
                    </label>
                  </div>
                  
                  {expandedSections.storylines && (
                    <div className="section-items">
                      {exportableContent.storylines.map(storyline => {
                        const isSelected = selectedStorylineIds.has(storyline.id)
                        const dependsOn = storyline.required_character_ids.length > 0
                          ? exportableContent.characters
                              .filter(c => storyline.required_character_ids.includes(c.id))
                              .map(c => c.name)
                              .join(', ')
                          : null
                        
                        return (
                          <label key={storyline.id} className="item-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleStoryline(storyline.id)}
                            />
                            <span className="item-icon">{storyline.icon}</span>
                            <span className="item-name">{storyline.name}</span>
                            {dependsOn && (
                              <span className="dependency-info" title={`${t('exportImport.dependsOn')}: ${dependsOn}`}>
                                ({t('exportImport.dependsOn')}: {dependsOn})
                              </span>
                            )}
                          </label>
                        )
                      })}
                      {exportableContent.storylines.length === 0 && (
                        <div className="no-items">{t('exportImport.noStorylines')}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Settings Section */}
                {exportableContent.settings_available && (
                  <div className="export-section settings-section">
                    <label className="item-checkbox settings-checkbox">
                      <input
                        type="checkbox"
                        checked={includeSettings}
                        onChange={(e) => setIncludeSettings(e.target.checked)}
                      />
                      <span className="section-icon">⚙️</span>
                      <span className="item-name">{t('exportImport.systemSettings')}</span>
                    </label>
                  </div>
                )}

                {/* Summary */}
                <div className="export-summary">
                  <span>
                    {t('exportImport.selectedSummary', {
                      characters: selectedCharacterIds.size,
                      storylines: selectedStorylineIds.size,
                      settings: includeSettings ? 1 : 0
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="error-content">
                <span>{t('exportImport.loadContentError')}</span>
              </div>
            )}
            
            <div className="dialog-actions">
              <button className="cancel-btn" onClick={handleCloseExportOptions}>
                {t('exportImport.cancel')}
              </button>
              <button 
                className="confirm-btn" 
                onClick={handleConfirmExport}
                disabled={isExportDisabled() || loadingContent || exporting}
              >
                {exporting ? t('exportImport.exporting') : t('exportImport.confirmExport')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
