/**
 * Mock environment configuration for tests
 */

export function getApiBaseUrl(): string {
  return 'http://localhost:8000';
}

export function getVideoUrl(sessionId: string): string {
  return `http://localhost:8000/api/videos/${sessionId}`;
}

export const env = {
  apiBaseUrl: 'http://localhost:8000',
  isDevelopment: true,
  isProduction: false,
};
