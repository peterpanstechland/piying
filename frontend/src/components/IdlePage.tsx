import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './IdlePage.css';

interface IdlePageProps {
  videoElement?: HTMLVideoElement | null;
}

/**
 * IdlePage - Waiting interface displayed when no person is detected
 * Shows camera feed and waiting message
 */
export const IdlePage = ({ videoElement }: IdlePageProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render video feed to canvas
  useEffect(() => {
    if (!videoElement || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const renderFrame = () => {
      if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        // Mirror the video horizontally for natural interaction
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoElement]);

  return (
    <div className="idle-page">
      <canvas ref={canvasRef} className="video-feed" />
      <div className="idle-overlay">
        <div className="idle-message">
          <div className="idle-icon">👋</div>
          <h1>{t('idle.waiting')}</h1>
          <div className="idle-pulse"></div>
        </div>
      </div>
    </div>
  );
};
