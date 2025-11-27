/**
 * API Client for backend communication
 * Handles session management, segment uploads, and video retrieval
 * Includes retry logic with exponential backoff and local caching for offline resilience
 */

import axios, { AxiosInstance } from 'axios';
import { getApiBaseUrl } from '../config/env';

// API base URL - uses environment configuration
const DEFAULT_API_BASE_URL = getApiBaseUrl();

/**
 * Session status enumeration matching backend
 */
export enum SessionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

/**
 * Pose frame data structure
 */
export interface PoseFrame {
  timestamp: number; // milliseconds relative to segment start
  landmarks: number[][]; // [x, y, z, visibility] for each landmark
}

/**
 * Segment data structure
 */
export interface SegmentData {
  index: number;
  duration: number; // seconds
  frames: PoseFrame[];
}

/**
 * Session creation response
 */
export interface CreateSessionResponse {
  session_id: string;
  scene_id: string;
  status: SessionStatus;
}

/**
 * Session status response
 */
export interface SessionStatusResponse {
  id: string;
  scene_id: string;
  status: SessionStatus;
  output_path?: string;
  segment_count: number;
}

/**
 * Cached upload data for offline resilience
 */
interface CachedUpload {
  sessionId: string;
  segmentIndex: number;
  data: SegmentData;
  timestamp: number;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * API Client class with retry logic and local caching
 */
export class APIClient {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;
  private uploadCache: Map<string, CachedUpload>;
  private processingCache: boolean;

  constructor(baseURL: string = DEFAULT_API_BASE_URL, retryConfig: Partial<RetryConfig> = {}) {
    this.client = axios.create({
      baseURL,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.uploadCache = new Map();
    this.processingCache = false;

    // Load cached uploads from localStorage on initialization
    this.loadCacheFromStorage();
  }

  /**
   * Create a new session
   * @param sceneId - Scene identifier
   * @returns Session creation response
   */
  async createSession(sceneId: string): Promise<CreateSessionResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.post<CreateSessionResponse>('/api/sessions', {
        scene_id: sceneId,
      });
      return response.data;
    });
  }

  /**
   * Upload segment data for a session
   * @param sessionId - Session identifier
   * @param segmentIndex - Segment index
   * @param data - Segment data with frames
   * @param onProgress - Optional callback for upload progress (0-100)
   */
  async uploadSegment(
    sessionId: string,
    segmentIndex: number,
    data: SegmentData,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      await this.retryRequest(async () => {
        const response = await this.client.post(
          `/api/sessions/${sessionId}/segments/${segmentIndex}`,
          data,
          {
            onUploadProgress: (progressEvent) => {
              if (onProgress && progressEvent.total) {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total
                );
                onProgress(percentCompleted);
              }
            },
          }
        );
        return response.data;
      });

      // Remove from cache if upload succeeds
      const cacheKey = `${sessionId}-${segmentIndex}`;
      this.uploadCache.delete(cacheKey);
      this.saveCacheToStorage();
    } catch (error) {
      // Cache the upload for later retry if it's a network error
      if (this.isNetworkError(error)) {
        this.cacheUpload(sessionId, segmentIndex, data);
        throw new Error('Network error: Upload cached for retry');
      }
      throw error;
    }
  }

  /**
   * Get session status
   * @param sessionId - Session identifier
   * @returns Session status information
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get<SessionStatusResponse>(
        `/api/sessions/${sessionId}`
      );
      return response.data;
    });
  }

  /**
   * Get video URL for a session
   * @param sessionId - Session identifier
   * @returns Video URL
   */
  getVideoUrl(sessionId: string): string {
    return `${this.client.defaults.baseURL}/api/videos/${sessionId}`;
  }

  /**
   * Delete/cancel a session
   * @param sessionId - Session identifier
   */
  async cancelSession(sessionId: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/api/sessions/${sessionId}`);
    });
  }

  /**
   * Trigger video rendering for a session
   * @param sessionId - Session identifier
   * @returns Render status response
   */
  async triggerRender(sessionId: string): Promise<{ success: boolean; status: string; message: string }> {
    return this.retryRequest(async () => {
      const response = await this.client.post<{ success: boolean; status: string; message: string }>(
        `/api/sessions/${sessionId}/render`
      );
      return response.data;
    });
  }

  /**
   * Process cached uploads (retry failed uploads)
   * @returns Number of successfully processed uploads
   */
  async processCachedUploads(): Promise<number> {
    if (this.processingCache || this.uploadCache.size === 0) {
      return 0;
    }

    this.processingCache = true;
    let successCount = 0;

    try {
      const uploads = Array.from(this.uploadCache.values());
      
      for (const upload of uploads) {
        try {
          await this.uploadSegment(upload.sessionId, upload.segmentIndex, upload.data);
          successCount++;
        } catch (error) {
          // Keep in cache if still failing
          console.warn(`Failed to process cached upload for session ${upload.sessionId}`, error);
        }
      }
    } finally {
      this.processingCache = false;
    }

    return successCount;
  }

  /**
   * Get number of cached uploads
   */
  getCachedUploadCount(): number {
    return this.uploadCache.size;
  }

  /**
   * Clear all cached uploads
   */
  clearCache(): void {
    this.uploadCache.clear();
    this.saveCacheToStorage();
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      const isLastAttempt = attempt >= this.retryConfig.maxRetries - 1;
      
      if (isLastAttempt || !this.shouldRetry(error)) {
        // Throw user-friendly error on last attempt
        const friendlyMessage = this.getUserFriendlyError(error);
        const enhancedError = new Error(friendlyMessage);
        (enhancedError as any).originalError = error;
        throw enhancedError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
        this.retryConfig.maxDelayMs
      );

      await this.sleep(delay);
      return this.retryRequest(requestFn, attempt + 1);
    }
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    // Retry on network errors
    if (this.isNetworkError(error)) {
      return true;
    }

    // Retry on 5xx server errors
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Retry on timeout
    if (error.code === 'ECONNABORTED') {
      return true;
    }

    return false;
  }

  /**
   * Get user-friendly error message from error
   */
  private getUserFriendlyError(error: unknown): string {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error.message : 'Unknown error occurred';
    }

    if (this.isNetworkError(error)) {
      return '网络连接失败。请检查网络连接。/ Network connection failed. Please check your connection.';
    }

    if (error.response) {
      const status = error.response.status;
      
      if (status === 404) {
        return '请求的资源不存在。/ Requested resource not found.';
      }
      
      if (status === 400) {
        return '请求数据格式错误。/ Invalid request data.';
      }
      
      if (status >= 500) {
        return '服务器错误。请稍后重试。/ Server error. Please try again later.';
      }
      
      return error.response.data?.message || `请求失败 (${status}) / Request failed (${status})`;
    }

    if (error.code === 'ECONNABORTED') {
      return '请求超时。请重试。/ Request timeout. Please retry.';
    }

    return error.message || '未知错误 / Unknown error';
  }

  /**
   * Check if error is a network error
   */
  private isNetworkError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    // Network errors don't have a response
    if (!error.response) {
      return true;
    }

    return false;
  }

  /**
   * Cache an upload for later retry
   */
  private cacheUpload(sessionId: string, segmentIndex: number, data: SegmentData): void {
    const cacheKey = `${sessionId}-${segmentIndex}`;
    this.uploadCache.set(cacheKey, {
      sessionId,
      segmentIndex,
      data,
      timestamp: Date.now(),
    });
    this.saveCacheToStorage();
  }

  /**
   * Save cache to localStorage
   */
  private saveCacheToStorage(): void {
    try {
      const cacheArray = Array.from(this.uploadCache.entries());
      localStorage.setItem('api_upload_cache', JSON.stringify(cacheArray));
    } catch (error) {
      console.error('Failed to save upload cache to localStorage', error);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadCacheFromStorage(): void {
    try {
      const cached = localStorage.getItem('api_upload_cache');
      if (cached) {
        const cacheArray = JSON.parse(cached) as [string, CachedUpload][];
        this.uploadCache = new Map(cacheArray);
      }
    } catch (error) {
      console.error('Failed to load upload cache from localStorage', error);
      this.uploadCache = new Map();
    }
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const apiClient = new APIClient();
