/**
 * Property-based tests for API Client
 * Feature: shadow-puppet-interactive-system
 */

import * as fc from 'fast-check';
import axios from 'axios';
import { APIClient, SessionStatus, SegmentData } from './api-client';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('APIClient Property Tests', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    localStorage.clear();

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Feature: shadow-puppet-interactive-system, Property 29: Failed requests trigger retry with backoff
   * Validates: Requirements 18.2
   * 
   * For any failed backend API request, the frontend should retry up to 3 times 
   * with exponential backoff delays.
   */
  describe('Property 29: Failed requests trigger retry with backoff', () => {
    it('should retry failed requests with exponential backoff', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate number of initial failures (0 to 2, so total attempts 1 to 3)
          fc.integer({ min: 0, max: 2 }),
          // Generate scene ID
          fc.string({ minLength: 1, maxLength: 20 }),
          async (failureCount, sceneId) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const networkError = {
              isAxiosError: true,
              response: undefined,
              message: 'Network Error',
            };

            const successResponse = {
              data: {
                session_id: 'test-session-id',
                scene_id: sceneId,
                status: SessionStatus.PENDING,
              },
            };

            // Mock failures followed by success
            for (let i = 0; i < failureCount; i++) {
              mockAxiosInstance.post.mockRejectedValueOnce(networkError);
            }
            mockAxiosInstance.post.mockResolvedValueOnce(successResponse);

            const startTime = Date.now();
            const result = await client.createSession(sceneId);
            const endTime = Date.now();
            const elapsed = endTime - startTime;

            // Verify the request succeeded
            expect(result.session_id).toBe('test-session-id');
            expect(result.scene_id).toBe(sceneId);

            // Verify retry count (failureCount + 1 for success)
            expect(mockAxiosInstance.post).toHaveBeenCalledTimes(failureCount + 1);

            // Verify exponential backoff timing
            // Each retry should add at least initialDelayMs * (backoffMultiplier ^ attempt)
            if (failureCount > 0) {
              let expectedMinDelay = 0;
              for (let i = 0; i < failureCount; i++) {
                expectedMinDelay += 10 * Math.pow(2, i);
              }
              // Allow some tolerance for execution time
              expect(elapsed).toBeGreaterThanOrEqual(expectedMinDelay * 0.8);
            }

            // Reset mock for next iteration
            mockAxiosInstance.post.mockReset();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fail after max retries are exhausted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          async (sceneId) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const networkError = {
              isAxiosError: true,
              response: undefined,
              message: 'Network Error',
            };

            // Mock all attempts to fail
            mockAxiosInstance.post.mockRejectedValue(networkError);

            // Should throw after 3 attempts
            await expect(client.createSession(sceneId)).rejects.toEqual(networkError);

            // Verify exactly 3 attempts were made
            expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);

            // Reset mock for next iteration
            mockAxiosInstance.post.mockReset();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should retry on 5xx server errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 500, max: 599 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (statusCode, sceneId) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const serverError = {
              isAxiosError: true,
              response: { status: statusCode, data: { detail: 'Server Error' } },
              message: 'Server Error',
            };

            const successResponse = {
              data: {
                session_id: 'test-session-id',
                scene_id: sceneId,
                status: SessionStatus.PENDING,
              },
            };

            // Mock one failure then success
            mockAxiosInstance.post
              .mockRejectedValueOnce(serverError)
              .mockResolvedValueOnce(successResponse);

            const result = await client.createSession(sceneId);

            // Verify retry occurred
            expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
            expect(result.session_id).toBe('test-session-id');

            // Reset mock for next iteration
            mockAxiosInstance.post.mockReset();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not retry on 4xx client errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (statusCode, sceneId) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const clientError = {
              isAxiosError: true,
              response: { status: statusCode, data: { detail: 'Client Error' } },
              message: 'Client Error',
            };

            mockAxiosInstance.post.mockRejectedValue(clientError);

            // Should fail immediately without retry
            await expect(client.createSession(sceneId)).rejects.toEqual(clientError);

            // Verify only 1 attempt was made
            expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

            // Reset mock for next iteration
            mockAxiosInstance.post.mockReset();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shadow-puppet-interactive-system, Property 31: Network interruption triggers local caching
   * Validates: Requirements 18.5
   * 
   * For any segment upload that fails due to network error, the system should cache 
   * the data locally and retry when connection is restored.
   */
  describe('Property 31: Network interruption triggers local caching', () => {
    // Generator for segment data
    const segmentDataArb = fc.record({
      index: fc.integer({ min: 0, max: 10 }),
      duration: fc.float({ min: 1, max: 20, noNaN: true }),
      frames: fc.array(
        fc.record({
          timestamp: fc.float({ min: 0, max: 10000, noNaN: true }),
          landmarks: fc.array(
            fc.array(fc.float({ min: 0, max: 1, noNaN: true }), { minLength: 4, maxLength: 4 }),
            { minLength: 1, maxLength: 33 }
          ),
        }),
        { minLength: 1, maxLength: 100 }
      ),
    });

    it('should cache uploads on network error', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          segmentDataArb,
          async (sessionId, segmentData) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const networkError = {
              isAxiosError: true,
              response: undefined,
              message: 'Network Error',
            };

            // Mock network error for all attempts
            mockAxiosInstance.post.mockRejectedValue(networkError);

            // Attempt upload - should fail and cache
            await expect(
              client.uploadSegment(sessionId, segmentData.index, segmentData)
            ).rejects.toThrow('Network error: Upload cached for retry');

            // Verify upload was cached
            expect(client.getCachedUploadCount()).toBe(1);

            // Reset for next iteration
            mockAxiosInstance.post.mockReset();
            client.clearCache();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not cache uploads on client errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          segmentDataArb,
          fc.integer({ min: 400, max: 499 }),
          async (sessionId, segmentData, statusCode) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const clientError = {
              isAxiosError: true,
              response: { status: statusCode, data: { detail: 'Client Error' } },
              message: 'Client Error',
            };

            mockAxiosInstance.post.mockRejectedValue(clientError);

            // Attempt upload - should fail without caching
            await expect(
              client.uploadSegment(sessionId, segmentData.index, segmentData)
            ).rejects.toEqual(clientError);

            // Verify upload was NOT cached
            expect(client.getCachedUploadCount()).toBe(0);

            // Reset for next iteration
            mockAxiosInstance.post.mockReset();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should successfully retry cached uploads when connection restored', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          segmentDataArb,
          async (sessionId, segmentData) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const networkError = {
              isAxiosError: true,
              response: undefined,
              message: 'Network Error',
            };

            // First attempt: network error, should cache
            mockAxiosInstance.post.mockRejectedValue(networkError);

            await expect(
              client.uploadSegment(sessionId, segmentData.index, segmentData)
            ).rejects.toThrow('Network error: Upload cached for retry');

            expect(client.getCachedUploadCount()).toBe(1);

            // Connection restored: mock success
            mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

            // Process cached uploads
            const processed = await client.processCachedUploads();

            // Verify upload succeeded and cache cleared
            expect(processed).toBe(1);
            expect(client.getCachedUploadCount()).toBe(0);

            // Reset for next iteration
            mockAxiosInstance.post.mockReset();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should persist cache across client instances', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          segmentDataArb,
          async (sessionId, segmentData) => {
            // Clear localStorage before test
            localStorage.clear();

            const client1 = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const networkError = {
              isAxiosError: true,
              response: undefined,
              message: 'Network Error',
            };

            mockAxiosInstance.post.mockRejectedValue(networkError);

            // Cache upload with first client
            await expect(
              client1.uploadSegment(sessionId, segmentData.index, segmentData)
            ).rejects.toThrow('Network error: Upload cached for retry');

            expect(client1.getCachedUploadCount()).toBe(1);

            // Create new client instance - should load cache from localStorage
            const client2 = new APIClient('http://localhost:8000');

            // Verify cache was loaded
            expect(client2.getCachedUploadCount()).toBe(1);

            // Reset for next iteration
            mockAxiosInstance.post.mockReset();
            localStorage.clear();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple cached uploads', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(segmentDataArb, { minLength: 1, maxLength: 3 }),
          async (sessionId, segments) => {
            const client = new APIClient('http://localhost:8000', {
              maxRetries: 3,
              initialDelayMs: 10,
              maxDelayMs: 100,
              backoffMultiplier: 2,
            });

            const networkError = {
              isAxiosError: true,
              response: undefined,
              message: 'Network Error',
            };

            // Ensure segments have unique indices by reassigning them
            const uniqueSegments = segments.map((seg, idx) => ({
              ...seg,
              index: idx,
            }));

            // Cache multiple uploads
            mockAxiosInstance.post.mockRejectedValue(networkError);

            for (const segment of uniqueSegments) {
              await expect(
                client.uploadSegment(sessionId, segment.index, segment)
              ).rejects.toThrow('Network error: Upload cached for retry');
            }

            // Verify all uploads were cached
            expect(client.getCachedUploadCount()).toBe(uniqueSegments.length);

            // Connection restored
            mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

            // Process all cached uploads
            const processed = await client.processCachedUploads();

            // Verify all uploads succeeded
            expect(processed).toBe(uniqueSegments.length);
            expect(client.getCachedUploadCount()).toBe(0);

            // Reset for next iteration
            mockAxiosInstance.post.mockReset();
            client.clearCache();
          }
        ),
        { numRuns: 50 }
      );
    }, 10000); // 10 second timeout
  });
});
