import { useEffect, useState } from 'react';
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

  useEffect(() => {
    // Update countdown every second
    const intervalId = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          // Trigger recording start when countdown reaches 0
          if (onCountdownComplete) {
            setTimeout(onCountdownComplete, 100); // Small delay for smooth transition
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [onCountdownComplete]);

  return (
    <div className="countdown-page">
      {videoElement && (
        <video
          className="video-feed-background"
          ref={(el) => {
            if (el && videoElement) {
              el.srcObject = videoElement.srcObject;
              el.play();
            }
          }}
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
