/**
 * Property-based tests for video URL format
 * Feature: shadow-puppet-interactive-system, Property 13: Video URL follows naming convention
 * Validates: Requirements 9.4
 */

import * as fc from 'fast-check';
import { APIClient } from './api-client';

describe('Property 13: Video URL follows naming convention', () => {
  // Property test with 100 iterations
  it('should generate video URLs matching the pattern /videos/{sessionId} for any session ID', () => {
    fc.assert(
      fc.property(
        // Generate valid UUID-like session IDs
        fc.uuid(),
        (sessionId) => {
          // Create API client with test base URL
          const apiClient = new APIClient('http://localhost:8000');

          // Get video URL
          const videoUrl = apiClient.getVideoUrl(sessionId);

          // Property: URL should match the pattern
          // Expected format: http://localhost:8000/api/videos/{sessionId}
          const expectedPattern = new RegExp(
            `^http://localhost:8000/api/videos/${sessionId}$`
          );

          expect(videoUrl).toMatch(expectedPattern);

          // Additional checks
          expect(videoUrl).toContain('/api/videos/');
          expect(videoUrl).toContain(sessionId);
          expect(videoUrl.split('/').pop()).toBe(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate consistent URLs for the same session ID', () => {
    fc.assert(
      fc.property(fc.uuid(), (sessionId) => {
        const apiClient = new APIClient('http://localhost:8000');

        // Get URL multiple times
        const url1 = apiClient.getVideoUrl(sessionId);
        const url2 = apiClient.getVideoUrl(sessionId);
        const url3 = apiClient.getVideoUrl(sessionId);

        // Property: Same session ID should always produce the same URL
        expect(url1).toBe(url2);
        expect(url2).toBe(url3);
      }),
      { numRuns: 100 }
    );
  });

  it('should generate different URLs for different session IDs', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (sessionId1, sessionId2) => {
          // Skip if session IDs are the same
          fc.pre(sessionId1 !== sessionId2);

          const apiClient = new APIClient('http://localhost:8000');

          const url1 = apiClient.getVideoUrl(sessionId1);
          const url2 = apiClient.getVideoUrl(sessionId2);

          // Property: Different session IDs should produce different URLs
          expect(url1).not.toBe(url2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should respect the base URL provided to the API client', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.webUrl({ withFragments: false, withQueryParameters: false }),
        (sessionId, baseUrl) => {
          // Remove trailing slash if present
          const cleanBaseUrl = baseUrl.replace(/\/$/, '');

          const apiClient = new APIClient(cleanBaseUrl);
          const videoUrl = apiClient.getVideoUrl(sessionId);

          // Property: URL should start with the base URL
          expect(videoUrl).toContain(cleanBaseUrl);
          expect(videoUrl).toContain(`/api/videos/${sessionId}`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
