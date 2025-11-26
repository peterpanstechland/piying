import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './RenderWaitPage.css';

interface RenderWaitPageProps {
  sessionId: string;
  onComplete: (videoUrl: string) => void;
  onError: (error: string) => void;
  apiClient: {
    getSessionStatus: (sessionId: string) => Promise<{
      status: string;
      output_path?: string;
    }>;
    getVideoUrl: (sessionId: string) => string;
  };
}

/**
 * RenderWaitPage - Processing interface with status polling
 * Polls backend every 2 seconds until video is ready
 */
export const RenderWaitPage = ({
  sessionId,
  onComplete,
  onError,
  apiClient,
}: RenderWaitPageProps) => {
  const { t } = useTranslation();
  const [dots, setDots] = useState('');

  // Animated dots for loading indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Status polling with 2-second intervals
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    let isActive = true;

    const pollStatus = async () => {
      if (!isActive) return;

      try {
        const status = await apiClient.getSessionStatus(sessionId);

        if (!isActive) return;

        if (status.status === 'done') {
          const videoUrl = apiClient.getVideoUrl(sessionId);
          onComplete(videoUrl);
        } else if (status.status === 'failed') {
          onError(t('errors.renderFailed'));
        }
        // Continue polling if status is 'processing' or 'pending'
      } catch (error) {
        if (isActive) {
          console.error('Error polling status:', error);
          // Continue polling on error - don't fail immediately
        }
      }
    };

    // Initial poll
    pollStatus();

    // Set up polling interval (2 seconds)
    pollInterval = setInterval(pollStatus, 2000);

    return () => {
      isActive = false;
      clearInterval(pollInterval);
    };
  }, [sessionId, apiClient, onComplete, onError, t]);

  return (
    <div className="render-wait-page">
      <div className="render-wait-content">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <h1 className="processing-message">
          {t('result.processing')}
          <span className="loading-dots">{dots}</span>
        </h1>
        <p className="processing-hint">{t('result.processingHint')}</p>
      </div>
    </div>
  );
};
