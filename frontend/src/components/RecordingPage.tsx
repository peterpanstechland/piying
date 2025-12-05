import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionCaptureRecorder } from '../services/motion-capture';
import { CanvasRecorder } from '../services/canvas-recorder';
import { CharacterRenderer } from '../pixi/CharacterRenderer';
import { PoseProcessor, DEFAULT_CONFIG, type ProcessedPose } from '../pose';
import type { PoseLandmarks } from '../pixi/types';
import './RecordingPage.css';

// 路径配置接口
interface PathConfig {
  offset_start?: number[];  // 起始位置 [x, y] 归一化 0-1
  offset_end?: number[];    // 结束位置 [x, y] 归一化 0-1
  path_waypoints?: number[][]; // 路径中间点
  entry_type?: string;      // 进场动画类型
  entry_duration?: number;  // 进场动画时长
  entry_delay?: number;     // 进场动画延迟
  exit_type?: string;       // 退场动画类型
  exit_duration?: number;   // 退场动画时长
  exit_delay?: number;      // 退场动画延迟
  // 缩放配置
  scale_mode?: 'auto' | 'manual';  // auto = MediaPipe 自动检测, manual = 手动控制
  scale_start?: number;  // 起始缩放 (1.0 = 100%)
  scale_end?: number;    // 结束缩放 (1.0 = 100%)
}

interface RecordingPageProps {
  segmentIndex: number;
  segmentDuration: number;
  segmentStartTime?: number; // 片段在视频中的起始时间（秒）
  segmentGuidance?: string; // 动作引导文本
  characterId?: string; // 角色ID
  videoPath?: string; // 角色专属背景视频路径
  playAudio?: boolean; // 是否播放背景视频音频
  pathConfig?: PathConfig; // 路径配置
  videoElement?: HTMLVideoElement | null;
  recorder: MotionCaptureRecorder;
  onRecordingComplete?: (videoBlob?: Blob) => void; // 新增：返回录制的视频
  onPoseDetected?: (callback: (landmarks: PoseLandmarks) => void) => void;
}

/**
 * RecordingPage - 实时动捕录制界面
 * - 主区域：皮影人物实时动捕
 * - 左下角：摄像头小窗口
 * - 顶部：动作引导和倒计时
 */
// 计算路径上的位置（支持中间点）
function calculatePathPosition(
  progress: number,  // 0-1 的进度
  startPos: number[],
  endPos: number[],
  waypoints?: number[][]
): { x: number; y: number } {
  // 如果没有中间点，直接线性插值
  if (!waypoints || waypoints.length === 0) {
    return {
      x: startPos[0] + (endPos[0] - startPos[0]) * progress,
      y: startPos[1] + (endPos[1] - startPos[1]) * progress,
    };
  }
  
  // 有中间点，分段插值
  const allPoints = [startPos, ...waypoints, endPos];
  const numSegments = allPoints.length - 1;
  const segmentProgress = progress * numSegments;
  const segmentIndex = Math.min(Math.floor(segmentProgress), numSegments - 1);
  const localProgress = segmentProgress - segmentIndex;
  
  const p1 = allPoints[segmentIndex];
  const p2 = allPoints[segmentIndex + 1];
  
  return {
    x: p1[0] + (p2[0] - p1[0]) * localProgress,
    y: p1[1] + (p2[1] - p1[1]) * localProgress,
  };
}

// 缓动函数
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const RecordingPage = ({
  segmentIndex,
  segmentDuration,
  segmentStartTime = 0,
  segmentGuidance,
  characterId,
  videoPath,
  playAudio = false,
  pathConfig,
  videoElement,
  recorder,
  onRecordingComplete,
  onPoseDetected,
}: RecordingPageProps) => {
  const { t } = useTranslation();
  
  // Debug logging
  console.log('RecordingPage props:', {
    segmentIndex,
    segmentDuration,
    segmentStartTime,
    characterId,
    videoPath,
    playAudio,
    pathConfig,
    hasVideoElement: !!videoElement,
  });
  
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  
  // 校准已在上一步完成，直接开始录制
  const isCalibrated = true;
  
  const recordingStartedRef = useRef(false);
  const characterCanvasRef = useRef<HTMLCanvasElement>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement>(null); // 隐藏的录制 Canvas (绿幕)
  const rendererRef = useRef<CharacterRenderer | null>(null);
  const recordingRendererRef = useRef<CharacterRenderer | null>(null); // 录制渲染器
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRecorderRef = useRef<CanvasRecorder | null>(null);
  const recordedVideoBlobRef = useRef<Blob | null>(null);
  
  // 动捕管线相关
  const poseProcessorRef = useRef<PoseProcessor | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_processedPose, setProcessedPose] = useState<ProcessedPose | null>(null);
  const mirrorMode = true; // 镜像模式（摄像头默认是镜像的）

  // 初始化 CharacterRenderer 和 PoseProcessor（与 CameraTestPage 保持一致）
  useEffect(() => {
    if (!characterCanvasRef.current || !characterId) return;

    const initRenderer = async () => {
      try {
        // 1. 初始化显示渲染器 (透明背景)
        const renderer = new CharacterRenderer();
        await renderer.init(characterCanvasRef.current!, window.innerWidth, window.innerHeight);
        
        // 2. 初始化录制渲染器 (绿幕背景 - 用于录制)
        // 创建一个离屏 canvas 如果 ref 不存在 (虽然我们在 JSX 中渲染了 hidden canvas)
        const recordingRenderer = new CharacterRenderer();
        if (recordingCanvasRef.current) {
          await recordingRenderer.init(recordingCanvasRef.current, 1920, 1080, {
            useGreenScreen: true, // 强制绿幕
          });
        }
        
        // 加载角色（使用管理后台的 API）
        const configUrl = `/api/admin/characters/${characterId}/config.json`;
        await renderer.loadCharacter(configUrl);
        if (recordingCanvasRef.current) {
          await recordingRenderer.loadCharacter(configUrl);
        }
        
        // 重置到默认姿态
        renderer.resetPose();
        recordingRenderer.resetPose();
        
        rendererRef.current = renderer;
        recordingRendererRef.current = recordingRenderer;
        
        console.log('Renderers initialized: Display(Transparent), Recording(GreenScreen)');
        
        // 初始化 PoseProcessor
        const processor = new PoseProcessor(DEFAULT_CONFIG);
        poseProcessorRef.current = processor;
        console.log('PoseProcessor initialized');
      } catch (err) {
        console.error('Failed to init character renderer:', err);
      }
    };

    initRenderer();

    return () => {
      rendererRef.current?.destroy();
      recordingRendererRef.current?.destroy();
      poseProcessorRef.current = null;
    };
  }, [characterId]);

  // 开始录制
  useEffect(() => {
    if (!recordingStartedRef.current && isCalibrated && characterCanvasRef.current && recordingCanvasRef.current) {
      recordingStartedRef.current = true;
      
      try {
        // 启动姿态数据录制
        recorder.startRecording(segmentIndex, segmentDuration, (elapsed, _total) => {
          setElapsedTime(elapsed);
        });
        
        // 启动 Canvas 视频录制 - 录制绿幕 Canvas
        const canvasRecorder = new CanvasRecorder();
        canvasRecorder.startRecording(recordingCanvasRef.current, {
          frameRate: 30,
          videoBitsPerSecond: 8000000, // 8 Mbps for good quality
        });
        canvasRecorderRef.current = canvasRecorder;
        
        setIsRecording(true);
        console.log(`Started recording segment ${segmentIndex} for ${segmentDuration}s (Green Screen Canvas)`);
      } catch (error) {
        console.error('Failed to start recording:', error);
      }
    }

    return () => {
      if (recorder.isRecordingActive()) {
        recorder.cancelRecording();
      }
      if (canvasRecorderRef.current?.isRecordingActive()) {
        canvasRecorderRef.current.cancelRecording();
      }
    };
  }, [recorder, segmentIndex, segmentDuration, isCalibrated]);

  // 监听录制完成
  useEffect(() => {
    if (isRecording && elapsedTime >= segmentDuration) {
      setIsRecording(false);
      
      // 停止 Canvas 录制并获取视频
      const finishRecording = async () => {
        let videoBlob: Blob | undefined;
        
        if (canvasRecorderRef.current?.isRecordingActive()) {
          try {
            videoBlob = await canvasRecorderRef.current.stopRecording();
            recordedVideoBlobRef.current = videoBlob;
            console.log(`Canvas recording completed: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);
          } catch (error) {
            console.error('Failed to stop canvas recording:', error);
          }
        }
      
      if (onRecordingComplete) {
          onRecordingComplete(videoBlob);
        }
      };
      
        setTimeout(() => {
        finishRecording();
        }, 500);
    }
  }, [elapsedTime, segmentDuration, isRecording, onRecordingComplete]);

  // 路径动画 - 根据录制进度更新皮影位置
  useEffect(() => {
    if (!rendererRef.current || !pathConfig) return;
    
    const renderer = rendererRef.current;
    const recordingRenderer = recordingRendererRef.current;
    const startPos = pathConfig.offset_start || [0.5, 0.5];
    const endPos = pathConfig.offset_end || [0.5, 0.5];
    const waypoints = pathConfig.path_waypoints;
    
    // 计算进场/退场/主体动画的时间分配
    const entryDuration = pathConfig.entry_duration || 0;
    const entryDelay = pathConfig.entry_delay || 0;
    const exitDuration = pathConfig.exit_duration || 0;
    const exitDelay = pathConfig.exit_delay || 0;
    const entryType = pathConfig.entry_type || 'instant';
    const exitType = pathConfig.exit_type || 'instant';
    
    // 进场阶段: 0 到 entryDelay + entryDuration
    // 主体阶段: entryDelay + entryDuration 到 duration - exitDelay - exitDuration
    // 退场阶段: duration - exitDelay - exitDuration 到 duration
    
    const entryEnd = entryDelay + entryDuration;
    const exitStart = segmentDuration - exitDelay - exitDuration;
    
    // 计算当前所在阶段和对应的位置/透明度
    let position = { x: 0.5, y: 0.5 };
    let opacity = 1;
    
    if (isCalibrated) {
      if (elapsedTime < entryEnd && entryType !== 'instant') {
        // 进场阶段
        const entryProgress = entryDuration > 0 
          ? Math.max(0, (elapsedTime - entryDelay) / entryDuration)
          : 1;
        const easedProgress = easeInOutCubic(Math.min(1, entryProgress));
        
        // 从画面外进入到起始位置
        if (entryType === 'fade') {
          opacity = easedProgress;
          position = { x: startPos[0], y: startPos[1] };
        } else if (entryType === 'slide_left') {
          position = { x: -0.2 + (startPos[0] + 0.2) * easedProgress, y: startPos[1] };
        } else if (entryType === 'slide_right') {
          position = { x: 1.2 - (1.2 - startPos[0]) * easedProgress, y: startPos[1] };
        } else {
          position = { x: startPos[0], y: startPos[1] };
        }
      } else if (elapsedTime >= exitStart && exitType !== 'instant') {
        // 退场阶段
        const exitProgress = exitDuration > 0
          ? (elapsedTime - exitStart) / exitDuration
          : 1;
        const easedProgress = easeInOutCubic(Math.min(1, exitProgress));
        
        // 从结束位置退出到画面外
        if (exitType === 'fade') {
          opacity = 1 - easedProgress;
          position = { x: endPos[0], y: endPos[1] };
        } else if (exitType === 'slide_left') {
          position = { x: endPos[0] - (endPos[0] + 0.2) * easedProgress, y: endPos[1] };
        } else if (exitType === 'slide_right') {
          position = { x: endPos[0] + (1.2 - endPos[0]) * easedProgress, y: endPos[1] };
        } else {
          position = { x: endPos[0], y: endPos[1] };
        }
      } else {
        // 主体阶段 - 从起始位置移动到结束位置
        const mainDuration = exitStart - entryEnd;
        const mainProgress = mainDuration > 0
          ? (elapsedTime - entryEnd) / mainDuration
          : 0;
        
        position = calculatePathPosition(
          Math.min(1, Math.max(0, mainProgress)),
          startPos,
          endPos,
          waypoints
        );
      }
      
      // 应用位置和透明度 - 同步更新两个渲染器
      if (renderer) {
      renderer.setPosition(position.x, position.y);
      renderer.setOpacity(opacity);
      }
      if (recordingRenderer) {
        recordingRenderer.setPosition(position.x, position.y);
        recordingRenderer.setOpacity(opacity);
      }
      
      // 应用缩放 - 自动检测是否需要缩放（手动模式 或 设置了自定义缩放值）
        const scaleStart = pathConfig.scale_start ?? 1.0;
        const scaleEnd = pathConfig.scale_end ?? 1.0;
      const hasCustomScale = Math.abs(scaleStart - 1.0) > 0.01 || Math.abs(scaleEnd - 1.0) > 0.01;
        
      if (pathConfig.scale_mode === 'manual' || hasCustomScale) {
        // 根据整体进度计算当前缩放
        const overallProgress = elapsedTime / segmentDuration;
        const currentScale = scaleStart + (scaleEnd - scaleStart) * Math.min(1, Math.max(0, overallProgress));
        
        if (renderer) renderer.setScale(currentScale);
        if (recordingRenderer) recordingRenderer.setScale(currentScale);
      }
    }
  }, [elapsedTime, isCalibrated, pathConfig, segmentDuration]);

  // 处理姿态检测 - 使用 PoseProcessor 管线
  const handlePose = useCallback((landmarks: PoseLandmarks) => {
    const processor = poseProcessorRef.current;
    const renderer = rendererRef.current;
    const recordingRenderer = recordingRendererRef.current;
    
    if (!processor || !renderer) return;
    
    // 处理管线输入（根据镜像模式翻转 X 坐标）
    const processLandmarks: PoseLandmarks = mirrorMode
      ? landmarks.map((lm) => ({ ...lm, x: 1 - lm.x }))
      : landmarks;
    
    // 使用 PoseProcessor 处理姿态数据
    const processed = processor.process(processLandmarks);
    setProcessedPose(processed);
    
    // 使用处理后的数据更新角色 - 同步更新两个渲染器
    renderer.updatePoseFromProcessed(processed);
    if (recordingRenderer) {
      recordingRenderer.updatePoseFromProcessed(processed);
    }

    // 录制姿态数据
    if (isRecording) {
      // 转换类型：确保 visibility 是必需的
      const recordLandmarks = landmarks.map(lm => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility ?? 1.0, // 默认为 1.0 如果未定义
      }));
      recorder.addFrame(recordLandmarks);
    }
  }, [isRecording, recorder, mirrorMode]);

  // 注册姿态检测回调
  useEffect(() => {
    if (!onPoseDetected) return;
    onPoseDetected(handlePose);
  }, [onPoseDetected, handlePose]);

  // 初始化摄像头视频
  useEffect(() => {
    if (videoRef.current && videoElement) {
      videoRef.current.srcObject = videoElement.srcObject;
      videoRef.current.play().catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Video play error:', err);
        }
      });
    }
  }, [videoElement]);

  // 加载角色专属背景视频
  useEffect(() => {
    console.log('RecordingPage videoPath:', videoPath, 'startTime:', segmentStartTime);
    
    if (!backgroundVideoRef.current) {
      console.warn('Background video ref not ready');
      return;
    }
    
    if (!videoPath) {
      console.warn('No videoPath provided');
      return;
    }

    const video = backgroundVideoRef.current;
    
    console.log('Loading background video from:', videoPath, 'starting at:', segmentStartTime);
    video.src = videoPath;
    video.load();

    const handleCanPlay = () => {
      console.log('Background video can play, seeking to:', segmentStartTime);
      // 设置视频起始时间
      video.currentTime = segmentStartTime;
      // 暂停，等待校准完成后再播放
      video.pause();
    };
    
    const handleError = (e: Event) => {
      console.error('Background video load error:', e, video.error);
      if (video.error) {
        console.error('Video error details:', {
          code: video.error.code,
          message: video.error.message,
        });
      }
    };
    
    const handleLoadStart = () => {
      console.log('Background video load started');
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    video.addEventListener('loadstart', handleLoadStart);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadstart', handleLoadStart);
      video.pause();
      video.src = '';
    };
  }, [videoPath, segmentStartTime]);

  // 当录制开始时播放背景视频，录制结束时暂停
  useEffect(() => {
    if (!backgroundVideoRef.current) return;
    
    const video = backgroundVideoRef.current;
    
    if (isRecording) {
      // 确保从正确的时间点开始
      video.currentTime = segmentStartTime;
      video.play().catch(err => {
        console.error('Background video play error:', err);
      });
    } else {
      video.pause();
    }
  }, [isRecording, segmentStartTime]);

  const progress = Math.min(elapsedTime / segmentDuration, 1);
  const remainingTime = Math.max(segmentDuration - elapsedTime, 0);

  return (
    <div className="recording-page-new">
      {/* 背景视频层 - 角色专属背景 */}
      {videoPath && (
        <video
          ref={backgroundVideoRef}
          className="background-video"
          muted={!playAudio}
          playsInline
        />
      )}

      {/* 隐藏的录制专用 Canvas (绿幕) */}
      {/* 注意：不能使用 visibility: hidden 或 display: none，否则无法录制 */}
      {/* 将其移出屏幕外以隐藏 */}
      <canvas 
        ref={recordingCanvasRef}
        className="recording-canvas-hidden"
        width={1920}
        height={1080}
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: '-9999px', // 移出屏幕外
          zIndex: -999
        }} 
      />

      {/* 主区域：皮影人物动捕 (透明背景) */}
      <canvas 
        ref={characterCanvasRef}
        className="character-canvas"
      />

      {/* 左下角：摄像头小窗口 */}
      <div className="camera-preview">
        {videoElement && (
          <video
            ref={videoRef}
            className="camera-video"
            autoPlay
            muted
            playsInline
          />
        )}
      </div>

      {/* 顶部：状态和引导 */}
      <div className="recording-header">
        {!isRecording ? (
          <div className="ready-status">
            <div className="ready-text">准备开始录制</div>
          </div>
        ) : (
          <>
            <div className="recording-indicator">
              <div className="recording-dot" />
              <span>录制中</span>
            </div>
            
            <div className="guidance-text">
              {segmentGuidance || t(`guidance.segment${segmentIndex + 1}.action`)}
            </div>

            <div className="timer-display">
              {remainingTime.toFixed(1)}s
            </div>
          </>
        )}
      </div>

      {/* 进度条 */}
      {isRecording && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};
