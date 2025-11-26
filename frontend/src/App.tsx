import { useEffect, useState, useRef, useCallback } from 'react';
import { StateMachine, AppState } from './state/state-machine';
import { CameraDetectionService, DetectionResult } from './services/camera-detection';
import { MotionCaptureRecorder, SegmentData } from './services/motion-capture';
import { APIClient } from './services/api-client';
import { 
  IdlePage, 
  SceneSelectionPage, 
  Scene, 
  MultiPersonWarning,
  ErrorBoundary,
  ToastContainer,
  useToast,
  CameraAccessError,
} from './components';
import { SegmentGuidancePage } from './components/SegmentGuidancePage';
import { CountdownPage } from './components/CountdownPage';
import { RecordingPage } from './components/RecordingPage';
import { SegmentReviewPage } from './components/SegmentReviewPage';
import { errorLogger, setupGlobalErrorHandling } from './utils/error-logger';
import { performanceMonitor } from './utils/performance-monitor';
import './App.css';

// Load scenes configuration
const loadScenes = async (): Promise<Scene[]> => {
  try {
    const response = await fetch('/config/scenes.json');
    const data = await response.json();
    return Object.values(data.scenes);
  } catch (error) {
    console.error('Failed to load scenes:', error);
    // Return default scenes if loading fails
    return [
      {
        id: 'sceneA',
        name: '武术表演',
        name_en: 'Martial Arts Performance',
        description: '展示你的武术动作',
        description_en: 'Show your martial arts moves',
        icon: '🥋',
        segments: [],
      },
      {
        id: 'sceneB',
        name: '舞蹈表演',
        name_en: 'Dance Performance',
        description: '展示你的舞蹈动作',
        description_en: 'Show your dance moves',
        icon: '💃',
        segments: [],
      },
      {
        id: 'sceneC',
        name: '故事表演',
        name_en: 'Story Performance',
        description: '讲述你的故事',
        description_en: 'Tell your story',
        icon: '📖',
        segments: [],
      },
    ];
  }
};

function App() {
  const [currentState, setCurrentState] = useState<AppState>(AppState.IDLE);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [handPosition, setHandPosition] = useState<{ x: number; y: number } | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [multiPersonWarning, setMultiPersonWarning] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<boolean>(false);
  
  const { toasts, showError, showWarning, closeToast } = useToast();
  
  // Performance monitoring
  const animationFrameRef = useRef<number | null>(null);
  
  const stateMachineRef = useRef<StateMachine | null>(null);
  const cameraServiceRef = useRef<CameraDetectionService | null>(null);
  const personDetectedTimeRef = useRef<number | null>(null);
  const recorderRef = useRef<MotionCaptureRecorder>(new MotionCaptureRecorder());
  const apiClientRef = useRef<APIClient>(new APIClient());
  const recordedSegmentsRef = useRef<SegmentData[]>([]);

  // Setup global error handling
  useEffect(() => {
    setupGlobalErrorHandling();
  }, []);

  // Setup performance monitoring with RAF loop
  useEffect(() => {
    const performanceLoop = () => {
      performanceMonitor.recordFrame();
      animationFrameRef.current = requestAnimationFrame(performanceLoop);
    };
    
    animationFrameRef.current = requestAnimationFrame(performanceLoop);
    
    // Log performance report every 30 seconds
    const reportInterval = setInterval(() => {
      performanceMonitor.logReport();
    }, 30000);
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      clearInterval(reportInterval);
    };
  }, []);

  // Initialize state machine
  useEffect(() => {
    stateMachineRef.current = new StateMachine(AppState.IDLE);
    
    // Listen to state changes and track transition timing
    stateMachineRef.current.addListener((state) => {
      setCurrentState(state);
      
      // Record state transition duration for performance monitoring
      const transitionDuration = stateMachineRef.current?.getLastTransitionDuration() || 0;
      performanceMonitor.recordStateTransition(transitionDuration);
    });

    return () => {
      if (stateMachineRef.current) {
        stateMachineRef.current.reset();
      }
    };
  }, []);

  // Load scenes
  useEffect(() => {
    loadScenes()
      .then(setScenes)
      .catch((error) => {
        errorLogger.log(error, 'medium' as any, 'config');
        showWarning(
          '场景加载失败',
          '使用默认场景配置。部分功能可能受限。'
        );
      });
  }, [showWarning]);

  // Initialize camera and detection (only once on mount)
  useEffect(() => {
    let mounted = true;
    
    const initCamera = async () => {
      try {
        const service = new CameraDetectionService();
        await service.initialize();
        
        if (!mounted) {
          service.cleanup();
          return;
        }
        
        cameraServiceRef.current = service;
        setVideoElement(service.getVideoElement());
        setCameraError(false);

        // Start detection
        service.startDetection(handleDetection);
      } catch (error) {
        if (!mounted) return;
        
        console.error('Failed to initialize camera:', error);
        errorLogger.logCameraError(
          error instanceof Error ? error : new Error(String(error)),
          { action: 'initialize' }
        );
        setCameraError(true);
        showError(
          '摄像头访问失败',
          '无法访问摄像头。请检查权限设置。',
          {
            label: '重试',
            onClick: () => {
              setCameraError(false);
              initCamera();
            },
          }
        );
      }
    };

    initCamera();

    return () => {
      mounted = false;
      if (cameraServiceRef.current) {
        cameraServiceRef.current.cleanup();
        cameraServiceRef.current = null;
      }
    };
  }, []); // Empty deps - only run once on mount

  // Handle detection results
  const handleDetection = useCallback((result: DetectionResult) => {
    const detectionStart = performance.now();
    const currentState = stateMachineRef.current?.getCurrentState();

    // Update multi-person warning state
    setMultiPersonWarning(result.multiPerson);

    // Handle person detection for IDLE -> SCENE_SELECT transition
    if (currentState === AppState.IDLE) {
      if (result.presence) {
        if (personDetectedTimeRef.current === null) {
          personDetectedTimeRef.current = Date.now();
        } else {
          const detectionDuration = Date.now() - personDetectedTimeRef.current;
          // Transition after 1 second of continuous detection
          if (detectionDuration >= 1000) {
            stateMachineRef.current?.transition(AppState.SCENE_SELECT);
            personDetectedTimeRef.current = null;
          }
        }
      } else {
        personDetectedTimeRef.current = null;
      }
    }

    // Handle hand cursor in SCENE_SELECT state
    if (currentState === AppState.SCENE_SELECT) {
      if (result.rightHand) {
        setHandPosition(result.rightHand);
      } else {
        setHandPosition(null);
      }
    }

    // Handle pose recording during SEGMENT_RECORD state
    if (currentState === AppState.SEGMENT_RECORD) {
      // Check if tracked person is still present during recording
      if (result.trackedPersonIndex === -1 && recorderRef.current.isRecordingActive()) {
        // Tracked person left during recording - pause recording
        console.warn('Tracked person left during recording');
        // TODO: Implement recording pause logic
      } else if (result.pose && recorderRef.current.isRecordingActive()) {
        recorderRef.current.addFrame(result.pose);
      }
    }

    // Handle person absence timeout
    if (currentState === AppState.SCENE_SELECT && !result.presence) {
      // TODO: Implement timeout logic (10 seconds)
    }
    
    // Record detection callback duration for performance monitoring
    const detectionDuration = performance.now() - detectionStart;
    performanceMonitor.recordDetectionCallback(detectionDuration);
  }, []); // Empty deps - function is stable

  // Handle scene selection
  const handleSceneSelect = useCallback(async (sceneId: string) => {
    const currentState = stateMachineRef.current?.getCurrentState();
    
    // Prevent duplicate selections - only allow from SCENE_SELECT state
    if (currentState !== AppState.SCENE_SELECT) {
      console.log('Ignoring scene selection - not in SCENE_SELECT state');
      return;
    }
    
    console.log('Scene selected:', sceneId);
    const selectedScene = scenes.find((s) => s.id === sceneId);
    
    if (selectedScene && stateMachineRef.current) {
      try {
        // Create session via API
        const response = await apiClientRef.current.createSession(sceneId);
        console.log('Session created:', response.session_id);
        
        // Reset recorded segments
        recordedSegmentsRef.current = [];
        
        // Transition to segment guidance
        stateMachineRef.current.transition(AppState.SEGMENT_GUIDE, {
          sessionId: response.session_id,
          sceneId: sceneId,
          totalSegments: selectedScene.segments.length || 3, // Default to 3 if not specified
          currentSegment: 0,
        });
      } catch (error) {
        console.error('Failed to create session:', error);
        errorLogger.logAPIError(
          error instanceof Error ? error : new Error(String(error)),
          { action: 'createSession', sceneId }
        );
        showError(
          '创建会话失败',
          '无法连接到服务器。请检查网络连接。',
          {
            label: '重试',
            onClick: () => handleSceneSelect(sceneId),
          }
        );
      }
    }
  }, [scenes]);

  // Handle guidance complete - transition to countdown
  const handleGuidanceComplete = () => {
    if (stateMachineRef.current) {
      stateMachineRef.current.transition(AppState.SEGMENT_COUNTDOWN);
    }
  };

  // Handle countdown complete - transition to recording
  const handleCountdownComplete = () => {
    if (stateMachineRef.current) {
      stateMachineRef.current.transition(AppState.SEGMENT_RECORD);
      // Set recording state in camera service for multi-person tracking persistence
      if (cameraServiceRef.current) {
        cameraServiceRef.current.setRecordingState(true);
      }
    }
  };

  // Handle recording complete - stop recording and transition to review
  const handleRecordingComplete = () => {
    if (recorderRef.current.isRecordingActive()) {
      const segmentData = recorderRef.current.stopRecording();
      recordedSegmentsRef.current.push(segmentData);
      console.log('Recording complete:', segmentData);
      
      // Stop recording state in camera service
      if (cameraServiceRef.current) {
        cameraServiceRef.current.setRecordingState(false);
      }
      
      if (stateMachineRef.current) {
        stateMachineRef.current.transition(AppState.SEGMENT_REVIEW);
      }
    }
  };

  // Handle re-record - go back to guidance
  const handleReRecord = () => {
    // Remove the last recorded segment
    recordedSegmentsRef.current.pop();
    
    if (stateMachineRef.current) {
      stateMachineRef.current.transition(AppState.SEGMENT_GUIDE);
    }
  };

  // Handle continue after review - upload segment and proceed
  const handleContinue = async () => {
    const context = stateMachineRef.current?.getContext();
    if (!context || !context.sessionId) {
      console.error('No session context available');
      return;
    }

    const lastSegment = recordedSegmentsRef.current[recordedSegmentsRef.current.length - 1];
    if (!lastSegment) {
      console.error('No segment data to upload');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadProgress(0);

      // Convert segment data to API format (landmarks as number arrays)
      const apiSegmentData = {
        index: lastSegment.index,
        duration: lastSegment.duration,
        frames: lastSegment.frames.map(frame => ({
          timestamp: frame.timestamp,
          landmarks: frame.landmarks.map(landmark => [
            landmark.x,
            landmark.y,
            landmark.z,
            landmark.visibility
          ])
        }))
      };

      // Upload the segment with progress tracking
      console.log(`Uploading segment ${lastSegment.index} for session ${context.sessionId}`);
      await apiClientRef.current.uploadSegment(
        context.sessionId,
        lastSegment.index,
        apiSegmentData,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      console.log('Segment uploaded successfully');

      // Small delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check if all segments are complete
      const allSegmentsComplete = recordedSegmentsRef.current.length >= context.totalSegments;

      if (allSegmentsComplete) {
        // All segments recorded - transition to render wait
        console.log('All segments complete, transitioning to render wait');
        if (stateMachineRef.current) {
          stateMachineRef.current.transition(AppState.RENDER_WAIT);
        }
      } else {
        // More segments to record - go to next segment guidance
        console.log('Moving to next segment');
        if (stateMachineRef.current) {
          stateMachineRef.current.transition(AppState.SEGMENT_GUIDE, {
            currentSegment: context.currentSegment + 1,
          });
        }
      }
    } catch (error) {
      console.error('Failed to upload segment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);
      
      errorLogger.logAPIError(
        error instanceof Error ? error : new Error(String(error)),
        { 
          action: 'uploadSegment', 
          sessionId: context.sessionId,
          segmentIndex: lastSegment.index 
        }
      );
      
      showError(
        '上传失败',
        '无法上传动作数据。请重试。',
        {
          label: '重试',
          onClick: handleContinue,
        }
      );
      // Keep user on review page to retry
    } finally {
      setIsUploading(false);
    }
  };

  // Handle reset - cleanup frontend state and notify backend
  // @ts-ignore - Function defined for future use
  const handleReset = async (): Promise<void> => {
    const context = stateMachineRef.current?.getContext();
    
    // If there's an active session, notify backend to cancel it
    if (context?.sessionId) {
      try {
        console.log(`Cancelling session ${context.sessionId} on reset`);
        await apiClientRef.current.cancelSession(context.sessionId);
      } catch (error) {
        console.error('Failed to cancel session on reset:', error);
        // Continue with reset even if backend notification fails
      }
    }
    
    // Clear recorded segments
    recordedSegmentsRef.current = [];
    
    // Reset state machine
    if (stateMachineRef.current) {
      stateMachineRef.current.reset();
    }
    
    // Clear upload state
    setUploadProgress(0);
    setUploadError(null);
    setIsUploading(false);
    
    console.log('Reset complete - returned to IDLE state');
  };

  // Add pose frames to recorder during recording
  useEffect(() => {
    if (currentState === AppState.SEGMENT_RECORD && cameraServiceRef.current) {
      // This will be called by detection callback
      // The detection callback should add frames to the recorder
    }
  }, [currentState]);

  // Render current page based on state
  const renderCurrentPage = () => {
    const context = stateMachineRef.current?.getContext();
    
    switch (currentState) {
      case AppState.IDLE:
        return <IdlePage videoElement={videoElement} />;
      
      case AppState.SCENE_SELECT:
        return (
          <SceneSelectionPage
            scenes={scenes}
            videoElement={videoElement}
            handPosition={handPosition}
            onSceneSelect={handleSceneSelect}
          />
        );
      
      case AppState.SEGMENT_GUIDE:
        return (
          <SegmentGuidancePage
            segmentIndex={context?.currentSegment || 0}
            totalSegments={context?.totalSegments || 3}
            videoElement={videoElement}
            onGuidanceComplete={handleGuidanceComplete}
          />
        );
      
      case AppState.SEGMENT_COUNTDOWN:
        return (
          <CountdownPage
            videoElement={videoElement}
            onCountdownComplete={handleCountdownComplete}
          />
        );
      
      case AppState.SEGMENT_RECORD:
        return (
          <RecordingPage
            segmentIndex={context?.currentSegment || 0}
            segmentDuration={8} // TODO: Get from scene config
            videoElement={videoElement}
            recorder={recorderRef.current}
            onRecordingComplete={handleRecordingComplete}
          />
        );
      
      case AppState.SEGMENT_REVIEW:
        const lastSegment = recordedSegmentsRef.current[recordedSegmentsRef.current.length - 1];
        return (
          <SegmentReviewPage
            segmentIndex={context?.currentSegment || 0}
            totalSegments={context?.totalSegments || 3}
            frameCount={lastSegment?.frames.length || 0}
            videoElement={videoElement}
            onReRecord={handleReRecord}
            onContinue={handleContinue}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
          />
        );
      
      default:
        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100vh',
            background: '#000',
            color: '#fff',
            fontSize: '24px'
          }}>
            State: {currentState} (Not yet implemented)
            {uploadError && (
              <div style={{ color: '#ff4444', marginTop: '20px' }}>
                Error: {uploadError}
              </div>
            )}
            {isUploading && (
              <div style={{ marginTop: '20px' }}>
                Uploading... {uploadProgress}%
              </div>
            )}
          </div>
        );
    }
  };

  // Render camera error screen if camera initialization failed
  if (cameraError) {
    return (
      <ErrorBoundary>
        <div className="App">
          <CameraAccessError
            onRetry={() => {
              setCameraError(false);
              window.location.reload();
            }}
          />
          <ToastContainer toasts={toasts} onClose={closeToast} />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="App">
        {renderCurrentPage()}
        <MultiPersonWarning 
          show={multiPersonWarning} 
          isRecording={currentState === AppState.SEGMENT_RECORD}
        />
        <ToastContainer toasts={toasts} onClose={closeToast} />
      </div>
    </ErrorBoundary>
  );
}

export default App;
