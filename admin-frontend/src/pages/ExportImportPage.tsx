import { useState, useRef } from 'react'
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

export default function ExportImportPage() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportSuccess, setExportSuccess] = useState('')
  
  // Import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [overwriteExisting, setOverwriteExisting] = useState(false)

  const handleExport = async () => {
    try {
      setExporting(true)
      setExportError('')
      setExportSuccess('')
      
      // Request export
      const result = await adminApi.exportConfiguration()
      
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
        <div className="header-left">
          <Link to="/dashboard" className="back-link">← {t('common.back')}</Link>
          <h1>{t('exportImport.title')}</h1>
        </div>
        <div className="user-info">
          <span>{user?.username}</span>
          <button onClick={logout}>{t('dashboard.logout')}</button>
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
            onClick={handleExport}
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
    </div>
  )
}
