import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PoseLandmark } from '../services/camera-detection';
import { CharacterRenderer } from '../pixi/CharacterRenderer';
import { PoseProcessor, DEFAULT_CONFIG } from '../pose';
import type { PoseLandmarks } from '../pixi/types';
import './SegmentGuidancePage.css';

interface SegmentGuidancePageProps {
  segmentIndex: number;
  totalSegments: number;
  videoElement?: HTMLVideoElement | null;
  currentPose?: PoseLandmark[] | null;
  characterId?: string;
  onGuidanceComplete?: () => void;
}

/**
 * SegmentGuidancePage - Displays guidance for the current motion capture segment
 * Shows action description and example poses before recording begins
 * NOW: Includes a detection box that users must step into to start
 */
export const SegmentGuidancePage = ({
  segmentIndex,
  totalSegments,
  videoElement,
  currentPose,
  characterId,
  onGuidanceComplete,
}: SegmentGuidancePageProps) => {
  const { t } = useTranslation();
  const [isInBox, setIsInBox] = useState(false);
  const [isStableInBox, setIsStableInBox] = useState(false); // Debounced state
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // 校准相关状态
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  
  // 皮影人物渲染相关
  const characterCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CharacterRenderer | null>(null);
  const poseProcessorRef = useRef<PoseProcessor | null>(null);
  const poseDetectionCountRef = useRef(0);
  
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

  // 处理姿态检测 - 更新皮影人物和校准
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
    
    // 更新校准状态
    if (processor.isCalibrated() && !isCalibrated) {
      setIsCalibrated(true);
      setCalibrationProgress(30);
      console.log('[SegmentGuidance] ✓ Auto-calibrated via PoseProcessor');
    }
    
    // 更新校准进度
    if (!processor.isCalibrated()) {
      poseDetectionCountRef.current++;
      if (poseDetectionCountRef.current % 5 === 0) {
        setCalibrationProgress(Math.min(poseDetectionCountRef.current, 29));
      }
    }
  }, [isCalibrated]);

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
        {/* 标题 - 显示校准状态或标题 */}
        <div className="guidance-header">
          {!isCalibrated ? (
            <div className="calibration-status">
              <div className="calibration-text">
                正在校准姿态... ({calibrationProgress}/30)
              </div>
              <div className="calibration-hint">
                请站在摄像头前保持静止
              </div>
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
              <div className="calibrating-prompt">校准中...</div>
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
      </div>
    </div>
  );
};
