import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './IdlePage.css';

interface IdlePageProps {
  videoElement?: HTMLVideoElement | null;
  /** 是否检测到人 */
  personDetected?: boolean;
  /** 倒计时剩余秒数 */
  countdownSeconds?: number;
  /** 总倒计时时间 */
  totalCountdownSeconds?: number;
}

/**
 * IdlePage - Waiting interface displayed when no person is detected
 * Shows camera feed and waiting message, with countdown when person detected
 */
export const IdlePage = ({ 
  videoElement, 
  personDetected = false,
  countdownSeconds = 0,
  totalCountdownSeconds = 7
}: IdlePageProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 计算进度百分比
  const progress = totalCountdownSeconds > 0 
    ? ((totalCountdownSeconds - countdownSeconds) / totalCountdownSeconds) * 100 
    : 0;

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
    <div className={`idle-page ${personDetected ? 'person-detected' : ''}`}>
      <canvas ref={canvasRef} className="video-feed" />
      <div className="idle-overlay">
        {!personDetected ? (
          // 等待状态 - 显示招手图标
          <div className="idle-message">
            <div className="idle-icon">👋</div>
            <h1>{t('idle.waiting')}</h1>
            <div className="idle-pulse"></div>
          </div>
        ) : (
          // 检测到人 - 显示倒计时
          <div className="idle-message detected">
            <div className="idle-icon detected-icon">🎭</div>
            <h1>{t('idle.enteringStage', '即将登上舞台')}</h1>
            <div className="countdown-container">
              <div className="countdown-ring" style={{ position: 'relative', width: '160px', height: '160px' }}>
                <svg viewBox="0 0 100 100">
                  <circle 
                    className="countdown-ring-bg" 
                    cx="50" cy="50" r="44" 
                  />
                  <circle 
                    className="countdown-ring-progress" 
                    cx="50" cy="50" r="44"
                    transform="rotate(-90 50 50)"
                    style={{ 
                      strokeDasharray: `${2 * Math.PI * 44}`,
                      strokeDashoffset: `${2 * Math.PI * 44 * (1 - progress / 100)}`
                    }}
                  />
                  <text
                    x="50"
                    y="55" /* 稍微再下移以适应更大字体 */
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#d4af37"
                    className="countdown-number-svg"
                    style={{
                      fontSize: '56px',
                      fontFamily: 'Arial, sans-serif',
                      fontWeight: 500,
                      filter: 'drop-shadow(0 0 2px rgba(212, 175, 55, 0.4))'
                    }}
                  >
                    {countdownSeconds}
                  </text>
                </svg>
              </div>
              <p className="countdown-hint">{t('idle.getReady', '请做好准备')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
