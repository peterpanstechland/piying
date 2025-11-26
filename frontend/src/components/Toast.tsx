import React, { useEffect, useState } from 'react';
import './Toast.css';

export enum ToastType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

/**
 * Individual toast notification component
 */
const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration || 5000;
    
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 300); // Match animation duration
  };

  const getIcon = () => {
    switch (toast.type) {
      case ToastType.SUCCESS:
        return '✓';
      case ToastType.ERROR:
        return '✕';
      case ToastType.WARNING:
        return '⚠';
      case ToastType.INFO:
        return 'ℹ';
      default:
        return 'ℹ';
    }
  };

  return (
    <div className={`toast toast-${toast.type} ${isExiting ? 'toast-exit' : ''}`}>
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        <div className="toast-message">{toast.message}</div>
      </div>
      {toast.action && (
        <button 
          className="toast-action"
          onClick={() => {
            toast.action!.onClick();
            handleClose();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={handleClose}>
        ×
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

/**
 * Toast container component that manages multiple toasts
 */
export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};

/**
 * Toast manager class for programmatic toast creation
 */
class ToastManager {
  private listeners: Set<(toasts: ToastMessage[]) => void> = new Set();
  private toasts: ToastMessage[] = [];

  subscribe(listener: (toasts: ToastMessage[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  show(toast: Omit<ToastMessage, 'id'>): string {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastMessage = { ...toast, id };
    this.toasts.push(newToast);
    this.notify();
    return id;
  }

  success(title: string, message: string, duration?: number): string {
    return this.show({ type: ToastType.SUCCESS, title, message, duration });
  }

  error(title: string, message: string, action?: ToastMessage['action'], duration?: number): string {
    return this.show({ type: ToastType.ERROR, title, message, action, duration });
  }

  warning(title: string, message: string, duration?: number): string {
    return this.show({ type: ToastType.WARNING, title, message, duration });
  }

  info(title: string, message: string, duration?: number): string {
    return this.show({ type: ToastType.INFO, title, message, duration });
  }

  close(id: string): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.notify();
  }

  closeAll(): void {
    this.toasts = [];
    this.notify();
  }
}

// Export singleton instance
export const toastManager = new ToastManager();

/**
 * Hook to use toast notifications in React components
 */
export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = toastManager.subscribe(setToasts);
    return unsubscribe;
  }, []);

  return {
    toasts,
    showToast: toastManager.show.bind(toastManager),
    showSuccess: toastManager.success.bind(toastManager),
    showError: toastManager.error.bind(toastManager),
    showWarning: toastManager.warning.bind(toastManager),
    showInfo: toastManager.info.bind(toastManager),
    closeToast: toastManager.close.bind(toastManager),
    closeAll: toastManager.closeAll.bind(toastManager),
  };
};
