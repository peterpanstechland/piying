import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './SegmentGuidancePage.css';

interface SegmentGuidancePageProps {
  segmentIndex: number;
  totalSegments: number;
  videoElement?: HTMLVideoElement | null;
  onGuidanceComplete?: () => void;
}

/**
 * SegmentGuidancePage - Displays guidance for the current motion capture segment
 * Shows action description and example poses before recording begins
 */
export const SegmentGuidancePage = ({
  segmentIndex,
  totalSegments,
  videoElement,
  onGuidanceComplete,
}: SegmentGuidancePageProps) => {
  const { t } = useTranslation();

  // Auto-advance to countdown after showing guidance
  useEffect(() => {
    // Show guidance for 3 seconds before starting countdown
    const timer = setTimeout(() => {
      if (onGuidanceComplete) {
        onGuidanceComplete();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [onGuidanceComplete]);

  return (
    <div className="segment-guidance-page">
      {videoElement && (
        <video
          className="video-feed-background"
          ref={(el) => {
            if (el && videoElement && el.srcObject !== videoElement.srcObject) {
              el.srcObject = videoElement.srcObject;
              el.play().catch((err) => {
                // Ignore play interruption errors
                if (err.name !== 'AbortError') {
                  console.error('Video play error:', err);
                }
              });
            }
          }}
          autoPlay
          muted
          playsInline
        />
      )}

      <div className="guidance-overlay">
        <div className="guidance-header">
          <h1>{t('guidance.title')}</h1>
          <p className="segment-counter">
            {t('guidance.segment', { current: segmentIndex + 1, total: totalSegments })}
          </p>
        </div>

        <div className="guidance-content">
          <div className="guidance-icon">🎭</div>
          <h2 className="guidance-action">
            {t(`guidance.segment${segmentIndex + 1}.action`)}
          </h2>
          <p className="guidance-description">
            {t(`guidance.segment${segmentIndex + 1}.description`)}
          </p>
          
          <div className="guidance-tips">
            <p>{t('guidance.tips.position')}</p>
            <p>{t('guidance.tips.ready')}</p>
          </div>
        </div>

        <div className="guidance-footer">
          <p className="guidance-hint">{t('guidance.starting')}</p>
        </div>
      </div>
    </div>
  );
};
