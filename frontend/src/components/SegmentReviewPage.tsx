import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterRenderer } from '@renderer';
import { apiClient } from '../services/api-client';
import './SegmentReviewPage.css';

interface SegmentReviewPageProps {
  segmentIndex: number;
  totalSegments: number;
  frameCount: number;
  videoElement?: HTMLVideoElement | null;
  onReRecord?: () => void;
  onContinue?: () => void;
  onTimeout?: () => void; // 超时返回首页回调
  isUploading?: boolean;
  uploadProgress?: number;
  uploadError?: string | null;
  cursorPosition?: { x: number; y: number } | null;
  hoverDurationMs?: number;
  characterId?: string;
  inactivityShowCountdownSeconds?: number; // 多少秒后显示倒计时（默认10秒）
  inactivityAutoBackSeconds?: number; // 多少秒后自动返回（默认30秒）
}

// Walk cycle poses (copied from CharacterPreview)
const PRESET_POSES = {
  walk1: {
    pose: {
      'left-arm': 0.4,
      'right-arm': -0.3,
      'left-hand': 0,
      'right-hand': 0,
      'left-thigh': -Math.PI / 10,
      'right-thigh': Math.PI / 10,
      'left-foot': -Math.PI / 8,
      'right-foot': Math.PI / 8,
    }
  },
  walk2: {
    pose: {
      'left-arm': -0.3,
      'right-arm': 0.4,
      'left-hand': 0,
      'right-hand': 0,
      'left-thigh': Math.PI / 10,
      'right-thigh': -Math.PI / 10,
      'left-foot': Math.PI / 8,
      'right-foot': -Math.PI / 8,
    }
  }
};

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
  onTimeout,
  isUploading = false,
  uploadProgress = 0,
  uploadError = null,
  cursorPosition,
  hoverDurationMs = 3000,
  characterId,
  inactivityShowCountdownSeconds = 10,
  inactivityAutoBackSeconds = 30,
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

  // 无操作自动返回状态
  const [inactivitySeconds, setInactivitySeconds] = useState(0);
  const [showCountdown, setShowCountdown] = useState(false);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const isReturningRef = useRef(false); // 防止重复调用
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  // Video ref to prevent repeated play() calls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoInitializedRef = useRef(false);

  // Character Renderer refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CharacterRenderer | null>(null);
  const walkIntervalRef = useRef<number | null>(null);
  const [rendererError, setRendererError] = useState(false);

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

  // 无操作计时器 - 页面级别的自动返回
  useEffect(() => {
    if (isUploading) return; // 上传中不计时
    
    const timer = setInterval(() => {
      // 如果已经在返回中，停止计时
      if (isReturningRef.current || hasTriggeredRef.current) return;
      
      const elapsed = Math.floor((Date.now() - lastInteractionTimeRef.current) / 1000);
      setInactivitySeconds(elapsed);
      
      // 10秒后显示倒计时
      if (elapsed >= inactivityShowCountdownSeconds && !showCountdown) {
        setShowCountdown(true);
        console.log('[SegmentReview] Showing countdown after', elapsed, 'seconds of inactivity');
      }
      
      // 30秒后自动返回
      if (elapsed >= inactivityAutoBackSeconds && onTimeoutRef.current && !isReturningRef.current) {
        console.log('[SegmentReview] Auto-returning to IDLE after', elapsed, 'seconds of inactivity');
        isReturningRef.current = true; // 标记正在返回，防止重复调用
        onTimeoutRef.current();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [inactivityShowCountdownSeconds, inactivityAutoBackSeconds, showCountdown, isUploading]);

  // 当用户悬停在按钮上时重置无操作计时器
  useEffect(() => {
    if (rerecordProgress > 0 || continueProgress > 0) {
      // 用户正在交互，重置计时器
      lastInteractionTimeRef.current = Date.now();
      setInactivitySeconds(0);
      setShowCountdown(false);
    }
  }, [rerecordProgress, continueProgress]);

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

  // Setup Character Renderer for Walk Cycle
  useEffect(() => {
    if (!canvasRef.current || !characterId) return;

    let isMounted = true;
    setRendererError(false);
    
    const initRenderer = async () => {
      try {
        if (rendererRef.current) {
          await rendererRef.current.destroy();
        }

        const renderer = new CharacterRenderer();
        rendererRef.current = renderer;

        // Initialize with smaller dimensions suitable for the review box
        await renderer.init(canvasRef.current!, 300, 400, { 
          backgroundAlpha: 0,
          compositionMode: 'chromakey' // Use single view for preview
        });

        if (!isMounted) return;

        const configUrl = apiClient.getCharacterConfigUrl(characterId);
        await renderer.loadCharacter(configUrl);

        if (!isMounted) return;

        // Start walk cycle
        let step = 0;
        const animate = () => {
          if (!rendererRef.current) return;
          const pose = step % 2 === 0 ? PRESET_POSES.walk1.pose : PRESET_POSES.walk2.pose;
          rendererRef.current.animateToPose(pose, 400);
          step++;
        };

        animate();
        walkIntervalRef.current = window.setInterval(animate, 500);

      } catch (error) {
        console.error('Failed to initialize character preview:', error);
        if (isMounted) {
          setRendererError(true);
        }
      }
    };

    initRenderer();

    return () => {
      isMounted = false;
      if (walkIntervalRef.current) {
        clearInterval(walkIntervalRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.destroy().catch(console.error);
        rendererRef.current = null;
      }
    };
  }, [characterId]);

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
          {/* Action Buttons moved to top */}
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

          {/* Stats replaced with Walking Puppet Animation */}
          <div className="review-stats walking-puppet-container">
             {characterId && !rendererError ? (
               <canvas 
                 ref={canvasRef} 
                 className="walking-puppet-canvas"
                 width={300}
                 height={400}
               />
             ) : (
               <img 
                 src="/images/monster.webp" 
                 alt="Walking Shadow Puppet" 
                 className="walking-puppet-image" 
               />
             )}
             <div className="puppet-label">{t('review.recorded')} {frameCount} {t('review.frames')}</div>
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

          {/* 自动返回倒计时提示 - 10秒后显示 */}
          {showCountdown && onTimeout && !isUploading && (
            <div className="auto-return-countdown">
              {inactivityAutoBackSeconds - inactivitySeconds}s 后自动返回首页
            </div>
          )}
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
