import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import './CharacterListPage.css'

interface CharacterListItem {
  id: string
  name: string
  description: string | null
  thumbnail_path: string | null
  part_count: number
  created_at: string
}

export default function CharacterListPage() {
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<CharacterListItem[]>([])
  const [filteredCharacters, setFilteredCharacters] = useState<CharacterListItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadCharacters = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await adminApi.getCharacters()
      setCharacters(data)
      setFilteredCharacters(data)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load characters'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCharacters(characters)
    } else {
      const query = searchQuery.toLowerCase()
      setFilteredCharacters(
        characters.filter(
          (char) =>
            char.name.toLowerCase().includes(query) ||
            (char.description && char.description.toLowerCase().includes(query))
        )
      )
    }
  }, [searchQuery, characters])


  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteCharacter(id)
      setDeleteConfirm(null)
      loadCharacters()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete character'
      setError(errorMessage)
      setDeleteConfirm(null)
    }
  }

  const handleCreate = () => {
    navigate('/characters/new')
  }

  const handleEdit = (id: string) => {
    navigate(`/characters/${id}/edit`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="character-list-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="character-list-page">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>
          ← 返回首页
        </button>
        <h1>人物管理</h1>
        <button className="btn-primary" onClick={handleCreate}>
          + 新建人物
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="search-bar">
        <input
          type="text"
          placeholder="搜索人物名称或描述..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>
            ×
          </button>
        )}
      </div>

      {filteredCharacters.length === 0 ? (
        <div className="empty-state">
          {searchQuery ? (
            <p>没有找到匹配的人物</p>
          ) : (
            <>
              <p>还没有创建任何人物</p>
              <button className="btn-primary" onClick={handleCreate}>
                创建第一个人物
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="character-grid">
          {filteredCharacters.map((character) => (
            <div key={character.id} className="character-card">
              <div className="character-thumbnail">
                {character.thumbnail_path ? (
                  <img
                    src={`/api/admin/characters/${character.id}/preview?t=${Date.now()}`}
                    alt={character.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="placeholder-thumbnail">
                    <span>🎭</span>
                  </div>
                )}
              </div>
              <div className="character-info">
                <h3>{character.name}</h3>
                {character.description && (
                  <p className="description">{character.description}</p>
                )}
                <div className="meta">
                  <span className="part-count">{character.part_count} 个部件</span>
                  <span className="date">{formatDate(character.created_at)}</span>
                </div>
              </div>
              <div className="character-actions">
                <button
                  className="btn-secondary"
                  onClick={() => handleEdit(character.id)}
                >
                  编辑
                </button>
                <button
                  className="btn-danger"
                  onClick={() => setDeleteConfirm(character.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>确认删除</h3>
            <p>确定要删除这个人物吗？此操作无法撤销。</p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                取消
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(deleteConfirm)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
