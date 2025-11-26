/**
 * Error logging utility for frontend
 * Provides structured error logging with context and persistence
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorLog {
  timestamp: string;
  severity: ErrorSeverity;
  category: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  userAgent: string;
  url: string;
}

class ErrorLogger {
  private maxLogs = 100;
  private storageKey = 'app_error_logs';

  /**
   * Log an error with context
   */
  log(
    error: Error | string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: string = 'general',
    context?: Record<string, unknown>
  ): void {
    const errorLog: ErrorLog = {
      timestamp: new Date().toISOString(),
      severity,
      category,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Log to console
    this.logToConsole(errorLog);

    // Store in localStorage
    this.storeLog(errorLog);

    // Send to backend if critical
    if (severity === ErrorSeverity.CRITICAL) {
      this.sendToBackend(errorLog);
    }
  }

  /**
   * Log camera-related errors
   */
  logCameraError(error: Error | string, context?: Record<string, unknown>): void {
    this.log(error, ErrorSeverity.HIGH, 'camera', context);
  }

  /**
   * Log API-related errors
   */
  logAPIError(error: Error | string, context?: Record<string, unknown>): void {
    this.log(error, ErrorSeverity.MEDIUM, 'api', context);
  }

  /**
   * Log network-related errors
   */
  logNetworkError(error: Error | string, context?: Record<string, unknown>): void {
    this.log(error, ErrorSeverity.MEDIUM, 'network', context);
  }

  /**
   * Log rendering-related errors
   */
  logRenderError(error: Error | string, context?: Record<string, unknown>): void {
    this.log(error, ErrorSeverity.HIGH, 'render', context);
  }

  /**
   * Log state machine errors
   */
  logStateError(error: Error | string, context?: Record<string, unknown>): void {
    this.log(error, ErrorSeverity.MEDIUM, 'state', context);
  }

  /**
   * Get all stored logs
   */
  getLogs(): ErrorLog[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to retrieve error logs:', error);
      return [];
    }
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category: string): ErrorLog[] {
    return this.getLogs().filter((log) => log.category === category);
  }

  /**
   * Get logs by severity
   */
  getLogsBySeverity(severity: ErrorSeverity): ErrorLog[] {
    return this.getLogs().filter((log) => log.severity === severity);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear error logs:', error);
    }
  }

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    return JSON.stringify(this.getLogs(), null, 2);
  }

  /**
   * Log to console with appropriate level
   */
  private logToConsole(errorLog: ErrorLog): void {
    const prefix = `[${errorLog.severity.toUpperCase()}] [${errorLog.category}]`;
    
    switch (errorLog.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(prefix, errorLog.message, errorLog);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(prefix, errorLog.message, errorLog);
        break;
      case ErrorSeverity.LOW:
        console.info(prefix, errorLog.message, errorLog);
        break;
    }
  }

  /**
   * Store log in localStorage
   */
  private storeLog(errorLog: ErrorLog): void {
    try {
      const logs = this.getLogs();
      logs.push(errorLog);

      // Keep only the most recent logs
      if (logs.length > this.maxLogs) {
        logs.splice(0, logs.length - this.maxLogs);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to store error log:', error);
    }
  }

  /**
   * Send critical errors to backend
   */
  private async sendToBackend(errorLog: ErrorLog): Promise<void> {
    try {
      // Only send to backend if available
      const response = await fetch('/api/logs/error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorLog),
      });

      if (!response.ok) {
        console.warn('Failed to send error log to backend:', response.statusText);
      }
    } catch (error) {
      // Silently fail - don't want error logging to cause more errors
      console.warn('Could not send error log to backend:', error);
    }
  }
}

// Export singleton instance
export const errorLogger = new ErrorLogger();

/**
 * Global error handler setup
 */
export const setupGlobalErrorHandling = (): void => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    errorLogger.log(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      ErrorSeverity.HIGH,
      'unhandled-promise',
      {
        promise: event.promise,
      }
    );
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    errorLogger.log(
      event.error || new Error(event.message),
      ErrorSeverity.HIGH,
      'global-error',
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }
    );
  });
};
