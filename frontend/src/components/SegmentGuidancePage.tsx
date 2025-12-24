import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PoseLandmark } from '../services/camera-detection';
import { CharacterRenderer, type PoseLandmarks } from '@shared/pixi';
import { PoseProcessor, DEFAULT_CONFIG } from '@pose';
import './SegmentGuidancePage.css';

export interface SegmentGuidancePageProps {
  segmentIndex: number;
  totalSegments: number;
  videoElement?: HTMLVideoElement | null;
  currentPose?: PoseLandmark[] | null;
  characterId?: string;
  onGuidanceComplete?: () => void;
  onBack?: () => void;
  inactivityShowBackSeconds?: number;
  inactivityAutoBackSeconds?: number;
}

// 4个校准动作定义
type CalibrationAction = 'raiseLeftHand' | 'raiseRightHand' | 'liftLeftFoot' | 'liftRightFoot';

const CALIBRATION_ACTIONS: CalibrationAction[] = [
  'raiseLeftHand',
  'raiseRightHand', 
  'liftLeftFoot',
  'liftRightFoot'
];

// 每个动作需要保持的帧数
const HOLD_FRAMES_REQUIRED = 15;

/**
 * SegmentGuidancePage - Displays guidance for the current motion capture segment
 * Shows action description and example poses before recording begins
 * NOW: Includes a detection box that users must step into to start
 * UPDATED: Uses 4-action calibration flow
 */
export const SegmentGuidancePage = ({
  segmentIndex,
  totalSegments,
  videoElement,
  currentPose,
  characterId,
  onGuidanceComplete,
  onBack,
  inactivityShowBackSeconds = 15,
  inactivityAutoBackSeconds = 30,
}: SegmentGuidancePageProps) => {
  const { t } = useTranslation();
  const [isInBox, setIsInBox] = useState(false);
  const [isStableInBox, setIsStableInBox] = useState(false); // Debounced state
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // 无操作自动返回状态
  const [inactivitySeconds, setInactivitySeconds] = useState(0);
  const [showInactivityCountdown, setShowInactivityCountdown] = useState(false);
  const lastPoseDetectedTimeRef = useRef<number>(Date.now());
  const isReturningRef = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  
  // 4个动作校准相关状态
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [actionHoldProgress, setActionHoldProgress] = useState(0);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const actionHoldCountRef = useRef(0);
  
  // 皮影人物渲染相关
  const characterCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CharacterRenderer | null>(null);
  const poseProcessorRef = useRef<PoseProcessor | null>(null);
  
  // 检测动作是否完成的函数
  const checkActionComplete = useCallback((action: CalibrationAction, pose: PoseLandmark[]): boolean => {
    // MediaPipe 关键点索引
    // 11: 左肩, 12: 右肩, 13: 左肘, 14: 右肘, 15: 左腕, 16: 右腕
    // 23: 左髋, 24: 右髋, 25: 左膝, 26: 右膝, 27: 左踝, 28: 右踝
    
    const leftShoulder = pose[11];
    const rightShoulder = pose[12];
    const leftWrist = pose[15];
    const rightWrist = pose[16];
    const leftKnee = pose[25];
    const rightKnee = pose[26];
    const leftAnkle = pose[27];
    const rightAnkle = pose[28];
    
    const isVisible = (p: PoseLandmark) => p && p.visibility > 0.5;
    
    switch (action) {
      case 'raiseLeftHand':
        // 左手腕高于左肩
        if (isVisible(leftWrist) && isVisible(leftShoulder)) {
          return leftWrist.y < leftShoulder.y - 0.1;
        }
        return false;
        
      case 'raiseRightHand':
        // 右手腕高于右肩
        if (isVisible(rightWrist) && isVisible(rightShoulder)) {
          return rightWrist.y < rightShoulder.y - 0.1;
        }
        return false;
        
      case 'liftLeftFoot':
        // 左踝高于正常站立位置（左膝和右踝之间的差异）
        if (isVisible(leftAnkle) && isVisible(rightAnkle) && isVisible(leftKnee)) {
          // 左踝明显高于右踝，且左膝弯曲
          return leftAnkle.y < rightAnkle.y - 0.08;
        }
        return false;
        
      case 'liftRightFoot':
        // 右踝高于正常站立位置
        if (isVisible(rightAnkle) && isVisible(leftAnkle) && isVisible(rightKnee)) {
          // 右踝明显高于左踝
          return rightAnkle.y < leftAnkle.y - 0.08;
        }
        return false;
        
      default:
        return false;
    }
  }, []);
  
  // Config: Detection Box Area (Normalized 0-1)
  const BOX_CONFIG = {
    x: 0.25, // Starts at 25% width
    y: 0.15, // Starts at 15% height
    width: 0.5, // 50% width
    height: 0.7, // 70% height
  };

  // Hysteresis buffer: make it easier to stay in than to get in
  const HYSTERESIS = 0.1; // 10% expansion when already active

  // Check if pose is inside the box
  useEffect(() => {
    if (!currentPose) {
      console.log('[SegmentGuidance] No pose data received');
      setIsInBox(false);
      return;
    }

    // Key landmarks to check: Nose (0), Shoulders (11, 12), Hips (23, 24)
    // We check if the center of the body is roughly within bounds
    const nose = currentPose[0];
    const leftShoulder = currentPose[11];
    const rightShoulder = currentPose[12];
    
    // Ensure landmarks are visible enough
    const isVisible = (p: PoseLandmark) => p.visibility > 0.6;

    console.log('[SegmentGuidance] Pose check:', {
      hasNose: !!nose,
      hasLeftShoulder: !!leftShoulder,
      hasRightShoulder: !!rightShoulder,
      noseVisibility: nose?.visibility,
      leftShoulderVisibility: leftShoulder?.visibility,
      rightShoulderVisibility: rightShoulder?.visibility,
    });

    if (nose && leftShoulder && rightShoulder && 
        isVisible(nose) && isVisible(leftShoulder) && isVisible(rightShoulder)) {
      
      // Calculate body center (approximate)
      const bodyX = (leftShoulder.x + rightShoulder.x) / 2;

      // Determine bounds based on current state (Hysteresis)
      // Note: We use isStableInBox here to prevent flickering borders
      const buffer = isStableInBox ? HYSTERESIS : 0;
      
      const minX = BOX_CONFIG.x - buffer;
      const maxX = BOX_CONFIG.x + BOX_CONFIG.width + buffer;
      const minY = BOX_CONFIG.y - buffer;
      const maxY = BOX_CONFIG.y + BOX_CONFIG.height + buffer;

      // Check if body center is within the box horizontal range
      // And nose is within vertical range (roughly)
      const inHorizontal = bodyX > minX && bodyX < maxX;
      const inVertical = nose.y > minY && nose.y < maxY;

      console.log('[SegmentGuidance] Position check:', {
        bodyX,
        noseY: nose.y,
        bounds: { minX, maxX, minY, maxY },
        inHorizontal,
        inVertical,
      });

      if (inHorizontal && inVertical) {
        setIsInBox(true);
      } else {
        setIsInBox(false);
      }
    } else {
      console.log('[SegmentGuidance] Landmarks not visible enough');
      setIsInBox(false);
    }
  }, [currentPose, isStableInBox]); 

  // Stabilize the isInBox state (Grace Period)
  // This prevents the countdown from resetting if detection flickers for < 500ms
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

  // 无操作计时器 - 当没有检测到用户时自动返回首页
  useEffect(() => {
    const timer = setInterval(() => {
      // 如果已经在返回中，停止计时
      if (isReturningRef.current) return;
      
      // 如果用户在检测框内，重置计时器
      if (isStableInBox) {
        lastPoseDetectedTimeRef.current = Date.now();
        setInactivitySeconds(0);
        setShowInactivityCountdown(false);
        return;
      }
      
      const elapsed = Math.floor((Date.now() - lastPoseDetectedTimeRef.current) / 1000);
      setInactivitySeconds(elapsed);
      
      // 超过显示倒计时时间后显示倒计时
      if (elapsed >= inactivityShowBackSeconds && !showInactivityCountdown) {
        setShowInactivityCountdown(true);
        console.log('[SegmentGuidance] Showing inactivity countdown after', elapsed, 'seconds');
      }
      
      // 超过自动返回时间后自动返回
      if (elapsed >= inactivityAutoBackSeconds && onBackRef.current && !isReturningRef.current) {
        console.log('[SegmentGuidance] Auto-returning after', elapsed, 'seconds of inactivity');
        isReturningRef.current = true;
        onBackRef.current();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isStableInBox, inactivityShowBackSeconds, inactivityAutoBackSeconds, showInactivityCountdown]);

  // 初始化皮影人物渲染器和姿态处理器
  useEffect(() => {
    if (!characterCanvasRef.current || !characterId) return;

    const initRenderer = async () => {
      try {
        const renderer = new CharacterRenderer();
        
        // 使用与 CameraTestPage 相同的固定尺寸初始化
        // 这样可以确保动捕效果一致
        const canvasWidth = 640;
        const canvasHeight = 480;
        
        await renderer.init(characterCanvasRef.current!, canvasWidth, canvasHeight);
        
        // 加载角色
        const configUrl = `/api/admin/characters/${characterId}/config.json`;
        await renderer.loadCharacter(configUrl);
        
        // 重置到默认姿态 - 不要设置外部位置和缩放
        // 让 CharacterRenderer 自己管理位置和缩放（与 CameraTestPage 一致）
        renderer.resetPose();
        
        rendererRef.current = renderer;
        console.log('[SegmentGuidance] Character renderer initialized (matching CameraTestPage)');
        
        // 初始化 PoseProcessor（与 CameraTestPage 相同）
        const processor = new PoseProcessor(DEFAULT_CONFIG);
        poseProcessorRef.current = processor;
        console.log('[SegmentGuidance] PoseProcessor initialized');
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

  // 处理姿态检测 - 更新皮影人物和4动作校准
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
    
    // 使用 PoseProcessor 处理姿态
    const processed = processor.process(landmarks);
    
    // 更新皮影人物
    renderer.updatePoseFromProcessed(processed);
    
    // 4动作校准逻辑 - 只在用户站在框内时进行
    if (!isCalibrated && isStableInBox && currentActionIndex < CALIBRATION_ACTIONS.length) {
      const currentAction = CALIBRATION_ACTIONS[currentActionIndex];
      const actionComplete = checkActionComplete(currentAction, pose);
      
      if (actionComplete) {
        // 动作正确，增加保持计数
        actionHoldCountRef.current++;
        setActionHoldProgress(Math.min(actionHoldCountRef.current, HOLD_FRAMES_REQUIRED));
        
        console.log(`[SegmentGuidance] Action ${currentAction}: ${actionHoldCountRef.current}/${HOLD_FRAMES_REQUIRED}`);
        
        if (actionHoldCountRef.current >= HOLD_FRAMES_REQUIRED) {
          // 当前动作完成，进入下一个
          const nextIndex = currentActionIndex + 1;
          
          if (nextIndex >= CALIBRATION_ACTIONS.length) {
            // 所有动作完成！
            setIsCalibrated(true);
            console.log('[SegmentGuidance] ✓ All 4 calibration actions completed!');
          } else {
            // 进入下一个动作
            setCurrentActionIndex(nextIndex);
            actionHoldCountRef.current = 0;
            setActionHoldProgress(0);
            console.log(`[SegmentGuidance] Moving to action ${nextIndex + 1}: ${CALIBRATION_ACTIONS[nextIndex]}`);
          }
        }
      } else {
        // 动作不正确，重置保持计数
        if (actionHoldCountRef.current > 0) {
          actionHoldCountRef.current = 0;
          setActionHoldProgress(0);
        }
      }
    }
  }, [isCalibrated, isStableInBox, currentActionIndex, checkActionComplete]);

  // 当有姿态数据时，更新皮影人物（始终处理，与 CameraTestPage 保持一致）
  useEffect(() => {
    if (currentPose) {
      handlePoseUpdate(currentPose);
    }
  }, [currentPose, handlePoseUpdate]);

  // Store callback in ref to avoid dependency issues
  const onGuidanceCompleteRef = useRef(onGuidanceComplete);
  onGuidanceCompleteRef.current = onGuidanceComplete;

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
        {/* 标题 - 显示4动作校准状态或标题 */}
        <div className="guidance-header">
          {!isCalibrated ? (
            <div className="calibration-status">
              {/* 状态提示 */}
              {!isStableInBox ? (
                <div className="calibration-enter-hint">
                  <span className="enter-icon">👤</span>
                  <span className="enter-text">请走进画面中央的检测区域</span>
                </div>
              ) : (
                <>
                  <div className="calibration-step">
                    {t('guidance.calibration.step', { current: currentActionIndex + 1, total: CALIBRATION_ACTIONS.length })}
                  </div>
                  <div className="calibration-action-text">
                    {t(`guidance.calibration.${CALIBRATION_ACTIONS[currentActionIndex]}`)}
                  </div>
                  <div className="calibration-progress-bar">
                    <div 
                      className="calibration-progress-fill" 
                      style={{ width: `${(actionHoldProgress / HOLD_FRAMES_REQUIRED) * 100}%` }}
                    />
                  </div>
                  <div className="calibration-hint">
                    {actionHoldProgress > 0 
                      ? t('guidance.calibration.holdStill')
                      : '请保持动作直到进度条填满'
                    }
                  </div>
                  {/* 4个动作的进度指示器 */}
                  <div className="calibration-dots">
                    {CALIBRATION_ACTIONS.map((_, index) => (
                      <div 
                        key={index}
                        className={`calibration-dot ${
                          index < currentActionIndex ? 'completed' : 
                          index === currentActionIndex ? 'active' : 'pending'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="calibration-complete-status">
              <div className="calibration-complete-badge">
                {t('guidance.calibration.complete')}
              </div>
              <h1>{t('guidance.title')}</h1>
              <p className="segment-counter">
                {t('guidance.segment', { current: segmentIndex + 1, total: totalSegments })}
              </p>
            </div>
          )}
        </div>

        {/* Detection Box - 仅显示边框，不叠加内容在皮影人物上 */}
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
        </div>
        
        {/* 倒计时显示 - 只在校准完成后显示，位于检测框下方 */}
        {isStableInBox && isCalibrated && countdown !== null && (
          <div className="countdown-display">
            <div key={countdown} className="countdown-number">{countdown}</div>
          </div>
        )}

        {/* 底部内容 - 校准完成后显示段落信息 */}
        {isCalibrated && (
          <div className="guidance-content">
            <h2 className="guidance-action">
              {t(`guidance.segment${segmentIndex + 1}.action`)}
            </h2>
            <p className="guidance-description">
              {t(`guidance.segment${segmentIndex + 1}.description`)}
            </p>
          </div>
        )}
        
        {/* 无操作倒计时提示 */}
        {showInactivityCountdown && !isStableInBox && (
          <div className="inactivity-countdown-overlay">
            <div className="inactivity-countdown-box">
              <div className="inactivity-countdown-icon">⏱️</div>
              <div className="inactivity-countdown-text">
                {t('guidance.inactivityWarning', { defaultValue: '检测不到用户' })}
              </div>
              <div className="inactivity-countdown-timer">
                {inactivityAutoBackSeconds - inactivitySeconds}s 后自动返回首页
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
