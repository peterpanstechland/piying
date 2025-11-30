import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = '/api/admin'
const TOKEN_KEY = 'admin_token'
const TOKEN_EXPIRY_KEY = 'admin_token_expiry'

// Session expiration time: 24 hours in milliseconds
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

interface ApiError {
  message: string
  detail?: string
  status?: number
}

class AdminApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    })

    this.setupRequestInterceptor()
    this.setupResponseInterceptor()
  }

  private setupRequestInterceptor() {
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getToken()
        
        // Check if token is expired
        if (token && this.isTokenExpired()) {
          this.clearAuth()
          window.location.href = '/login'
          return Promise.reject(new Error('Session expired'))
        }
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )
  }

  private setupResponseInterceptor() {
    this.client.interceptors.response.use(
      (response) => {
        // Extend session on successful requests
        if (this.getToken()) {
          this.extendSession()
        }
        return response
      },
      async (error: AxiosError<ApiError>) => {
        // Handle 401 Unauthorized
        if (error.response?.status === 401) {
          this.clearAuth()
          
          // Only redirect if not already on login page
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
          
          return Promise.reject(this.formatError(error))
        }

        // Handle 403 Forbidden
        if (error.response?.status === 403) {
          return Promise.reject({
            message: 'Access denied',
            detail: error.response.data?.detail || 'You do not have permission to perform this action',
            status: 403,
          })
        }

        // Handle network errors
        if (!error.response) {
          return Promise.reject({
            message: 'Network error',
            detail: 'Unable to connect to the server. Please check your connection.',
            status: 0,
          })
        }

        return Promise.reject(this.formatError(error))
      }
    )
  }

  private formatError(error: AxiosError<ApiError>): ApiError {
    return {
      message: error.response?.data?.message || error.message || 'An error occurred',
      detail: error.response?.data?.detail,
      status: error.response?.status,
    }
  }

  // Token management
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  }

  private setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
    this.extendSession()
  }

  private extendSession() {
    const expiry = Date.now() + SESSION_DURATION_MS
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiry.toString())
  }

  private isTokenExpired(): boolean {
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
    if (!expiry) return true
    return Date.now() > parseInt(expiry, 10)
  }

  clearAuth() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRY_KEY)
  }

  // Authentication
  async login(username: string, password: string) {
    const response = await this.client.post('/auth/login', { username, password })
    if (response.data.token) {
      this.setToken(response.data.token)
    }
    return response.data
  }

  async logout() {
    try {
      await this.client.post('/auth/logout')
    } finally {
      this.clearAuth()
    }
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me')
    return response.data
  }

  // User Management
  async getUsers() {
    const response = await this.client.get('/users')
    return response.data
  }

  async createUser(userData: { username: string; password: string; role: string }) {
    const response = await this.client.post('/users', userData)
    return response.data
  }

  async deleteUser(userId: string) {
    const response = await this.client.delete(`/users/${userId}`)
    return response.data
  }

  async changePassword(oldPassword: string, newPassword: string) {
    const response = await this.client.put('/users/me/password', {
      old_password: oldPassword,
      new_password: newPassword
    })
    return response.data
  }

  async resetUserPassword(userId: string, newPassword: string) {
    const response = await this.client.put(`/users/${userId}/password`, {
      new_password: newPassword
    })
    return response.data
  }

  // Dashboard
  async getDashboardStats() {
    const response = await this.client.get('/dashboard/stats')
    return response.data
  }

  async getDashboardLogs(page = 1, limit = 20) {
    const response = await this.client.get('/dashboard/logs', { params: { page, limit } })
    return response.data
  }

  async getStorageUsage() {
    const response = await this.client.get('/dashboard/storage')
    return response.data
  }

  // Characters
  async getCharacters() {
    const response = await this.client.get('/characters')
    return response.data
  }

  async getCharacter(id: string) {
    const response = await this.client.get(`/characters/${id}`)
    return response.data
  }

  async createCharacter(data: { name: string; description?: string }) {
    const response = await this.client.post('/characters', data)
    return response.data
  }

  async updateCharacter(id: string, data: { name?: string; description?: string }) {
    const response = await this.client.put(`/characters/${id}`, data)
    return response.data
  }

  async deleteCharacter(id: string) {
    const response = await this.client.delete(`/characters/${id}`)
    return response.data
  }

  async uploadCharacterParts(id: string, formData: FormData) {
    const response = await this.client.post(`/characters/${id}/parts`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async updateCharacterPivot(id: string, pivotConfig: Record<string, unknown>) {
    const response = await this.client.put(`/characters/${id}/pivot`, pivotConfig)
    return response.data
  }

  async updateCharacterBinding(id: string, bindingConfig: Record<string, unknown>) {
    const response = await this.client.put(`/characters/${id}/binding`, bindingConfig)
    return response.data
  }

  async getCharacterPreview(id: string) {
    const response = await this.client.get(`/characters/${id}/preview`)
    return response.data
  }

  getCharacterPartImageUrl(characterId: string, partName: string): string {
    return `${API_BASE_URL}/characters/${characterId}/parts/${partName}`
  }

  // Storylines
  async getStorylines() {
    const response = await this.client.get('/storylines')
    return response.data
  }

  async getStoryline(id: string) {
    const response = await this.client.get(`/storylines/${id}`)
    return response.data
  }

  async createStoryline(data: {
    name: string;
    name_en?: string;
    description?: string;
    description_en?: string;
    icon?: string;
    character_id?: string | null;
  }) {
    const response = await this.client.post('/storylines', data)
    return response.data
  }

  async updateStoryline(id: string, data: {
    name?: string;
    name_en?: string;
    description?: string;
    description_en?: string;
    icon?: string;
    character_id?: string | null;
  }) {
    const response = await this.client.put(`/storylines/${id}`, data)
    return response.data
  }

  async deleteStoryline(id: string) {
    const response = await this.client.delete(`/storylines/${id}`)
    return response.data
  }

  async uploadStorylineVideo(id: string, formData: FormData) {
    const response = await this.client.post(`/storylines/${id}/video`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async updateStorylineSegments(id: string, segments: {
    index: number;
    duration: number;
    path_type: string;
    offset_start: number[];
    offset_end: number[];
    guidance_text: string;
    guidance_text_en: string;
    guidance_image: string | null;
  }[]) {
    const response = await this.client.put(`/storylines/${id}/segments`, { segments })
    return response.data
  }

  // Settings
  async getSettings() {
    const response = await this.client.get('/settings')
    return response.data
  }

  async updateSettings(settings: Record<string, unknown>) {
    const response = await this.client.put('/settings', settings)
    return response.data
  }

  async getStorageSettings() {
    const response = await this.client.get('/settings/storage')
    return response.data
  }

  async updateStorageSettings(settings: Record<string, unknown>) {
    const response = await this.client.put('/settings/storage', settings)
    return response.data
  }

  async testS3Connection(credentials?: {
    bucket: string;
    region: string;
    access_key: string;
    secret_key: string;
  }) {
    const response = await this.client.post('/settings/storage/test', credentials || {})
    return response.data
  }

  async getCameras() {
    const response = await this.client.get('/settings/cameras')
    return response.data
  }

  async setDefaultCamera(cameraId: string) {
    const response = await this.client.put('/settings/default-camera', null, {
      params: { camera_id: cameraId }
    })
    return response.data
  }

  async getLanIp() {
    const response = await this.client.get('/settings/lan-ip')
    return response.data
  }

  // Export/Import
  async exportConfiguration(): Promise<{
    success: boolean
    filename: string
    download_url: string
    message: string
  }> {
    const response = await this.client.post('/export')
    return response.data
  }

  async downloadExport(filename: string): Promise<Blob> {
    const response = await this.client.get(`/export/download/${filename}`, {
      responseType: 'blob'
    })
    return response.data
  }

  async previewImport(formData: FormData): Promise<{
    valid: boolean
    error?: string
    characters: Array<{ id: string; name: string }>
    storylines: Array<{ id: string; name: string }>
    settings: boolean
  }> {
    const response = await this.client.post('/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async importConfiguration(formData: FormData, overwrite: boolean = false): Promise<{
    success: boolean
    message: string
    characters_imported: number
    characters_skipped: number
    storylines_imported: number
    storylines_skipped: number
    settings_imported: boolean
  }> {
    const response = await this.client.post(`/import?overwrite=${overwrite}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }
}

export const adminApi = new AdminApiClient()

// Export types for use in components
export type { ApiError }
