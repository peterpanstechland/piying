import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PoseLandmark } from '../services/camera-detection';
import { CharacterRenderer, PoseLandmarks } from '@renderer';
import { PoseProcessor, DEFAULT_CONFIG } from '@pose';
import './SegmentGuidancePage.css';

interface SegmentGuidancePageProps {
  segmentIndex: number;
  totalSegments: number;
  videoElement?: HTMLVideoElement | null;
  currentPose?: PoseLandmark[] | null;
  characterId?: string;
  onGuidanceComplete?: () => void;
  onBack?: () => void; // 返回回调
  inactivityShowBackSeconds?: number; // 多少秒后显示返回按钮（默认20秒）
  inactivityAutoBackSeconds?: number; // 多少秒后自动返回（默认40秒）
}

enum CalibrationStep {
  None = 0,
  LeftHand = 1,
  RightHand = 2,
  LeftFoot = 3,
  RightFoot = 4,
  Complete = 5
}

/**
 * SegmentGuidancePage - Displays guidance for the current motion capture segment
 * Shows action description and example poses before recording begins
 * Includes a detection box and calibration flow
 */
export const SegmentGuidancePage = ({
  segmentIndex,
  totalSegments,
  videoElement,
  currentPose,
  characterId,
  onGuidanceComplete,
  onBack,
  inactivityShowBackSeconds = 20,
  inactivityAutoBackSeconds = 40,
}: SegmentGuidancePageProps) => {
  const { t } = useTranslation();
  const [isInBox, setIsInBox] = useState(false);
  const [isStableInBox, setIsStableInBox] = useState(false); // Debounced state
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // Calibration State
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>(CalibrationStep.None);
  const [stepHoldStart, setStepHoldStart] = useState<number | null>(null);
  
  // 无操作返回状态
  const [inactivitySeconds, setInactivitySeconds] = useState(0);
  const [showBackButton, setShowBackButton] = useState(false);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const isReturningRef = useRef(false); // 防止重复调用 onBack
  
  // 手势悬停返回按钮状态
  const [backButtonHovered, setBackButtonHovered] = useState(false);
  const [backButtonProgress, setBackButtonProgress] = useState(0);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonHoverStartRef = useRef<number | null>(null);
  
  // Refs
  const characterCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CharacterRenderer | null>(null);
  const poseProcessorRef = useRef<PoseProcessor | null>(null);
  
  // Store callback in ref to avoid dependency issues
  const onGuidanceCompleteRef = useRef(onGuidanceComplete);
  onGuidanceCompleteRef.current = onGuidanceComplete;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Config: Detection Box Area (Normalized 0-1)
  const BOX_CONFIG = {
    x: 0.25, // Starts at 25% width
    y: 0.15, // Starts at 15% height
    width: 0.5, // 50% width
    height: 0.7, // 70% height
  };

  // Hysteresis buffer: make it easier to stay in than to get in
  const HYSTERESIS = 0.1; // 10% expansion when already active

  // 1. Detection Box Logic (Relaxed Thresholds)
  useEffect(() => {
    if (!currentPose) {
      setIsInBox(false);
      return;
    }

    // Key landmarks to check: Nose (0), Shoulders (11, 12)
    const nose = currentPose[0];
    const leftShoulder = currentPose[11];
    const rightShoulder = currentPose[12];
    
    // RELAXED THRESHOLD: 0.4 instead of 0.6 for better detection
    const isVisible = (p: PoseLandmark) => p.visibility > 0.4;

    if (nose && leftShoulder && rightShoulder && 
        isVisible(nose) && isVisible(leftShoulder) && isVisible(rightShoulder)) {
      
      // Calculate body center (approximate)
      const bodyX = (leftShoulder.x + rightShoulder.x) / 2;

      // Determine bounds based on current state (Hysteresis)
      const buffer = isStableInBox ? HYSTERESIS : 0;
      
      const minX = BOX_CONFIG.x - buffer;
      const maxX = BOX_CONFIG.x + BOX_CONFIG.width + buffer;
      const minY = BOX_CONFIG.y - buffer;
      const maxY = BOX_CONFIG.y + BOX_CONFIG.height + buffer;

      // Check if body center is within the box horizontal range
      // And nose is within vertical range (roughly)
      const inHorizontal = bodyX > minX && bodyX < maxX;
      const inVertical = nose.y > minY && nose.y < maxY;

      if (inHorizontal && inVertical) {
        setIsInBox(true);
      } else {
        setIsInBox(false);
      }
    } else {
      setIsInBox(false);
    }
  }, [currentPose, isStableInBox]); 

  // Stabilize the isInBox state (Grace Period)
  useEffect(() => {
    let timeout: number;
    if (isInBox) {
      setIsStableInBox(true);
    } else {
      // If user leaves, wait 500ms before accepting it
      timeout = window.setTimeout(() => {
        setIsStableInBox(false);
      }, 500);
    }
    return () => clearTimeout(timeout);
  }, [isInBox]);

  // 无操作返回检测：当用户有正确动作时重置计时器
  useEffect(() => {
    // 检测"正常动作"：在框内且正在进行校准或已完成校准
    const isActivelyInteracting = isStableInBox && (calibrationStep !== CalibrationStep.None || isCalibrated);
    
    if (isActivelyInteracting) {
      // 重置计时器
      lastActiveTimeRef.current = Date.now();
      setInactivitySeconds(0);
      setShowBackButton(false);
    }
  }, [isStableInBox, calibrationStep, isCalibrated]);

  // 无操作计时器
  useEffect(() => {
    const timer = setInterval(() => {
      // 如果已经在返回中，停止计时
      if (isReturningRef.current) return;
      
      const elapsed = Math.floor((Date.now() - lastActiveTimeRef.current) / 1000);
      setInactivitySeconds(elapsed);
      
      // 20秒后显示返回按钮
      if (elapsed >= inactivityShowBackSeconds && !showBackButton) {
        setShowBackButton(true);
        console.log('[SegmentGuidance] Showing back button after', elapsed, 'seconds of inactivity');
      }
      
      // 40秒后自动返回
      if (elapsed >= inactivityAutoBackSeconds && onBackRef.current && !isReturningRef.current) {
        console.log('[SegmentGuidance] Auto-returning after', elapsed, 'seconds of inactivity');
        isReturningRef.current = true; // 标记正在返回，防止重复调用
        onBackRef.current();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [inactivityShowBackSeconds, inactivityAutoBackSeconds, showBackButton]);

  // 手势悬停返回按钮检测
  useEffect(() => {
    if (!currentPose || !showBackButton || !backButtonRef.current || !onBack) return;
    
    const HOVER_DURATION = 3000; // 3秒触发
    
    // 获取手的位置（使用右手腕作为指针）
    const rightWrist = currentPose[16];
    const leftWrist = currentPose[15];
    
    // 选择可见度更高的手
    const hand = (rightWrist?.visibility || 0) > (leftWrist?.visibility || 0) ? rightWrist : leftWrist;
    
    if (!hand || hand.visibility < 0.5) {
      backButtonHoverStartRef.current = null;
      setBackButtonHovered(false);
      setBackButtonProgress(0);
      return;
    }

    // 将归一化坐标转换为屏幕坐标
    const screenX = (1 - hand.x) * window.innerWidth; // 镜像
    const screenY = hand.y * window.innerHeight;
    
    const backRect = backButtonRef.current.getBoundingClientRect();
    const isOverBackButton = 
      screenX >= backRect.left &&
      screenX <= backRect.right &&
      screenY >= backRect.top &&
      screenY <= backRect.bottom;

    if (isOverBackButton) {
      if (backButtonHoverStartRef.current === null) {
        backButtonHoverStartRef.current = Date.now();
      }
      const elapsed = Date.now() - backButtonHoverStartRef.current;
      const progress = Math.min(elapsed / HOVER_DURATION, 1);
      setBackButtonHovered(true);
      setBackButtonProgress(progress);
      
      if (progress >= 1) {
        console.log('[SegmentGuidance] Back button triggered via gesture');
        backButtonHoverStartRef.current = null;
        setBackButtonProgress(0);
        onBack();
      }
    } else {
      backButtonHoverStartRef.current = null;
      setBackButtonHovered(false);
      setBackButtonProgress(0);
    }
  }, [currentPose, showBackButton, onBack]);

  // 2. Calibration Logic Flow
  useEffect(() => {
    if (!currentPose || !isStableInBox || isCalibrated) {
      // If user leaves box during calibration, maybe reset step hold but keep step?
      if (!isStableInBox && !isCalibrated && calibrationStep !== CalibrationStep.None) {
        setStepHoldStart(null);
      }
      return;
    }

    // Start calibration sequence if not started
    if (calibrationStep === CalibrationStep.None) {
      setCalibrationStep(CalibrationStep.LeftHand);
      return;
    }

    const now = Date.now();
    let stepComplete = false;
    const isVisible = (idx: number) => currentPose[idx] && currentPose[idx].visibility > 0.5;

    // Logic for each step
    switch (calibrationStep) {
      case CalibrationStep.LeftHand:
        // Left Wrist (15) higher than Left Shoulder (11) (smaller y)
        if (isVisible(15) && isVisible(11) && currentPose[15].y < currentPose[11].y - 0.15) {
          stepComplete = true;
        }
        break;
      case CalibrationStep.RightHand:
        // Right Wrist (16) higher than Right Shoulder (12)
        if (isVisible(16) && isVisible(12) && currentPose[16].y < currentPose[12].y - 0.15) {
          stepComplete = true;
        }
        break;
      case CalibrationStep.LeftFoot:
        // Left Ankle (27) higher than Right Ankle (28) (smaller y)
        // Checking difference in Y coordinates. 
        if (isVisible(27) && isVisible(28) && currentPose[27].y < currentPose[28].y - 0.05) {
          stepComplete = true;
        }
        break;
      case CalibrationStep.RightFoot:
        // Right Ankle (28) higher than Left Ankle (27)
        if (isVisible(28) && isVisible(27) && currentPose[28].y < currentPose[27].y - 0.05) {
          stepComplete = true;
        }
        break;
    }

    if (stepComplete) {
      if (!stepHoldStart) {
        setStepHoldStart(now);
      } else if (now - stepHoldStart > 800) { // Hold for 0.8s
        const nextStep = calibrationStep + 1;
        setCalibrationStep(nextStep);
        setStepHoldStart(null);
        
        if (nextStep === CalibrationStep.Complete) {
          setIsCalibrated(true);
          console.log('[SegmentGuidance] Calibration Complete via Step Flow');
        }
      }
    } else {
      setStepHoldStart(null); // Reset hold if pose lost
    }

  }, [currentPose, isStableInBox, isCalibrated, calibrationStep, stepHoldStart]);

  // 初始化皮影人物渲染器和姿态处理器
  useEffect(() => {
    if (!characterCanvasRef.current || !characterId) return;

    const initRenderer = async () => {
      try {
        const renderer = new CharacterRenderer();
        const canvasWidth = 640;
        const canvasHeight = 480;
        
        await renderer.init(characterCanvasRef.current!, canvasWidth, canvasHeight);
        
        const configUrl = `/api/admin/characters/${characterId}/config.json`;
        await renderer.loadCharacter(configUrl);
        
        renderer.resetPose();
        rendererRef.current = renderer;
        
        const processor = new PoseProcessor(DEFAULT_CONFIG);
        poseProcessorRef.current = processor;
      } catch (err) {
        console.error('[SegmentGuidance] Failed to init character renderer:', err);
      }
    };

    initRenderer();

    return () => {
      rendererRef.current?.destroy();
      poseProcessorRef.current = null;
    };
  }, [characterId]);

  // 处理姿态检测 - 更新皮影人物
  const handlePoseUpdate = useCallback((pose: PoseLandmark[]) => {
    const renderer = rendererRef.current;
    const processor = poseProcessorRef.current;
    
    if (!renderer || !processor) return;
    
    // 转换为 PoseLandmarks 格式并镜像
    const landmarks: PoseLandmarks = pose.map(lm => ({
      x: 1 - lm.x, // 镜像 X 坐标
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility,
    }));
    
    const processed = processor.process(landmarks);
    renderer.updatePoseFromProcessed(processed);
    
    // Removed old auto-calibration logic
  }, []);

  // 当有姿态数据时，更新皮影人物
  useEffect(() => {
    if (currentPose) {
      handlePoseUpdate(currentPose);
    }
  }, [currentPose, handlePoseUpdate]);


  // Handle countdown logic - 站在框内且校准完成后开始倒计时
  useEffect(() => {
    let timer: number;

    // 只有在站在框内且校准完成后才开始倒计时
    if (isStableInBox && isCalibrated) {
      if (countdown === null) {
        console.log('[SegmentGuidance] Starting countdown from 3');
        setCountdown(3); // Start 3s countdown
      } else if (countdown > 0) {
        timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
      } else if (countdown === 0) {
        // Complete!
        console.log('[SegmentGuidance] Countdown complete, calling onGuidanceComplete');
        if (onGuidanceCompleteRef.current) {
          onGuidanceCompleteRef.current();
        }
      }
    } else {
      // Reset when user leaves box or not calibrated
      setCountdown(null);
    }

    return () => clearTimeout(timer);
  }, [isStableInBox, isCalibrated, countdown]);

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

  // Helper for Calibration Instruction Text
  const getCalibrationText = () => {
    if (!isStableInBox) return t('guidance.tips.position'); // "Please stand in center"
    
    if (stepHoldStart) return t('guidance.calibration.holdStill'); // "Hold pose..."
    
    switch (calibrationStep) {
      case CalibrationStep.LeftHand: return t('guidance.calibration.raiseLeftHand');
      case CalibrationStep.RightHand: return t('guidance.calibration.raiseRightHand');
      case CalibrationStep.LeftFoot: return t('guidance.calibration.liftLeftFoot');
      case CalibrationStep.RightFoot: return t('guidance.calibration.liftRightFoot');
      case CalibrationStep.Complete: return t('guidance.calibration.complete');
      default: return t('guidance.calibration.step', { current: 1, total: 4 });
    }
  };

  return (
    <div className="segment-guidance-page">
      {/* 皮影人物 Canvas - 透明背景 */}
      {characterId && (
        <canvas 
          ref={characterCanvasRef} 
          className="character-canvas-layer"
        />
      )}
      
      {/* 摄像头小窗口 - 实时预览 */}
      {videoElement && (
        <div className="camera-preview-window">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
          />
          <div className="camera-preview-label">实时画面</div>
        </div>
      )}

      <div className="guidance-overlay">
        {/* 标题 - 显示校准状态或标题 */}
        <div className="guidance-header">
          {!isCalibrated ? (
              <div className="calibration-status">
                <div className="calibration-text">
                  {getCalibrationText()}
                </div>
                {/* Visual Progress Bar or Checkmarks */}
                {isStableInBox && (
                   <div className="calibration-progress-bar">
                     <div 
                       className="calibration-progress-fill" 
                       style={{ width: `${(Math.max(0, calibrationStep - 1) / 4) * 100}%` }} 
                     />
                   </div>
                )}
                {!isStableInBox && (
                  <div className="calibration-hint">
                    {t('guidance.tips.position')}
                  </div>
                )}
              </div>
          ) : (
            <>
              <h1>{t('guidance.title')}</h1>
              <p className="segment-counter">
                {t('guidance.segment', { current: segmentIndex + 1, total: totalSegments })}
              </p>
            </>
          )}
        </div>

        {/* Detection Box Visualization */}
        <div 
          className={`detection-box ${isStableInBox ? 'active' : ''} ${isCalibrated ? 'calibrated' : ''}`}
          style={{
            left: `${BOX_CONFIG.x * 100}%`,
            top: `${BOX_CONFIG.y * 100}%`,
            width: `${BOX_CONFIG.width * 100}%`,
            height: `${BOX_CONFIG.height * 100}%`,
          }}
        >
          {/* Corner Decors */}
          <div className="box-corner top-left" />
          <div className="box-corner top-right" />
          <div className="box-corner bottom-left" />
          <div className="box-corner bottom-right" />
          
          {/* Countdown or Prompt */}
          <div className="box-status">
            {isStableInBox && isCalibrated ? (
              <div key={countdown} className="countdown-number">{countdown}</div>
            ) : isStableInBox && !isCalibrated ? (
              <div className="calibrating-prompt">
                {stepHoldStart ? '...' : ''}
              </div>
            ) : (
              <div className="stand-here-prompt">请站在这里</div>
            )}
          </div>
        </div>

        <div className="guidance-content">
          <h2 className="guidance-action">
            {t(`guidance.segment${segmentIndex + 1}.action`)}
          </h2>
          <p className="guidance-description">
            {t(`guidance.segment${segmentIndex + 1}.description`)}
          </p>
        </div>

        {/* 返回按钮 - 无操作一段时间后显示 */}
        {showBackButton && onBack && (
          <button 
            ref={backButtonRef}
            className={`guidance-back-button ${backButtonHovered ? 'hovering' : ''}`}
            onClick={onBack}
            aria-label={t('common.back', '返回')}
          >
            <div 
              className="back-button-progress"
              style={{ transform: `scaleX(${backButtonProgress})` }}
            />
            <span className="back-icon">←</span>
            <span className="back-text">{t('common.back', '返回')}</span>
            {backButtonHovered && backButtonProgress > 0 && (
              <span className="back-button-hint">
                {Math.ceil((1 - backButtonProgress) * 3)}s
              </span>
            )}
          </button>
        )}

        {/* 自动返回倒计时提示 */}
        {showBackButton && inactivitySeconds >= inactivityShowBackSeconds && (
          <div className="auto-return-hint">
            {inactivityAutoBackSeconds - inactivitySeconds}s 后自动返回
          </div>
        )}
      </div>
    </div>
  );
};
