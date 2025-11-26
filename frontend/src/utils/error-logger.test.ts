import { describe, it, expect, beforeEach } from '@jest/globals';
import { errorLogger, ErrorSeverity } from './error-logger';

describe('Error Logger', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    errorLogger.clearLogs();
  });

  describe('log', () => {
    it('should log error with correct structure', () => {
      const error = new Error('Test error');
      errorLogger.log(error, ErrorSeverity.MEDIUM, 'test');

      const logs = errorLogger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('Test error');
      expect(logs[0].severity).toBe(ErrorSeverity.MEDIUM);
      expect(logs[0].category).toBe('test');
      expect(logs[0].timestamp).toBeTruthy();
      expect(logs[0].userAgent).toBeTruthy();
      expect(logs[0].url).toBeTruthy();
    });

    it('should log string errors', () => {
      errorLogger.log('String error', ErrorSeverity.LOW, 'test');

      const logs = errorLogger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('String error');
      expect(logs[0].stack).toBeUndefined();
    });

    it('should include context when provided', () => {
      const context = { userId: '123', action: 'upload' };
      errorLogger.log('Test error', ErrorSeverity.MEDIUM, 'test', context);

      const logs = errorLogger.getLogs();
      expect(logs[0].context).toEqual(context);
    });

    it('should limit stored logs to maxLogs', () => {
      // Log more than maxLogs (100)
      for (let i = 0; i < 110; i++) {
        errorLogger.log(`Error ${i}`, ErrorSeverity.LOW, 'test');
      }

      const logs = errorLogger.getLogs();
      expect(logs.length).toBe(100);
      // Should keep the most recent logs
      expect(logs[0].message).toBe('Error 10');
      expect(logs[99].message).toBe('Error 109');
    });
  });

  describe('category-specific logging', () => {
    it('should log camera errors', () => {
      errorLogger.logCameraError('Camera failed');
      
      const logs = errorLogger.getLogs();
      expect(logs[0].category).toBe('camera');
      expect(logs[0].severity).toBe(ErrorSeverity.HIGH);
    });

    it('should log API errors', () => {
      errorLogger.logAPIError('API failed');
      
      const logs = errorLogger.getLogs();
      expect(logs[0].category).toBe('api');
      expect(logs[0].severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should log network errors', () => {
      errorLogger.logNetworkError('Network failed');
      
      const logs = errorLogger.getLogs();
      expect(logs[0].category).toBe('network');
      expect(logs[0].severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should log render errors', () => {
      errorLogger.logRenderError('Render failed');
      
      const logs = errorLogger.getLogs();
      expect(logs[0].category).toBe('render');
      expect(logs[0].severity).toBe(ErrorSeverity.HIGH);
    });

    it('should log state errors', () => {
      errorLogger.logStateError('State failed');
      
      const logs = errorLogger.getLogs();
      expect(logs[0].category).toBe('state');
      expect(logs[0].severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('log retrieval', () => {
    beforeEach(() => {
      errorLogger.log('Error 1', ErrorSeverity.LOW, 'category1');
      errorLogger.log('Error 2', ErrorSeverity.HIGH, 'category2');
      errorLogger.log('Error 3', ErrorSeverity.MEDIUM, 'category1');
      errorLogger.log('Error 4', ErrorSeverity.CRITICAL, 'category3');
    });

    it('should get all logs', () => {
      const logs = errorLogger.getLogs();
      expect(logs.length).toBe(4);
    });

    it('should get logs by category', () => {
      const logs = errorLogger.getLogsByCategory('category1');
      expect(logs.length).toBe(2);
      expect(logs[0].message).toBe('Error 1');
      expect(logs[1].message).toBe('Error 3');
    });

    it('should get logs by severity', () => {
      const logs = errorLogger.getLogsBySeverity(ErrorSeverity.HIGH);
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('Error 2');
    });
  });

  describe('log management', () => {
    it('should clear all logs', () => {
      errorLogger.log('Error 1', ErrorSeverity.LOW, 'test');
      errorLogger.log('Error 2', ErrorSeverity.LOW, 'test');
      
      expect(errorLogger.getLogs().length).toBe(2);
      
      errorLogger.clearLogs();
      
      expect(errorLogger.getLogs().length).toBe(0);
    });

    it('should export logs as JSON', () => {
      errorLogger.log('Error 1', ErrorSeverity.LOW, 'test');
      errorLogger.log('Error 2', ErrorSeverity.MEDIUM, 'test');
      
      const exported = errorLogger.exportLogs();
      const parsed = JSON.parse(exported);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].message).toBe('Error 1');
      expect(parsed[1].message).toBe('Error 2');
    });
  });

  describe('persistence', () => {
    it('should persist logs to localStorage', () => {
      errorLogger.log('Persistent error', ErrorSeverity.MEDIUM, 'test');
      
      const stored = localStorage.getItem('app_error_logs');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.length).toBe(1);
      expect(parsed[0].message).toBe('Persistent error');
    });

    it('should load logs from localStorage', () => {
      // Manually store logs
      const logs = [
        {
          timestamp: new Date().toISOString(),
          severity: ErrorSeverity.LOW,
          category: 'test',
          message: 'Stored error',
          userAgent: 'test',
          url: 'test',
        },
      ];
      localStorage.setItem('app_error_logs', JSON.stringify(logs));
      
      // Create new logger instance (simulates page reload)
      const retrieved = errorLogger.getLogs();
      expect(retrieved.length).toBeGreaterThan(0);
    });
  });
});
