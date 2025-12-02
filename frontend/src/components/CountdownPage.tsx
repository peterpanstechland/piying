import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './CountdownPage.css';

interface CountdownPageProps {
  videoElement?: HTMLVideoElement | null;
  onCountdownComplete?: () => void;
  countdownDuration?: number; // seconds, default 5
}

/**
 * CountdownPage - Displays a 5-second countdown before recording begins
 * Automatically triggers recording when countdown reaches zero
 */
export const CountdownPage = ({
  videoElement,
  onCountdownComplete,
  countdownDuration = 5,
}: CountdownPageProps) => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(countdownDuration);
  const completedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  // Store callback in ref to avoid dependency issues
  const onCountdownCompleteRef = useRef(onCountdownComplete);
  onCountdownCompleteRef.current = onCountdownComplete;

  // Single useEffect to handle countdown logic
  useEffect(() => {
    // Reset state
    setCountdown(countdownDuration);
    completedRef.current = false;
    
    // Clear any existing interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Start countdown interval
    intervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Clear interval
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          
          // Trigger callback using ref
          if (onCountdownCompleteRef.current && !completedRef.current) {
            completedRef.current = true;
            setTimeout(() => onCountdownCompleteRef.current?.(), 100);
          }
          return 0;
        }
        
        return prev - 1;
      });
    }, 1000);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [countdownDuration]); // Only depend on countdownDuration, not the callback

  // Video ref to prevent repeated play() calls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoInitializedRef = useRef(false);

  // Setup video only once
  useEffect(() => {
    if (videoRef.current && videoElement && !videoInitializedRef.current) {
      videoRef.current.srcObject = videoElement.srcObject;
      videoRef.current.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Video play error:', err);
        }
      });
      videoInitializedRef.current = true;
    }
  }, [videoElement]);

  return (
    <div className="countdown-page">
      {videoElement && (
        <video
          className="video-feed-background"
          ref={videoRef}
          autoPlay
          muted
          playsInline
        />
      )}

      <div className="countdown-overlay">
        <div className="countdown-content">
          <p className="countdown-label">{t('countdown.getReady')}</p>
          
          <div className={`countdown-number ${countdown === 0 ? 'go' : ''}`}>
            {countdown === 0 ? t('countdown.go') : countdown}
          </div>

          <div className="countdown-progress-ring">
            <svg width="300" height="300" viewBox="0 0 300 300">
              <circle
                cx="150"
                cy="150"
                r="140"
                fill="none"
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="8"
              />
              <circle
                cx="150"
                cy="150"
                r="140"
                fill="none"
                stroke="#ffd700"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 140}`}
                strokeDashoffset={`${2 * Math.PI * 140 * (countdown / countdownDuration)}`}
                transform="rotate(-90 150 150)"
                style={{
                  transition: 'stroke-dashoffset 1s linear',
                }}
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
