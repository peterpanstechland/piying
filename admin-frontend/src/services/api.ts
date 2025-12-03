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

  async updateCharacter(id: string, data: { name?: string; description?: string; default_facing?: 'left' | 'right' }) {
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

  async deleteCharacterPart(characterId: string, partName: string) {
    const response = await this.client.delete(`/characters/${characterId}/parts/${partName}`)
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

  // Sprite Sheet Export
  async generateSpritesheet(characterId: string): Promise<{
    message: string
    spritesheet_png: string
    spritesheet_json: string
  }> {
    const response = await this.client.post(`/characters/${characterId}/export/spritesheet`)
    return response.data
  }

  getSpritesheetPngUrl(characterId: string): string {
    return `${API_BASE_URL}/characters/${characterId}/spritesheet.png`
  }

  getSpritesheetJsonUrl(characterId: string): string {
    return `${API_BASE_URL}/characters/${characterId}/spritesheet.json`
  }

  getCharacterConfigUrl(characterId: string): string {
    return `${API_BASE_URL}/characters/${characterId}/config.json`
  }

  async getCharacterConfig(characterId: string) {
    const response = await this.client.get(`/characters/${characterId}/config.json`)
    return response.data
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

  // Storyline Character Configuration (Requirements 7.1, 7.2, 7.3, 7.4)
  async getStorylineCharacters(storylineId: string): Promise<{
    character_ids: string[];
    default_character_id: string | null;
    display_order: string[];
  }> {
    const response = await this.client.get(`/storylines/${storylineId}/characters`)
    return response.data
  }

  async updateStorylineCharacters(
    storylineId: string,
    config: {
      character_ids: string[];
      default_character_id: string;
      display_order: string[];
    }
  ): Promise<{ message: string }> {
    const response = await this.client.put(`/storylines/${storylineId}/characters`, config)
    return response.data
  }

  // Cover Image Management (Requirements 9.1, 9.2, 9.3, 9.4, 9.5)
  async uploadCoverImage(storylineId: string, formData: FormData): Promise<{
    message: string;
    cover_image: {
      original_path: string;
      thumbnail_path: string;
      medium_path: string;
      large_path: string;
    };
  }> {
    const response = await this.client.post(`/storylines/${storylineId}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async captureCoverFromVideo(storylineId: string, timestamp: number): Promise<{
    message: string;
    timestamp: number;
    cover_image: {
      original_path: string;
      thumbnail_path: string;
      medium_path: string;
      large_path: string;
    };
  }> {
    const response = await this.client.post(`/storylines/${storylineId}/cover/capture`, null, {
      params: { timestamp }
    })
    return response.data
  }

  async deleteCoverImage(storylineId: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/storylines/${storylineId}/cover`)
    return response.data
  }

  getCoverImageUrl(storylineId: string, size: 'thumbnail' | 'medium' | 'large' = 'large'): string {
    return `${API_BASE_URL}/storylines/${storylineId}/cover/${size}`
  }

  // Extended Storyline API (Requirements 1.1, 1.2, 10.1)
  async getStorylineExtended(id: string) {
    const response = await this.client.get(`/storylines/extended/${id}`)
    return response.data
  }

  async createStorylineExtended(data: {
    name: string;
    name_en?: string;
    synopsis?: string;
    synopsis_en?: string;
    description?: string;
    description_en?: string;
    icon?: string;
  }) {
    const response = await this.client.post('/storylines/extended', data)
    return response.data
  }

  async updateStorylineExtended(id: string, data: {
    name?: string;
    name_en?: string;
    synopsis?: string;
    synopsis_en?: string;
    description?: string;
    description_en?: string;
    icon?: string;
    display_order?: number;
  }) {
    const response = await this.client.put(`/storylines/extended/${id}`, data)
    return response.data
  }

  async getStorylinesExtendedList() {
    const response = await this.client.get('/storylines/extended/list')
    return response.data
  }

  // Batch reorder storylines (Requirements 10.3)
  async reorderStorylines(orders: Array<{ id: string; order: number }>): Promise<{ message: string }> {
    const response = await this.client.put('/storylines/batch/reorder', orders)
    return response.data
  }

  // Publish/Unpublish (Requirements 1.2, 10.1)
  async publishStoryline(id: string): Promise<{ message: string }> {
    const response = await this.client.put(`/storylines/${id}/publish`)
    return response.data
  }

  async unpublishStoryline(id: string): Promise<{ message: string }> {
    const response = await this.client.put(`/storylines/${id}/unpublish`)
    return response.data
  }

  // Enable/Disable storyline
  async toggleStorylineEnabled(id: string, enabled: boolean): Promise<{ message: string; enabled: boolean }> {
    const response = await this.client.put(`/storylines/${id}/enabled`, null, {
      params: { enabled }
    })
    return response.data
  }

  // Timeline Segments (Requirements 4.1, 4.2, 4.6)
  async updateTimelineSegments(storylineId: string, segments: Array<{
    index: number;
    start_time: number;
    duration: number;
    path_type?: string;
    // Path coordinates (normalized 0-1)
    offset_start?: [number, number];
    offset_end?: [number, number];
    // Waypoints for curved paths: [[x1,y1], [x2,y2], ...]
    path_waypoints?: Array<[number, number]>;
    path_draw_type?: 'linear' | 'bezier' | 'freehand';
    entry_animation?: {
      type: string;
      duration: number;
      delay: number;
    };
    exit_animation?: {
      type: string;
      duration: number;
      delay: number;
    };
    guidance_text?: string;
    guidance_text_en?: string;
    guidance_image?: string | null;
  }>): Promise<{ message: string }> {
    const response = await this.client.put(`/storylines/${storylineId}/timeline-segments`, segments)
    return response.data
  }

  async deleteSegment(storylineId: string, segmentIndex: number): Promise<{ message: string }> {
    const response = await this.client.delete(`/storylines/${storylineId}/segments/${segmentIndex}`)
    return response.data
  }

  // Transitions (Requirements 6.2, 6.3)
  async getTransitions(storylineId: string): Promise<{
    transitions: Array<{
      id: string;
      from_segment_index: number;
      to_segment_index: number;
      type: string;
      duration: number;
    }>;
  }> {
    const response = await this.client.get(`/storylines/${storylineId}/transitions`)
    return response.data
  }

  async updateTransitions(storylineId: string, transitions: Array<{
    id?: string;
    from_segment_index: number;
    to_segment_index: number;
    type: string;
    duration: number;
  }>): Promise<{ message: string }> {
    const response = await this.client.put(`/storylines/${storylineId}/transitions`, transitions)
    return response.data
  }

  // Video Frame Extraction (Requirements 9.2, 12.2)
  async extractVideoFrame(storylineId: string, timestamp: number): Promise<{
    frame_data: string;
    timestamp: number;
    format: string;
    message: string;
  }> {
    const response = await this.client.get(`/storylines/${storylineId}/video/frame`, {
      params: { timestamp }
    })
    return response.data
  }

  // Guidance Image (Requirements 12.1, 12.2)
  async uploadGuidanceImage(storylineId: string, segmentIndex: number, formData: FormData): Promise<{
    message: string;
    image_path: string;
  }> {
    const response = await this.client.post(
      `/storylines/${storylineId}/segments/${segmentIndex}/guidance-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return response.data
  }

  async captureGuidanceFromVideo(storylineId: string, segmentIndex: number, timestamp: number): Promise<{
    message: string;
    image_path: string;
    timestamp: number;
  }> {
    const response = await this.client.post(
      `/storylines/${storylineId}/segments/${segmentIndex}/capture-guidance`,
      null,
      { params: { timestamp } }
    )
    return response.data
  }

  getVideoUrl(storylineId: string): string {
    return `${API_BASE_URL}/storylines/${storylineId}/video`
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

  // Character Video Management (Requirements 1.1, 1.2, 1.3, 1.4, 4.1, 4.2, 4.3, 4.4, 4.5)
  async getCharacterVideos(storylineId: string): Promise<{
    storyline_id: string
    base_video_duration: number
    characters: Array<{
      character_id: string
      character_name: string
      character_thumbnail: string | null
      has_video: boolean
      video_path: string | null
      video_duration: number | null
      video_thumbnail: string | null
      uploaded_at: string | null
    }>
  }> {
    const response = await this.client.get(`/storylines/${storylineId}/character-videos`)
    return response.data
  }

  async uploadCharacterVideo(
    storylineId: string,
    characterId: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<{
    video_path: string
    video_duration: number
    video_thumbnail: string
    message: string
  }> {
    const response = await this.client.post(
      `/storylines/${storylineId}/characters/${characterId}/video`,
      formData,
      {
        // Let browser set Content-Type with boundary for multipart/form-data
        headers: { 'Content-Type': undefined as unknown as string },
        timeout: 300000, // 5 minutes for large video uploads
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        },
      }
    )
    return response.data
  }

  async getCharacterVideo(storylineId: string, characterId: string): Promise<{
    character_id: string
    character_name: string
    character_thumbnail: string | null
    has_video: boolean
    video_path: string | null
    video_duration: number | null
    video_thumbnail: string | null
    uploaded_at: string | null
  }> {
    const response = await this.client.get(
      `/storylines/${storylineId}/characters/${characterId}/video`
    )
    return response.data
  }

  async deleteCharacterVideo(storylineId: string, characterId: string): Promise<{ message: string }> {
    const response = await this.client.delete(
      `/storylines/${storylineId}/characters/${characterId}/video`
    )
    return response.data
  }

  getCharacterVideoUrl(storylineId: string, characterId: string): string {
    return `${API_BASE_URL}/storylines/${storylineId}/characters/${characterId}/video/stream`
  }

  getCharacterVideoThumbnailUrl(storylineId: string, characterId: string): string {
    return `${API_BASE_URL}/storylines/${storylineId}/characters/${characterId}/video/thumbnail`
  }

  // Character Video Segments API
  async getCharacterVideoSegments(storylineId: string, characterId: string): Promise<{
    segments: Array<{
      id: string
      index: number
      start_time: number
      duration: number
      path_type: string
      offset_start: number[]
      offset_end: number[]
      // Individual coordinate fields for compatibility
      offset_start_x?: number
      offset_start_y?: number
      offset_end_x?: number
      offset_end_y?: number
      // Path data
      path_waypoints?: number[][] | null
      path_draw_type?: string
      entry_animation: { type: string; duration: number; delay: number }
      exit_animation: { type: string; duration: number; delay: number }
      guidance_text: string
      guidance_text_en: string
      guidance_image: string | null
      play_audio?: boolean
    }>
  }> {
    const response = await this.client.get(
      `/storylines/${storylineId}/characters/${characterId}/video/segments`
    )
    return response.data
  }

  async updateCharacterVideoSegments(
    storylineId: string,
    characterId: string,
    segments: Array<{
      index: number
      start_time: number
      duration: number
      path_type?: string
      offset_start?: [number, number]
      offset_end?: [number, number]
      path_waypoints?: [number, number][]
      path_draw_type?: string
      entry_animation?: { type: string; duration: number; delay: number }
      exit_animation?: { type: string; duration: number; delay: number }
      guidance_text?: string
      guidance_text_en?: string
      guidance_image?: string | null
      play_audio?: boolean
    }>
  ): Promise<{ message: string }> {
    const response = await this.client.put(
      `/storylines/${storylineId}/characters/${characterId}/video/segments`,
      segments
    )
    return response.data
  }

  async deleteCharacterVideoSegment(
    storylineId: string,
    characterId: string,
    segmentIndex: number
  ): Promise<{ message: string }> {
    const response = await this.client.delete(
      `/storylines/${storylineId}/characters/${characterId}/video/segments/${segmentIndex}`
    )
    return response.data
  }
}

export const adminApi = new AdminApiClient()

// Export types for use in components
export type { ApiError }
