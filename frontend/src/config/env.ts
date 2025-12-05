/**
 * Environment configuration
 * Handles API base URL configuration for different environments
 */

import { APP_CONFIG } from './constants';

/**
 * Get API base URL from environment or use default
 * In production, this should be set to the actual server IP/domain
 */
export function getApiBaseUrl(): string {
  // Check if running in development mode
  const isDevelopment = import.meta.env.DEV;
  
  // In development, use localhost
  if (isDevelopment) {
    return `http://localhost:${APP_CONFIG.API.DEFAULT_PORT}`;
  }
  
  // In production, try to get from environment variable
  const envApiUrl = import.meta.env.VITE_API_BASE_URL;
  if (envApiUrl) {
    return envApiUrl;
  }
  
  // Fallback: use current host with configured port
  // This works when frontend and backend are on the same machine
  const currentHost = window.location.hostname;
  return `http://${currentHost}:${APP_CONFIG.API.DEFAULT_PORT}`;
}

/**
 * Get video URL for QR code generation
 * This should use the LAN IP address for mobile device access
 */
export function getVideoUrl(sessionId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/videos/${sessionId}`;
}

/**
 * Environment configuration object
 */
export const env = {
  apiBaseUrl: getApiBaseUrl(),
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
};
