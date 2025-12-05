/**
 * Global Application Constants
 */

export const APP_CONFIG = {
  // Recording Configuration
  RECORDING: {
    WIDTH: 1920,
    HEIGHT: 1080,
    FPS: 30,
    BITRATE: 2500000, // 2.5 Mbps
  },

  // Interaction Timers (in milliseconds or seconds as noted)
  TIMING: {
    // How long to hover over a button to trigger it (gesture control)
    HOVER_TRIGGER_DURATION_MS: 3000,
    
    // Inactivity timeout for auto-reset on result page
    RESULT_PAGE_TIMEOUT_SEC: 30,
    
    // Detection timeout to transition from Idle to Scene Select
    PRESENCE_DETECTION_THRESHOLD_MS: 1000,
  },

  // API Configuration
  API: {
    // Default port if not specified in environment
    DEFAULT_PORT: 8000,
    // Poll interval for render status
    RENDER_POLL_INTERVAL_MS: 2000,
  },
};

