import { useEffect, useState, useRef, useCallback } from 'react';
import { StateMachine, AppState } from './state/state-machine';
import { CameraDetectionService, DetectionResult, PoseLandmark } from './services/camera-detection';
import { MotionCaptureRecorder, SegmentData } from './services/motion-capture';
import { APIClient } from './services/api-client';
import { 
  IdlePage, 
  SceneSelectionPage, 
  CharacterSelectionPage,
  Scene, 
  MultiPersonWarning,
  ErrorBoundary,
  ToastContainer,
  useToast,
  CameraAccessError,
} from './components';
import type { CharacterOption } from './components';
import { SegmentGuidancePage } from './components/SegmentGuidancePage';
import { CountdownPage } from './components/CountdownPage';
import { RecordingPage } from './components/RecordingPage';
import { SegmentReviewPage } from './components/SegmentReviewPage';
import { RenderWaitPage } from './components/RenderWaitPage';
import { FinalResultPage } from './components/FinalResultPage';
import { errorLogger, setupGlobalErrorHandling } from './utils/error-logger';
import { performanceMonitor } from './utils/performance-monitor';
import './App.css';

// Load scenes from API (published storylines) or fallback to static config
const loadScenes = async (apiClient: APIClient): Promise<Scene[]> => {
  try {
    // First try to fetch from the storylines API (published only)
    const storylines = await apiClient.getPublishedStorylines();
    
    if (storylines && storylines.length > 0) {
      // Convert API response to Scene format
      return storylines.map(storyline => ({
        id: storyline.id,
        name: storyline.name,
        name_en: storyline.name_en || storyline.name,
        description: storyline.synopsis || '',
        description_en: storyline.synopsis_en || '',
        synopsis: storyline.synopsis,
        synopsis_en: storyline.synopsis_en,
        icon: storyline.icon || '⛏️',
        icon_image: storyline.icon_image,
        cover_image: storyline.cover_image,
        video_duration: storyline.video_duration,
        character_count: storyline.character_count,
        segment_count: storyline.segment_count,
        segments: [], // Will be loaded when storyline is selected
      }));
    }
    
    // Fallback to static config if no published storylines
    console.log('No published storylines found, falling back to static config');
    return loadScenesFromConfig();
  } catch (error) {
    console.error('Failed to load storylines from API:', error);
    // Fallback to static config
    return loadScenesFromConfig();
  }
};

// Load scenes from static config file (fallback)
const loadScenesFromConfig = async (): Promise<Scene[]> => {
  try {
    const response = await fetch('/config/scenes.json');
    const data = await response.json();
    return Object.values(data.scenes);
  } catch (error) {
    console.error('Failed to load scenes from config:', error);
    // Return default scenes if loading fails
    return [
      {
        id: 'sceneA',
        name: '时间迷途',
        name_en: 'Lost in Time',
        description: '跨越古代与未来的皮影故事，展现嫦娥与宇航员在月球相遇的动人瞬间。',
        description_en: 'A shadow-play journey across time, portraying the encounter between Chang’e and a modern astronaut on the moon.',
        icon: '🌕',
        segments: [],
      },
      {
        id: 'sceneB',
        name: '来自五百年前的梦',
        name_en: 'Dance Performance',
        description: '以皮影光影呈现从宇宙大爆炸到现代科技的史诗旅程，生命起源化作猿猴影子，与当代人物在光中重叠，完成跨越万年的梦境回响。',
        description_en: 'Show your dance moves',
        icon: '🌌',
        segments: [],
      },
      {
        id: 'sceneC',
        name: '淘金者',
        name_en: 'Story Performance',
        description: '以皮影光影讲述一位孤独淘金者在荒漠中寻找希望的旅程。风沙、木桥与影子的摇曳构成命运的考验，直到一束金色微光穿透镂空皮影，他在风暴中抓住属于自己的希望。',
        description_en: 'Tell your story',
        icon: '⛏️',
        segments: [],
      },
    ];
  }
};

function App() {
  const [currentState, setCurrentState] = useState<AppState>(AppState.IDLE);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [handPosition, setHandPosition] = useState<{ x: number; y: number } | null>(null);
  const [currentPose, setCurrentPose] = useState<PoseLandmark[] | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [multiPersonWarning, setMultiPersonWarning] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<boolean>(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [availableCharacters, setAvailableCharacters] = useState<CharacterOption[]>([]);
  
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

  // Load scenes from API
  useEffect(() => {
    loadScenes(apiClientRef.current)
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

    // Handle hand cursor in SCENE_SELECT, SEGMENT_REVIEW, and FINAL_RESULT states
    if (
      currentState === AppState.SCENE_SELECT || 
      currentState === AppState.SEGMENT_REVIEW ||
      currentState === AppState.FINAL_RESULT
    ) {
      if (result.rightHand) {
        setHandPosition(result.rightHand);
      } else {
        setHandPosition(null);
      }
    }

    // Handle Pose for Segment Guidance (Checking if user is in box)
    if (currentState === AppState.SEGMENT_GUIDE) {
      if (result.pose) {
        setCurrentPose(result.pose);
      } else {
        setCurrentPose(null);
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
    const scene = scenes.find((s) => s.id === sceneId);
    
    if (scene && stateMachineRef.current) {
      setSelectedScene(scene);
      
      try {
        // Fetch storyline details to get available characters
        const storylineDetail = await apiClientRef.current.getPublishedStorylineDetail(sceneId);
        
        if (storylineDetail.characters && storylineDetail.characters.length > 0) {
          // Has characters - transition to character selection
          setAvailableCharacters(storylineDetail.characters);
          stateMachineRef.current.transition(AppState.CHARACTER_SELECT, {
            sceneId: sceneId,
            availableCharacters: storylineDetail.characters,
          });
          return;
        }
      } catch (error) {
        // If fetching details fails, continue without character selection
        console.warn('Failed to fetch storyline details, skipping character selection:', error);
      }
      
      // No characters or fetch failed - proceed directly to session creation
      await createSessionAndStartRecording(scene, null);
    }
  }, [scenes]);

  // Create session and start recording flow
  const createSessionAndStartRecording = useCallback(async (scene: Scene, characterId: string | null) => {
    if (!stateMachineRef.current) return;
    
    try {
      // Create session via API
      const response = await apiClientRef.current.createSession(scene.id);
      console.log('Session created:', response.session_id);
      
      // Reset recorded segments
      recordedSegmentsRef.current = [];
      
      // Transition to segment guidance
      stateMachineRef.current.transition(AppState.SEGMENT_GUIDE, {
        sessionId: response.session_id,
        sceneId: scene.id,
        characterId: characterId || undefined,
        totalSegments: scene.segment_count || scene.segments.length || 3,
        currentSegment: 0,
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      errorLogger.logAPIError(
        error instanceof Error ? error : new Error(String(error)),
        { action: 'createSession', sceneId: scene.id }
      );
      showError(
        '创建会话失败',
        '无法连接到服务器。请检查网络连接。',
        {
          label: '重试',
          onClick: () => {
            if (selectedScene) {
              createSessionAndStartRecording(selectedScene, null);
            }
          },
        }
      );
    }
  }, [showError, selectedScene]);

  // Handle character selection
  const handleCharacterSelect = useCallback(async (characterId: string) => {
    const currentState = stateMachineRef.current?.getCurrentState();
    
    // Only allow from CHARACTER_SELECT state
    if (currentState !== AppState.CHARACTER_SELECT) {
      console.log('Ignoring character selection - not in CHARACTER_SELECT state');
      return;
    }
    
    console.log('Character selected:', characterId);
    
    if (selectedScene) {
      await createSessionAndStartRecording(selectedScene, characterId);
    }
  }, [selectedScene, createSessionAndStartRecording]);

  // Handle back from character selection
  const handleBackToSceneSelect = useCallback(() => {
    if (stateMachineRef.current) {
      setSelectedScene(null);
      setAvailableCharacters([]);
      stateMachineRef.current.transition(AppState.SCENE_SELECT);
    }
  }, []);

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
        // All segments recorded - trigger rendering and transition to render wait
        console.log('All segments complete, triggering render');
        
        // Trigger video rendering on backend
        try {
          await apiClientRef.current.triggerRender(context.sessionId);
          console.log('Render triggered successfully');
        } catch (renderError) {
          console.error('Failed to trigger render:', renderError);
          // Continue to render wait page anyway - it will poll for status
        }
        
        if (stateMachineRef.current) {
          // Update context with recorded segments before transitioning
          stateMachineRef.current.transition(AppState.RENDER_WAIT, {
            recordedSegments: [...recordedSegmentsRef.current],
          });
        }
      } else {
        // More segments to record - go to next segment guidance
        console.log('Moving to next segment');
        if (stateMachineRef.current) {
          // Update context with current recorded segments
          stateMachineRef.current.transition(AppState.SEGMENT_GUIDE, {
            currentSegment: context.currentSegment + 1,
            recordedSegments: [...recordedSegmentsRef.current],
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
  const handleReset = async (): Promise<void> => {
    const context = stateMachineRef.current?.getContext();
    const state = stateMachineRef.current?.getCurrentState();
    
    // Only cancel session if it's not already completed (FINAL_RESULT means video is done)
    // Don't try to cancel completed sessions as they may already be cleaned up
    if (context?.sessionId && state !== AppState.FINAL_RESULT) {
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
    setVideoUrl(null);
    
    // Clear scene and character selection
    setSelectedScene(null);
    setAvailableCharacters([]);
    
    console.log('Reset complete - returned to IDLE state');
  };

  // Handle render complete - video is ready
  const handleRenderComplete = (url: string) => {
    console.log('Render complete, video URL:', url);
    setVideoUrl(url);
    if (stateMachineRef.current) {
      stateMachineRef.current.transition(AppState.FINAL_RESULT, { videoUrl: url });
    }
  };

  // Handle render error
  const handleRenderError = (error: string) => {
    console.error('Render error:', error);
    showError('渲染失败', error);
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
            apiBaseUrl={apiClientRef.current.getBaseUrl()}
          />
        );
      
      case AppState.CHARACTER_SELECT:
        return (
          <CharacterSelectionPage
            characters={availableCharacters}
            sceneName={selectedScene?.name || ''}
            videoElement={videoElement}
            handPosition={handPosition}
            onCharacterSelect={handleCharacterSelect}
            onBack={handleBackToSceneSelect}
            apiBaseUrl={apiClientRef.current.getBaseUrl()}
          />
        );
      
      case AppState.SEGMENT_GUIDE:
        return (
          <SegmentGuidancePage
            segmentIndex={context?.currentSegment || 0}
            totalSegments={context?.totalSegments || 3}
            videoElement={videoElement}
            currentPose={currentPose} // Pass pose data
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
            cursorPosition={handPosition}
            hoverDurationMs={3000}
          />
        );
      
      case AppState.RENDER_WAIT:
        return (
          <RenderWaitPage
            sessionId={context?.sessionId || ''}
            onComplete={handleRenderComplete}
            onError={handleRenderError}
            apiClient={apiClientRef.current}
          />
        );
      
      case AppState.FINAL_RESULT:
        return (
          <FinalResultPage
            videoUrl={videoUrl || context?.videoUrl || ''}
            onReset={handleReset}
            inactivityTimeoutSeconds={30}
            cursorPosition={handPosition}
            hoverDurationMs={3000}
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