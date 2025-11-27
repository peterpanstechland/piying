import { useEffect, useState, useRef, useCallback } from 'react';
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
  
  // Use refs to avoid re-creating the polling effect
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const apiClientRef = useRef(apiClient);
  const completedRef = useRef(false);
  
  // Update refs when props change
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    apiClientRef.current = apiClient;
  }, [onComplete, onError, apiClient]);

  // Animated dots for loading indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Status polling with 2-second intervals
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let isActive = true;
    
    // Reset completed flag when sessionId changes
    completedRef.current = false;

    const pollStatus = async () => {
      // Don't poll if already completed or component unmounted
      if (!isActive || completedRef.current) return;

      try {
        const response = await apiClientRef.current.getSessionStatus(sessionId);
        console.log('Poll status response:', response);

        // Check again after async call
        if (!isActive || completedRef.current) return;

        if (response.status === 'done') {
          // Mark as completed to prevent further polling
          completedRef.current = true;
          
          // Clear interval immediately
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          
          console.log('Status is done, calling onComplete');
          const videoUrl = apiClientRef.current.getVideoUrl(sessionId);
          console.log('Video URL:', videoUrl);
          onCompleteRef.current(videoUrl);
        } else if (response.status === 'failed') {
          // Mark as completed to prevent further polling
          completedRef.current = true;
          
          // Clear interval immediately
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          
          console.log('Status is failed, calling onError');
          onErrorRef.current(t('errors.renderFailed'));
        } else {
          console.log('Status is:', response.status, '- continuing to poll');
        }
      } catch (error) {
        if (isActive && !completedRef.current) {
          console.error('Error polling status:', error);
          // Continue polling on error - don't fail immediately
        }
      }
    };

    // Initial poll after a short delay
    const initialTimeout = setTimeout(pollStatus, 500);

    // Set up polling interval (2 seconds)
    pollInterval = setInterval(pollStatus, 2000);

    return () => {
      console.log('RenderWaitPage cleanup - stopping polling');
      isActive = false;
      clearTimeout(initialTimeout);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [sessionId, t]); // Only depend on sessionId and t

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
