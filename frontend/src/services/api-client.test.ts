/**
 * Unit tests for API Client
 */

import axios from 'axios';
import { APIClient, SessionStatus, SegmentData } from './api-client';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('APIClient', () => {
  let client: APIClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Create mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      defaults: {
        baseURL: 'http://localhost:8000',
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.isAxiosError.mockImplementation((error: any) => {
      return error && error.isAxiosError === true;
    });

    // Create client with shorter retry delays for testing
    client = new APIClient('http://localhost:8000', {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session successfully', async () => {
      const mockResponse = {
        data: {
          session_id: 'test-session-id',
          scene_id: 'sceneA',
          status: SessionStatus.PENDING,
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.createSession('sceneA');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/sessions', {
        scene_id: 'sceneA',
      });
    });

    it('should retry on network error', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };

      const mockResponse = {
        data: {
          session_id: 'test-session-id',
          scene_id: 'sceneA',
          status: SessionStatus.PENDING,
        },
      };

      mockAxiosInstance.post
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockResponse);

      const result = await client.createSession('sceneA');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };

      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(client.createSession('sceneA')).rejects.toEqual(networkError);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('uploadSegment', () => {
    const segmentData: SegmentData = {
      index: 0,
      duration: 8.0,
      frames: [
        {
          timestamp: 33.5,
          landmarks: [[0.5, 0.3, -0.1, 0.99]],
        },
      ],
    };

    it('should upload segment successfully', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      await client.uploadSegment('session-id', 0, segmentData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/sessions/session-id/segments/0',
        segmentData,
        expect.objectContaining({
          onUploadProgress: expect.any(Function)
        })
      );
    });

    it('should call progress callback during upload', async () => {
      const progressCallback = jest.fn();
      
      mockAxiosInstance.post.mockImplementation((url, data, config) => {
        // Simulate upload progress
        if (config?.onUploadProgress) {
          config.onUploadProgress({ loaded: 50, total: 100 });
          config.onUploadProgress({ loaded: 100, total: 100 });
        }
        return Promise.resolve({ data: { success: true } });
      });

      await client.uploadSegment('session-id', 0, segmentData, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(50);
      expect(progressCallback).toHaveBeenCalledWith(100);
      expect(progressCallback).toHaveBeenCalledTimes(2);
    });

    it('should cache upload on network error', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };

      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(
        client.uploadSegment('session-id', 0, segmentData)
      ).rejects.toThrow('Network error: Upload cached for retry');

      expect(client.getCachedUploadCount()).toBe(1);
    });

    it('should not cache upload on 4xx error', async () => {
      const clientError = {
        isAxiosError: true,
        response: { status: 400, data: { detail: 'Bad request' } },
        message: 'Bad Request',
      };

      mockAxiosInstance.post.mockRejectedValue(clientError);

      await expect(
        client.uploadSegment('session-id', 0, segmentData)
      ).rejects.toEqual(clientError);

      expect(client.getCachedUploadCount()).toBe(0);
    });
  });

  describe('getSessionStatus', () => {
    it('should get session status successfully', async () => {
      const mockResponse = {
        data: {
          id: 'session-id',
          scene_id: 'sceneA',
          status: SessionStatus.DONE,
          output_path: 'outputs/final_session-id.mp4',
          segment_count: 3,
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getSessionStatus('session-id');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/sessions/session-id');
    });
  });

  describe('getVideoUrl', () => {
    it('should return correct video URL', () => {
      const url = client.getVideoUrl('session-id');
      expect(url).toBe('http://localhost:8000/api/videos/session-id');
    });
  });

  describe('cancelSession', () => {
    it('should cancel session successfully', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: { success: true } });

      await client.cancelSession('session-id');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/api/sessions/session-id');
    });
  });

  describe('cache management', () => {
    const segmentData: SegmentData = {
      index: 0,
      duration: 8.0,
      frames: [{ timestamp: 33.5, landmarks: [[0.5, 0.3, -0.1, 0.99]] }],
    };

    it('should persist cache to localStorage', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };

      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(
        client.uploadSegment('session-id', 0, segmentData)
      ).rejects.toThrow();

      const cached = localStorage.getItem('api_upload_cache');
      expect(cached).toBeTruthy();
      
      const parsed = JSON.parse(cached!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0][1].sessionId).toBe('session-id');
    });

    it('should load cache from localStorage on initialization', async () => {
      // Manually set cache in localStorage
      const cacheData = [
        [
          'session-id-0',
          {
            sessionId: 'session-id',
            segmentIndex: 0,
            data: segmentData,
            timestamp: Date.now(),
          },
        ],
      ];
      localStorage.setItem('api_upload_cache', JSON.stringify(cacheData));

      // Create new client
      const newClient = new APIClient('http://localhost:8000');
      expect(newClient.getCachedUploadCount()).toBe(1);
    });

    it('should clear cache', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };

      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(
        client.uploadSegment('session-id', 0, segmentData)
      ).rejects.toThrow();

      expect(client.getCachedUploadCount()).toBe(1);

      client.clearCache();
      expect(client.getCachedUploadCount()).toBe(0);
    });

    it('should process cached uploads', async () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };

      // First upload fails and gets cached
      mockAxiosInstance.post.mockRejectedValue(networkError);
      await expect(
        client.uploadSegment('session-id', 0, segmentData)
      ).rejects.toThrow();

      expect(client.getCachedUploadCount()).toBe(1);

      // Now mock success for retry
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      const processed = await client.processCachedUploads();
      expect(processed).toBe(1);
      expect(client.getCachedUploadCount()).toBe(0);
    });
  });

  describe('retry logic', () => {
    it('should retry on 500 server error', async () => {
      const serverError = {
        isAxiosError: true,
        response: { status: 500, data: { detail: 'Internal Server Error' } },
        message: 'Server Error',
      };

      const mockResponse = {
        data: {
          session_id: 'test-session-id',
          scene_id: 'sceneA',
          status: SessionStatus.PENDING,
        },
      };

      mockAxiosInstance.post
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(mockResponse);

      const result = await client.createSession('sceneA');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 404 error', async () => {
      const notFoundError = {
        isAxiosError: true,
        response: { status: 404, data: { detail: 'Not Found' } },
        message: 'Not Found',
      };

      mockAxiosInstance.get.mockRejectedValue(notFoundError);

      await expect(client.getSessionStatus('invalid-id')).rejects.toEqual(notFoundError);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });
});
