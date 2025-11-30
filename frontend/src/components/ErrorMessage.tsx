import React, { useState } from 'react';
import './ErrorMessage.css';

export interface ErrorMessageProps {
  title?: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  onGoBack?: () => void;
  retryLabel?: string;
  dismissLabel?: string;
  showDetails?: boolean;
}

/**
 * Error message component with retry and dismiss options
 * Used for displaying user-friendly error messages with actionable buttons
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title = '出现错误',
  message,
  details,
  onRetry,
  onDismiss,
  onGoBack,
  retryLabel = '重试 / Retry',
  dismissLabel = '关闭 / Close',
  showDetails = false,
}) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  return (
    <div className="error-message">
      <div className="error-message-content">
        <div className="error-message-icon">⚠️</div>
        
        <h2 className="error-message-title">{title}</h2>
        
        <p className="error-message-text">{message}</p>

        {details && showDetails && (
          <details 
            className="error-message-details"
            open={detailsExpanded}
            onToggle={(e) => setDetailsExpanded((e.target as HTMLDetailsElement).open)}
          >
            <summary>技术详情 / Technical Details</summary>
            <pre className="error-message-details-content">{details}</pre>
          </details>
        )}

        <div className="error-message-actions">
          {onRetry && (
            <button 
              className="error-message-button error-message-button-primary"
              onClick={onRetry}
            >
              {retryLabel}
            </button>
          )}
          
          {onGoBack && (
            <button 
              className="error-message-button error-message-button-secondary"
              onClick={onGoBack}
            >
              返回 / Go Back
            </button>
          )}
          
          {onDismiss && (
            <button 
              className="error-message-button error-message-button-tertiary"
              onClick={onDismiss}
            >
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Inline error message component (smaller, for use within forms/pages)
 */
export const InlineErrorMessage: React.FC<{
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ message, onRetry, onDismiss }) => {
  return (
    <div className="inline-error-message">
      <div className="inline-error-icon">⚠️</div>
      <div className="inline-error-text">{message}</div>
      <div className="inline-error-actions">
        {onRetry && (
          <button className="inline-error-button" onClick={onRetry}>
            重试
          </button>
        )}
        {onDismiss && (
          <button className="inline-error-button" onClick={onDismiss}>
            ×
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Camera access error component with specific troubleshooting instructions
 */
export const CameraAccessError: React.FC<{
  onRetry: () => void;
  onDismiss?: () => void;
}> = ({ onRetry, onDismiss }) => {
  return (
    <ErrorMessage
      title="无法访问摄像头 / Camera Access Denied"
      message="系统需要访问摄像头才能正常工作。请检查以下事项："
      details={`
故障排除步骤 / Troubleshooting Steps:

1. 确保浏览器有摄像头访问权限
   Make sure the browser has camera access permission

2. 检查是否有其他应用正在使用摄像头
   Check if another application is using the camera

3. 尝试刷新页面并重新授权
   Try refreshing the page and re-authorizing

4. 确保摄像头已正确连接
   Ensure the camera is properly connected

5. 在浏览器设置中允许此网站访问摄像头
   Allow this site to access the camera in browser settings
      `}
      onRetry={onRetry}
      onDismiss={onDismiss}
      showDetails={true}
    />
  );
};

/**
 * Network error component with retry option
 */
export const NetworkError: React.FC<{
  onRetry: () => void;
  onDismiss?: () => void;
  details?: string;
}> = ({ onRetry, onDismiss, details }) => {
  return (
    <ErrorMessage
      title="网络连接失败 / Network Error"
      message="无法连接到服务器。请检查网络连接后重试。"
      details={details || '请确保设备已连接到网络，并且服务器正在运行。'}
      onRetry={onRetry}
      onDismiss={onDismiss}
      showDetails={!!details}
    />
  );
};

/**
 * Rendering error component
 */
export const RenderingError: React.FC<{
  onRetry: () => void;
  onGoBack: () => void;
  details?: string;
}> = ({ onRetry, onGoBack, details }) => {
  return (
    <ErrorMessage
      title="视频生成失败 / Rendering Failed"
      message="视频生成过程中出现错误。您可以重试或返回重新录制。"
      details={details}
      onRetry={onRetry}
      onGoBack={onGoBack}
      showDetails={!!details}
    />
  );
};
