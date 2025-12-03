import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionCaptureRecorder } from '../services/motion-capture';
import { CharacterRenderer } from '../pixi/CharacterRenderer';
import type { PoseLandmarks } from '../pixi/types';
import './RecordingPage.css';

interface RecordingPageProps {
  segmentIndex: number;
  segmentDuration: number;
  segmentGuidance?: string; // 动作引导文本
  characterId?: string; // 角色ID
  videoPath?: string; // 角色专属背景视频路径
  videoElement?: HTMLVideoElement | null;
  recorder: MotionCaptureRecorder;
  onRecordingComplete?: () => void;
  onPoseDetected?: (callback: (landmarks: PoseLandmarks) => void) => void;
}

/**
 * RecordingPage - 实时动捕录制界面
 * - 主区域：皮影人物实时动捕
 * - 左下角：摄像头小窗口
 * - 顶部：动作引导和倒计时
 */
export const RecordingPage = ({
  segmentIndex,
  segmentDuration,
  segmentGuidance,
  characterId,
  videoPath,
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
    characterId,
    videoPath,
    hasVideoElement: !!videoElement,
  });
  
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  
  const recordingStartedRef = useRef(false);
  const characterCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CharacterRenderer | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const poseDetectionCountRef = useRef(0);

  // 初始化 CharacterRenderer
  useEffect(() => {
    if (!characterCanvasRef.current || !characterId) return;

    const initRenderer = async () => {
      try {
        const renderer = new CharacterRenderer();
        await renderer.init(characterCanvasRef.current!, window.innerWidth, window.innerHeight);
        
        // 加载角色（使用管理后台的 API）
        const configUrl = `/api/admin/characters/${characterId}/config.json`;
        await renderer.loadCharacter(configUrl);
        
        rendererRef.current = renderer;
        console.log('Character renderer initialized');
      } catch (err) {
        console.error('Failed to init character renderer:', err);
      }
    };

    initRenderer();

    return () => {
      rendererRef.current?.destroy();
    };
  }, [characterId]);

  // 开始录制
  useEffect(() => {
    if (!recordingStartedRef.current && isCalibrated) {
      recordingStartedRef.current = true;
      
      try {
        recorder.startRecording(segmentIndex, segmentDuration, (elapsed, _total) => {
          setElapsedTime(elapsed);
        });
        setIsRecording(true);
        console.log(`Started recording segment ${segmentIndex} for ${segmentDuration}s`);
      } catch (error) {
        console.error('Failed to start recording:', error);
      }
    }

    return () => {
      if (recorder.isRecordingActive()) {
        recorder.cancelRecording();
      }
    };
  }, [recorder, segmentIndex, segmentDuration, isCalibrated]);

  // 监听录制完成
  useEffect(() => {
    if (isRecording && elapsedTime >= segmentDuration) {
      setIsRecording(false);
      
      if (onRecordingComplete) {
        setTimeout(() => {
          onRecordingComplete();
        }, 500);
      }
    }
  }, [elapsedTime, segmentDuration, isRecording, onRecordingComplete]);

  // 处理姿态检测和自动校准
  useEffect(() => {
    if (!onPoseDetected) return;

    const handlePose = (landmarks: PoseLandmarks) => {
      // 自动校准
      if (!isCalibrated) {
        poseDetectionCountRef.current++;
        if (poseDetectionCountRef.current % 5 === 0) {
          setCalibrationProgress(poseDetectionCountRef.current);
        }
        
        if (poseDetectionCountRef.current === 30) {
          if (rendererRef.current) {
            rendererRef.current.setReferencePose(landmarks);
            setIsCalibrated(true);
            setCalibrationProgress(30);
            console.log('✓ Auto-calibrated');
          }
        }
      }

      // 更新皮影姿态
      if (rendererRef.current) {
        rendererRef.current.updatePose(landmarks);
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
    };

    onPoseDetected(handlePose);
  }, [onPoseDetected, isCalibrated, isRecording, recorder]);

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
    console.log('RecordingPage videoPath:', videoPath);
    
    if (!backgroundVideoRef.current) {
      console.warn('Background video ref not ready');
      return;
    }
    
    if (!videoPath) {
      console.warn('No videoPath provided');
      return;
    }

    const video = backgroundVideoRef.current;
    
    console.log('Loading background video from:', videoPath);
    video.src = videoPath;
    video.load();

    const handleCanPlay = () => {
      console.log('Background video can play, starting playback');
      video.play().catch(err => {
        console.error('Background video play error:', err);
      });
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
  }, [videoPath]);

  const progress = Math.min(elapsedTime / segmentDuration, 1);
  const remainingTime = Math.max(segmentDuration - elapsedTime, 0);

  return (
    <div className="recording-page-new">
      {/* 背景视频层 - 角色专属背景 */}
      {videoPath && (
        <video
          ref={backgroundVideoRef}
          className="background-video"
          autoPlay
          loop
          muted
          playsInline
        />
      )}

      {/* 主区域：皮影人物动捕 */}
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
        {!isCalibrated ? (
          <div className="calibration-status">
            <div className="calibration-text">
              正在校准姿态... ({calibrationProgress}/30)
            </div>
            <div className="calibration-hint">
              请站在摄像头前保持静止
            </div>
          </div>
        ) : !isRecording ? (
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
