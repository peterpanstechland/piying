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
}

/**
 * SegmentReviewPage - Review interface after recording a segment
 * Provides options to re-record current segment or continue to next
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
}: SegmentReviewPageProps) => {
  const { t } = useTranslation();

  const isLastSegment = segmentIndex + 1 === totalSegments;

  return (
    <div className="segment-review-page">
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
              className="review-button rerecord-button"
              onClick={onReRecord}
              disabled={isUploading}
            >
              <span className="button-icon">↻</span>
              <span className="button-text">{t('review.rerecord')}</span>
            </button>

            <button
              className="review-button continue-button"
              onClick={onContinue}
              disabled={isUploading}
            >
              <span className="button-text">
                {isLastSegment ? t('review.finish') : t('review.continue')}
              </span>
              <span className="button-icon">→</span>
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
