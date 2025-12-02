import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorMessage, CameraAccessError, NetworkError } from './ErrorMessage';
import { toastManager, ToastType } from './Toast';

describe('Error Handling Components', () => {
  describe('ErrorBoundary', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Test Content</div>
        </ErrorBoundary>
      );
      
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('should render error UI when error is caught', () => {
      const ThrowError = () => {
        throw new Error('Test error');
      };

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText(/出现错误/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /刷新页面.*Reload Page/ })).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it('should call onError callback when error occurs', () => {
      const onError = jest.fn();
      const ThrowError = () => {
        throw new Error('Test error');
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('ErrorMessage', () => {
    it('should render error message with title and text', () => {
      render(
        <ErrorMessage
          title="Test Error"
          message="This is a test error message"
        />
      );

      expect(screen.getByText('Test Error')).toBeInTheDocument();
      expect(screen.getByText('This is a test error message')).toBeInTheDocument();
    });

    it('should call onRetry when retry button is clicked', () => {
      const onRetry = jest.fn();
      
      render(
        <ErrorMessage
          message="Test error"
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByText(/重试/);
      fireEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should call onDismiss when dismiss button is clicked', () => {
      const onDismiss = jest.fn();
      
      render(
        <ErrorMessage
          message="Test error"
          onDismiss={onDismiss}
        />
      );

      const dismissButton = screen.getByText(/关闭/);
      fireEvent.click(dismissButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should show details when showDetails is true', () => {
      render(
        <ErrorMessage
          message="Test error"
          details="Technical details here"
          showDetails={true}
        />
      );

      expect(screen.getByText(/技术详情/)).toBeInTheDocument();
    });
  });

  describe('CameraAccessError', () => {
    it('should render camera-specific error message', () => {
      const onRetry = jest.fn();
      
      render(<CameraAccessError onRetry={onRetry} />);

      expect(screen.getByText(/无法访问摄像头/)).toBeInTheDocument();
      expect(screen.getByText(/Camera Access Denied/)).toBeInTheDocument();
    });

    it('should include troubleshooting steps', () => {
      const onRetry = jest.fn();
      
      render(<CameraAccessError onRetry={onRetry} />);

      // Details should be present
      expect(screen.getByText(/技术详情/)).toBeInTheDocument();
    });
  });

  describe('NetworkError', () => {
    it('should render network-specific error message', () => {
      const onRetry = jest.fn();
      
      render(<NetworkError onRetry={onRetry} />);

      expect(screen.getByText(/网络连接失败/)).toBeInTheDocument();
      expect(screen.getByText(/Network Error/)).toBeInTheDocument();
    });
  });

  describe('Toast Manager', () => {
    it('should create success toast', () => {
      const id = toastManager.success('Success', 'Operation completed');
      expect(id).toBeTruthy();
      expect(id).toContain('toast-');
    });

    it('should create error toast', () => {
      const id = toastManager.error('Error', 'Operation failed');
      expect(id).toBeTruthy();
      expect(id).toContain('toast-');
    });

    it('should create warning toast', () => {
      const id = toastManager.warning('Warning', 'Be careful');
      expect(id).toBeTruthy();
      expect(id).toContain('toast-');
    });

    it('should create info toast', () => {
      const id = toastManager.info('Info', 'FYI');
      expect(id).toBeTruthy();
      expect(id).toContain('toast-');
    });

    it('should close specific toast', () => {
      const id = toastManager.success('Test', 'Message');
      toastManager.close(id);
      
      const logs = toastManager['toasts'];
      expect(logs.find(t => t.id === id)).toBeUndefined();
    });

    it('should close all toasts', () => {
      toastManager.success('Test 1', 'Message 1');
      toastManager.error('Test 2', 'Message 2');
      toastManager.closeAll();
      
      const logs = toastManager['toasts'];
      expect(logs.length).toBe(0);
    });
  });
});
