/**
 * Example usage of the API Client
 * This file demonstrates how to use the APIClient for common operations
 */

import { apiClient, APIClient, SessionStatus, SegmentData } from './api-client';

/**
 * Example 1: Create a session and upload segments
 */
async function exampleCreateSessionAndUpload() {
  try {
    // Create a new session
    const session = await apiClient.createSession('sceneA');
    console.log('Session created:', session.session_id);

    // Prepare segment data
    const segmentData: SegmentData = {
      index: 0,
      duration: 8.0,
      frames: [
        {
          timestamp: 33.5,
          landmarks: [
            [0.5, 0.3, -0.1, 0.99], // [x, y, z, visibility]
            [0.52, 0.28, -0.12, 0.98],
            // ... more landmarks
          ],
        },
        // ... more frames
      ],
    };

    // Upload segment
    await apiClient.uploadSegment(session.session_id, 0, segmentData);
    console.log('Segment uploaded successfully');

    // Check session status
    const status = await apiClient.getSessionStatus(session.session_id);
    console.log('Session status:', status.status);

    // Get video URL when done
    if (status.status === SessionStatus.DONE) {
      const videoUrl = apiClient.getVideoUrl(session.session_id);
      console.log('Video URL:', videoUrl);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 2: Handle network errors with automatic retry
 */
async function exampleWithRetry() {
  try {
    // The client will automatically retry up to 3 times on network errors
    const session = await apiClient.createSession('sceneB');
    console.log('Session created (with automatic retry):', session.session_id);
  } catch (error) {
    console.error('Failed after retries:', error);
  }
}

/**
 * Example 3: Handle offline uploads with caching
 */
async function exampleOfflineUpload() {
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

  try {
    // If network is down, this will cache the upload
    await apiClient.uploadSegment('session-id', 0, segmentData);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cached for retry')) {
      console.log('Upload cached for later retry');
      console.log('Cached uploads:', apiClient.getCachedUploadCount());
    }
  }

  // Later, when connection is restored
  try {
    const processed = await apiClient.processCachedUploads();
    console.log(`Successfully processed ${processed} cached uploads`);
  } catch (error) {
    console.error('Failed to process cached uploads:', error);
  }
}

/**
 * Example 4: Poll for video rendering completion
 */
async function examplePollForCompletion(sessionId: string) {
  const pollInterval = 2000; // 2 seconds
  const maxAttempts = 60; // 2 minutes max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const status = await apiClient.getSessionStatus(sessionId);

      if (status.status === SessionStatus.DONE) {
        console.log('Video ready!');
        const videoUrl = apiClient.getVideoUrl(sessionId);
        return videoUrl;
      } else if (status.status === SessionStatus.FAILED) {
        throw new Error('Video rendering failed');
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('Error polling status:', error);
      throw error;
    }
  }

  throw new Error('Timeout waiting for video');
}

/**
 * Example 5: Cancel a session
 */
async function exampleCancelSession(sessionId: string) {
  try {
    await apiClient.cancelSession(sessionId);
    console.log('Session cancelled successfully');
  } catch (error) {
    console.error('Error cancelling session:', error);
  }
}

/**
 * Example 6: Custom API client with different configuration
 */
function exampleCustomClient() {
  // Create a custom client with different retry settings
  const customClient = new APIClient('http://192.168.1.100:8000', {
    maxRetries: 5,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 3,
  });

  return customClient;
}

// Export examples for documentation
export {
  exampleCreateSessionAndUpload,
  exampleWithRetry,
  exampleOfflineUpload,
  examplePollForCompletion,
  exampleCancelSession,
  exampleCustomClient,
};
