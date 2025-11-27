import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './SegmentReviewPage.css';

interface SegmentReviewPageProps {
  segmentIndex: number;
  totalSegments: number;
  frameCount: number;
  videoElement?: HTMLVideoElement | null;
  onReRecord?: () => void;
  onContinue?: () => void;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadError?: string | null;
  cursorPosition?: { x: number; y: number } | null;
  hoverDurationMs?: number;
}

/**
 * SegmentReviewPage - Review interface after recording a segment
 * Provides gesture-based options to re-record current segment or continue to next
 */
export const SegmentReviewPage = ({
  segmentIndex,
  totalSegments,
  frameCount,
  videoElement,
  onReRecord,
  onContinue,
  isUploading = false,
  uploadProgress = 0,
  uploadError = null,
  cursorPosition,
  hoverDurationMs = 3000,
}: SegmentReviewPageProps) => {
  const { t } = useTranslation();

  const isLastSegment = segmentIndex + 1 === totalSegments;

  // Button refs for hover detection
  const rerecordButtonRef = useRef<HTMLButtonElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  
  // Hover state
  const [rerecordProgress, setRerecordProgress] = useState(0);
  const [continueProgress, setContinueProgress] = useState(0);
  const rerecordHoverStartRef = useRef<number | null>(null);
  const continueHoverStartRef = useRef<number | null>(null);
  const hasTriggeredRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Video ref to prevent repeated play() calls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoInitializedRef = useRef(false);

  // Check if cursor is over a button
  const isCursorOverElement = useCallback((elementRef: React.RefObject<HTMLElement>) => {
    if (!cursorPosition || !elementRef.current) return false;
    
    const rect = elementRef.current.getBoundingClientRect();
    const cursorX = cursorPosition.x * window.innerWidth;
    const cursorY = cursorPosition.y * window.innerHeight;
    
    return (
      cursorX >= rect.left &&
      cursorX <= rect.right &&
      cursorY >= rect.top &&
      cursorY <= rect.bottom
    );
  }, [cursorPosition]);

  // Handle hover progress for buttons
  useEffect(() => {
    if (isUploading || hasTriggeredRef.current) return;

    const updateHoverProgress = () => {
      if (hasTriggeredRef.current) return;

      const isOverRerecord = isCursorOverElement(rerecordButtonRef);
      const isOverContinue = isCursorOverElement(continueButtonRef);

      // Handle rerecord button
      if (isOverRerecord && !isOverContinue) {
        if (rerecordHoverStartRef.current === null) {
          rerecordHoverStartRef.current = Date.now();
        }
        const elapsed = Date.now() - rerecordHoverStartRef.current;
        const progress = Math.min(elapsed / hoverDurationMs, 1);
        setRerecordProgress(progress);
        setContinueProgress(0);
        continueHoverStartRef.current = null;

        if (progress >= 1 && onReRecord) {
          hasTriggeredRef.current = true;
          onReRecord();
          return;
        }
      } 
      // Handle continue button
      else if (isOverContinue && !isOverRerecord) {
        if (continueHoverStartRef.current === null) {
          continueHoverStartRef.current = Date.now();
        }
        const elapsed = Date.now() - continueHoverStartRef.current;
        const progress = Math.min(elapsed / hoverDurationMs, 1);
        setContinueProgress(progress);
        setRerecordProgress(0);
        rerecordHoverStartRef.current = null;

        if (progress >= 1 && onContinue) {
          hasTriggeredRef.current = true;
          onContinue();
          return;
        }
      } 
      // Not over any button
      else {
        rerecordHoverStartRef.current = null;
        continueHoverStartRef.current = null;
        setRerecordProgress(0);
        setContinueProgress(0);
      }

      animationFrameRef.current = requestAnimationFrame(updateHoverProgress);
    };

    animationFrameRef.current = requestAnimationFrame(updateHoverProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCursorOverElement, hoverDurationMs, onReRecord, onContinue, isUploading]);

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
    <div className="segment-review-page">
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

      {videoElement && (
        <video
          className="video-feed-background"
          ref={videoRef}
          autoPlay
          muted
          playsInline
        />
      )}

      <div className="review-overlay">
        <div className="review-header">
          <h1>{t('review.title')}</h1>
          <p className="segment-info">
            {t('review.segmentComplete', { 
              current: segmentIndex + 1, 
              total: totalSegments 
            })}
          </p>
        </div>

        <div className="review-content">
          <div className="review-stats">
            <div className="stat-item">
              <div className="stat-icon">✓</div>
              <div className="stat-label">{t('review.recorded')}</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{frameCount}</div>
              <div className="stat-label">{t('review.frames')}</div>
            </div>
          </div>

          {uploadError && (
            <div className="upload-error">
              <p className="error-message">❌ {uploadError}</p>
              <p className="error-hint">{t('review.uploadFailed')}</p>
            </div>
          )}

          {isUploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="progress-text">{t('review.uploading')} {uploadProgress}%</p>
            </div>
          )}

          <div className="review-actions">
            <button
              ref={rerecordButtonRef}
              className={`review-button rerecord-button ${rerecordProgress > 0 ? 'hovering' : ''}`}
              onClick={onReRecord}
              disabled={isUploading}
            >
              <div 
                className="button-progress"
                style={{ transform: `scaleX(${rerecordProgress})` }}
              />
              <span className="button-icon">↻</span>
              <span className="button-text">{t('review.rerecord')}</span>
              {rerecordProgress > 0 && (
                <span className="button-hint">
                  {Math.ceil((1 - rerecordProgress) * (hoverDurationMs / 1000))}s
                </span>
              )}
            </button>

            <button
              ref={continueButtonRef}
              className={`review-button continue-button ${continueProgress > 0 ? 'hovering' : ''}`}
              onClick={onContinue}
              disabled={isUploading}
            >
              <div 
                className="button-progress"
                style={{ transform: `scaleX(${continueProgress})` }}
              />
              <span className="button-text">
                {isLastSegment ? t('review.finish') : t('review.continue')}
              </span>
              <span className="button-icon">→</span>
              {continueProgress > 0 && (
                <span className="button-hint">
                  {Math.ceil((1 - continueProgress) * (hoverDurationMs / 1000))}s
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="review-footer">
          {!isLastSegment && (
            <p className="review-hint">
              {t('review.nextSegment', { next: segmentIndex + 2 })}
            </p>
          )}
          {isLastSegment && (
            <p className="review-hint">{t('review.allComplete')}</p>
          )}
        </div>
      </div>
    </div>
  );
};
