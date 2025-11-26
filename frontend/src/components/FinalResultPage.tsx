import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import './FinalResultPage.css';

interface FinalResultPageProps {
  videoUrl: string;
  onReset: () => void;
  inactivityTimeoutSeconds?: number;
}

/**
 * FinalResultPage - Final result display with video player and QR code
 * Automatically resets after 30 seconds of inactivity
 */
export const FinalResultPage = ({
  videoUrl,
  onReset,
  inactivityTimeoutSeconds = 30,
}: FinalResultPageProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timeRemaining, setTimeRemaining] = useState(inactivityTimeoutSeconds);
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-reset timer
  useEffect(() => {
    let hasReset = false;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1 && !hasReset) {
          hasReset = true;
          onReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onReset]);

  // Auto-play video when loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      video.play().catch((error) => {
        console.error('Error auto-playing video:', error);
      });
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  return (
    <div className="final-result-page">
      <div className="result-header">
        <h1 className="result-title">{t('result.ready')}</h1>
        <div className="reset-timer">
          {t('result.autoReset', { seconds: timeRemaining })}
        </div>
      </div>

      <div className="result-content">
        <div className="video-container">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            loop
            className="result-video"
            playsInline
          />
          {!isPlaying && (
            <div className="play-overlay">
              <div className="play-button">▶</div>
            </div>
          )}
        </div>

        <div className="qr-container">
          <div className="qr-wrapper">
            <QRCodeSVG
              value={videoUrl}
              size={256}
              level="H"
              includeMargin={true}
              className="qr-code"
            />
          </div>
          <p className="qr-instruction">{t('result.scanQR')}</p>
          <p className="qr-url">{videoUrl}</p>
        </div>
      </div>
    </div>
  );
};
