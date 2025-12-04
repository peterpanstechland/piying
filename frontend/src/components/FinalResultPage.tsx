import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import './FinalResultPage.css';

interface FinalResultPageProps {
  videoUrl: string;
  onReset: () => void;
  inactivityTimeoutSeconds?: number;
  cursorPosition?: { x: number; y: number } | null;
  hoverDurationMs?: number;
}

/**
 * FinalResultPage - Final result display with video player and QR code
 * Includes gesture-based back button with hover selection
 * Automatically resets after 30 seconds of inactivity
 */
export const FinalResultPage = ({
  videoUrl,
  onReset,
  inactivityTimeoutSeconds = 30,
  cursorPosition,
  hoverDurationMs = 3000,
}: FinalResultPageProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const backButtonRef = useRef<HTMLDivElement>(null);
  const [timeRemaining, setTimeRemaining] = useState(inactivityTimeoutSeconds);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverProgress, setHoverProgress] = useState(0);
  const hoverStartTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasTriggeredRef = useRef(false);

  // Check if cursor is over the back button
  const isCursorOverButton = useCallback(() => {
    if (!cursorPosition || !backButtonRef.current) return false;
    
    const rect = backButtonRef.current.getBoundingClientRect();
    const cursorX = cursorPosition.x * window.innerWidth;
    const cursorY = cursorPosition.y * window.innerHeight;
    
    return (
      cursorX >= rect.left &&
      cursorX <= rect.right &&
      cursorY >= rect.top &&
      cursorY <= rect.bottom
    );
  }, [cursorPosition]);

  // Handle hover progress for back button
  useEffect(() => {
    const updateHoverProgress = () => {
      const isOver = isCursorOverButton();
      
      if (isOver && !hasTriggeredRef.current) {
        if (hoverStartTimeRef.current === null) {
          hoverStartTimeRef.current = Date.now();
        }
        
        const elapsed = Date.now() - hoverStartTimeRef.current;
        const progress = Math.min(elapsed / hoverDurationMs, 1);
        setHoverProgress(progress);
        
        if (progress >= 1) {
          hasTriggeredRef.current = true;
          onReset();
          return;
        }
      } else {
        hoverStartTimeRef.current = null;
        setHoverProgress(0);
      }
      
      animationFrameRef.current = requestAnimationFrame(updateHoverProgress);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateHoverProgress);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCursorOverButton, hoverDurationMs, onReset]);

  // Auto-reset timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Trigger reset when timer reaches 0
  useEffect(() => {
    if (timeRemaining === 0) {
      onReset();
    }
  }, [timeRemaining, onReset]);

  // Auto-play video when loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      // Try to play with sound first
      video.muted = false;
      video.play().catch(() => {
        // If autoplay with sound fails, try muted (browser policy)
        video.muted = true;
        video.play().catch(() => {
          // Silent fail - user can click to play
        });
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
      {/* Gesture cursor indicator */}
      {cursorPosition && (
        <div
          className="gesture-cursor"
          style={{
            left: `${cursorPosition.x * 100}%`,
            top: `${cursorPosition.y * 100}%`,
          }}
        />
      )}

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
            muted={false}
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

      {/* Back button with hover progress - moved below content */}
      <div
        ref={backButtonRef}
        className={`back-button ${hoverProgress > 0 ? 'hovering' : ''}`}
      >
        <div
          className="back-button-progress"
          style={{
            transform: `scaleX(${hoverProgress})`,
          }}
        />
        <span className="back-button-icon">←</span>
        <span className="back-button-text">{t('common.back', '返回')}</span>
        {hoverProgress > 0 && (
          <span className="back-button-hint">
            {Math.ceil((1 - hoverProgress) * (hoverDurationMs / 1000))}s
          </span>
        )}
      </div>
    </div>
  );
};
