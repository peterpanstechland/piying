import { useEffect, useState, useRef, useCallback } from 'react';
import { StateMachine, AppState } from './state/state-machine';
import { CameraDetectionService, DetectionResult, PoseLandmark } from './services/camera-detection';
import { MotionCaptureRecorder, SegmentData } from './services/motion-capture';
import { APIClient } from './services/api-client';

// Extended segment data with optional video blob
interface RecordedSegment extends SegmentData {
  videoBlob?: Blob;
}
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
// CountdownPage removed - countdown now handled in RecordingPage
import { RecordingPage } from './components/RecordingPage';
import { SegmentReviewPage } from './components/SegmentReviewPage';
import { RenderWaitPage } from './components/RenderWaitPage';
import { FinalResultPage } from './components/FinalResultPage';
import { errorLogger, setupGlobalErrorHandling } from './utils/error-logger';
import { performanceMonitor } from './utils/performance-monitor';
import './App.css';

// Load scenes from API (published storylines)
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
        enabled: storyline.enabled, // Pass enabled status for grey-out display
        segments: [], // Will be loaded when storyline is selected
      }));
    }
    
    console.warn('No published storylines found');
    return [];
  } catch (error) {
    console.error('Failed to load storylines from API:', error);
    throw error;
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
  
  // 页面过渡状态
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [displayedState, setDisplayedState] = useState<AppState>(AppState.IDLE);
  const previousStateRef = useRef<AppState>(AppState.IDLE);
  
  const { toasts, showError, showWarning, closeToast } = useToast();
  
  // Performance monitoring
  const animationFrameRef = useRef<number | null>(null);
  
  const stateMachineRef = useRef<StateMachine | null>(null);
  const cameraServiceRef = useRef<CameraDetectionService | null>(null);
  const personDetectedTimeRef = useRef<number | null>(null);
  const recorderRef = useRef<MotionCaptureRecorder>(new MotionCaptureRecorder());
  const apiClientRef = useRef<APIClient>(new APIClient());
  const recordedSegmentsRef = useRef<RecordedSegment[]>([]);
  const poseCallbackRef = useRef<((landmarks: PoseLandmark[]) => void) | null>(null);

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
      const prevState = previousStateRef.current;
      setCurrentState(state);
      
      // 页面过渡动画：仅在IDLE->SCENE_SELECT时使用平滑过渡
      if (prevState === AppState.IDLE && state === AppState.SCENE_SELECT) {
        // 触发退出动画
        setIsTransitioning(true);
        
        // 等待退出动画完成后更新显示状态
        setTimeout(() => {
          setDisplayedState(state);
          setIsTransitioning(false);
        }, 300);
      } else {
        // 其他状态直接切换
        setDisplayedState(state);
      }
      
      previousStateRef.current = state;
      
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

  // Load scenes from API (only once on mount)
  useEffect(() => {
    loadScenes(apiClientRef.current)
      .then((scenes) => {
        if (scenes.length === 0) {
          showWarning(
            '没有可用的场景',
            '请在管理后台发布至少一个剧本。'
          );
        }
        setScenes(scenes);
      })
      .catch((error) => {
        errorLogger.log(error, 'medium' as any, 'config');
        showWarning(
          '场景加载失败',
          '无法连接到服务器或加载剧本列表。'
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - showWarning is stable via toastManager singleton

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

    // Handle hand cursor in SCENE_SELECT, CHARACTER_SELECT, SEGMENT_REVIEW, and FINAL_RESULT states
    if (
      currentState === AppState.SCENE_SELECT || 
      currentState === AppState.CHARACTER_SELECT ||
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
      } else if (result.pose) {
        // Update character renderer with pose data
        if (poseCallbackRef.current) {
          poseCallbackRef.current(result.pose);
        }
        
        // Add frame to recorder if recording is active
        if (recorderRef.current.isRecordingActive()) {
          recorderRef.current.addFrame(result.pose);
        }
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
        // Fetch storyline details to get available characters and segments
        const storylineDetail = await apiClientRef.current.getPublishedStorylineDetail(sceneId);
        
        // Update scene with detailed information
        const updatedScene = {
          ...scene,
          segments: storylineDetail.segments || scene.segments,
          segment_count: storylineDetail.segment_count || scene.segment_count,
          character_count: storylineDetail.character_count || scene.character_count,
        };
        setSelectedScene(updatedScene);
        
        console.log('Storyline detail loaded:', {
          segment_count: updatedScene.segment_count,
          segments: updatedScene.segments?.length,
          character_count: updatedScene.character_count,
        });
        
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
      // Use base video URL (no character_id parameter)
      const videoUrl = `${apiClientRef.current.getBaseUrl()}/api/storylines/${sceneId}/video/file`;
      // Use selectedScene which has been updated with segment info
      await createSessionAndStartRecording(selectedScene || scene, null, videoUrl);
    }
  }, [scenes]);

  // Create session and start recording flow
  // Requirements 3.4: Session stores selected character ID and corresponding video path
  const createSessionAndStartRecording = useCallback(async (
    scene: Scene, 
    characterId: string | null,
    videoPath?: string
  ) => {
    if (!stateMachineRef.current) return;
    
    try {
      // Create session via API with character ID and video path
      const response = await apiClientRef.current.createSession(
        scene.id,
        characterId || undefined,
        videoPath
      );
      console.log('Session created:', response.session_id, 'with character:', characterId, 'video:', videoPath);
      
      // Reset recorded segments
      recordedSegmentsRef.current = [];
      
      // Log segment information before transition
      console.log('[CreateSession] Transitioning to SEGMENT_GUIDE with context:', {
        sessionId: response.session_id,
        sceneId: scene.id,
        characterId: characterId || undefined,
        totalSegments: scene.segment_count || scene.segments?.length || 3,
        segments_from_scene: scene.segments?.length,
        segment_count_from_scene: scene.segment_count,
        segments: scene.segments,
      });
      
      // Transition to segment guidance
      stateMachineRef.current.transition(AppState.SEGMENT_GUIDE, {
        sessionId: response.session_id,
        sceneId: scene.id,
        characterId: characterId || undefined,
        videoPath: videoPath,
        apiBaseUrl: apiClientRef.current.getBaseUrl(),
        videoDuration: scene.video_duration || 30, // Store video duration for auto-reset
        totalSegments: scene.segment_count || scene.segments?.length || 3,
        segments: scene.segments || [], // Store segment configurations
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
  // Requirements 3.1, 3.2, 3.3: Fetch character-specific video path when character is selected
  const handleCharacterSelect = useCallback(async (characterId: string) => {
    const currentState = stateMachineRef.current?.getCurrentState();
    
    // Only allow from CHARACTER_SELECT state
    if (currentState !== AppState.CHARACTER_SELECT) {
      console.log('Ignoring character selection - not in CHARACTER_SELECT state');
      return;
    }
    
    console.log('Character selected:', characterId);
    
    if (selectedScene) {
      try {
        // Fetch character-specific video segments configuration
        console.log('[CharacterSelect] Fetching character-specific segments:', {
          storyline_id: selectedScene.id,
          character_id: characterId,
        });
        
        const segmentData = await apiClientRef.current.getCharacterVideoSegments(
          selectedScene.id,
          characterId
        );
        
        console.log('[CharacterSelect] Character video segments loaded:', {
          segment_count: segmentData.segment_count,
          segments_length: segmentData.segments?.length,
          segments_detail: segmentData.segments,
        });
        
        // Update selectedScene with character-specific segment info
        const updatedScene = {
          ...selectedScene,
          segments: segmentData.segments || selectedScene.segments,
          segment_count: segmentData.segment_count || selectedScene.segment_count,
        };
        
        console.log('[CharacterSelect] Updated scene:', {
          segment_count: updatedScene.segment_count,
          segments_length: updatedScene.segments?.length,
        });
        
        setSelectedScene(updatedScene);
        
        // Build video URL for character-specific or base video
        // Use the new /video/file endpoint that serves the actual video file
        const videoUrl = `${apiClientRef.current.getBaseUrl()}/api/storylines/${selectedScene.id}/video/file?character_id=${characterId}`;
        
        console.log('Video URL for recording:', videoUrl);
        
        // Create session with character ID and video URL
        // IMPORTANT: Use updatedScene instead of selectedScene to get the correct segment count
        await createSessionAndStartRecording(
          updatedScene, 
          characterId, 
          videoUrl
        );
      } catch (error) {
        console.warn('[CharacterSelect] Failed to fetch character-specific segments, using base segments:', error);
        
        // Even if fetching fails, still create session with base scene
        const videoUrl = `${apiClientRef.current.getBaseUrl()}/api/storylines/${selectedScene.id}/video/file?character_id=${characterId}`;
        await createSessionAndStartRecording(
          selectedScene, 
          characterId, 
          videoUrl
        );
      }
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
      const context = stateMachineRef.current.getContext();
      console.log('Transitioning to SEGMENT_RECORD with context:', {
        videoPath: context.videoPath,
        characterId: context.characterId,
        sceneId: context.sceneId,
      });
      stateMachineRef.current.transition(AppState.SEGMENT_RECORD);
    }
  };

  // Countdown removed - recording state is now set in RecordingPage

  // Handle recording complete - stop recording and transition to review
  const handleRecordingComplete = (videoBlob?: Blob) => {
    if (recorderRef.current.isRecordingActive()) {
      const segmentData = recorderRef.current.stopRecording();
      
      // Store segment data with video blob
      const recordedSegment: RecordedSegment = {
        ...segmentData,
        videoBlob,
      };
      recordedSegmentsRef.current.push(recordedSegment);
      
      console.log('Recording complete:', {
        index: segmentData.index,
        frames: segmentData.frames.length,
        hasVideo: !!videoBlob,
        videoSize: videoBlob ? `${(videoBlob.size / 1024 / 1024).toFixed(2)} MB` : 'N/A',
      });
      
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

      // Upload the segment with progress tracking (including video blob if available)
      console.log(`Uploading segment ${lastSegment.index} for session ${context.sessionId}`, {
        hasVideo: !!lastSegment.videoBlob,
        videoSize: lastSegment.videoBlob ? `${(lastSegment.videoBlob.size / 1024 / 1024).toFixed(2)} MB` : 'N/A',
      });
      await apiClientRef.current.uploadSegment(
        context.sessionId,
        lastSegment.index,
        apiSegmentData,
        (progress) => {
          setUploadProgress(progress);
        },
        lastSegment.videoBlob // Pass video blob to upload
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
          // Update context with current recorded segments and preserve other fields
          stateMachineRef.current.transition(AppState.SEGMENT_GUIDE, {
            currentSegment: context.currentSegment + 1,
            recordedSegments: [...recordedSegmentsRef.current],
            // Preserve existing context fields
            sessionId: context.sessionId,
            sceneId: context.sceneId,
            characterId: context.characterId,
            videoPath: context.videoPath,
            apiBaseUrl: context.apiBaseUrl,
            videoDuration: context.videoDuration,
            totalSegments: context.totalSegments,
            segments: context.segments, // Preserve segment configurations
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
    
    // 使用displayedState来渲染页面，配合过渡动画
    const stateToRender = displayedState;
    
    switch (stateToRender) {
      case AppState.IDLE:
        return (
          <div className={`page-transition-wrapper ${isTransitioning ? 'exiting' : ''}`}>
            <IdlePage videoElement={videoElement} />
          </div>
        );
      
      case AppState.SCENE_SELECT:
        return (
          <div className="page-transition-wrapper">
            <SceneSelectionPage
              scenes={scenes}
              videoElement={videoElement}
              handPosition={handPosition}
              onSceneSelect={handleSceneSelect}
              apiBaseUrl={apiClientRef.current.getBaseUrl()}
            />
          </div>
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
            characterId={context?.characterId} // 传递角色ID用于皮影人物渲染
            onGuidanceComplete={handleGuidanceComplete}
          />
        );
      
      case AppState.SEGMENT_RECORD:
        // Reconstruct video URL if needed (in case of page refresh)
        let recordingVideoPath = context?.videoPath;
        if (!recordingVideoPath && context?.sceneId && context?.characterId && context?.apiBaseUrl) {
          recordingVideoPath = `${context.apiBaseUrl}/api/storylines/${context.sceneId}/video/file?character_id=${context.characterId}`;
          console.log('Reconstructed video URL from context:', recordingVideoPath);
        } else if (!recordingVideoPath && context?.sceneId && context?.apiBaseUrl) {
          recordingVideoPath = `${context.apiBaseUrl}/api/storylines/${context.sceneId}/video/file`;
          console.log('Reconstructed base video URL from context:', recordingVideoPath);
        }
        
        // Get current segment configuration
        const currentSegmentIndex = context?.currentSegment || 0;
        const segments = context?.segments || [];
        const currentSegmentConfig = segments[currentSegmentIndex];
        const segmentDuration = currentSegmentConfig?.duration || 8; // Fallback to 8 seconds
        const segmentGuidance = currentSegmentConfig?.guidance_text;
        
        console.log('Rendering SEGMENT_RECORD:', {
          videoPath: recordingVideoPath,
          segmentIndex: currentSegmentIndex,
          segmentDuration,
          segmentGuidance,
          totalSegments: segments.length,
        });
        
        return (
          <RecordingPage
            segmentIndex={currentSegmentIndex}
            segmentDuration={segmentDuration}
            segmentStartTime={currentSegmentConfig?.start_time || 0}
            segmentGuidance={segmentGuidance}
            characterId={context?.characterId}
            videoPath={recordingVideoPath}
            playAudio={currentSegmentConfig?.play_audio || false}
            pathConfig={currentSegmentConfig ? {
              offset_start: currentSegmentConfig.offset_start,
              offset_end: currentSegmentConfig.offset_end,
              path_waypoints: currentSegmentConfig.path_waypoints,
              entry_type: currentSegmentConfig.entry_type,
              entry_duration: currentSegmentConfig.entry_duration,
              entry_delay: currentSegmentConfig.entry_delay,
              exit_type: currentSegmentConfig.exit_type,
              exit_duration: currentSegmentConfig.exit_duration,
              exit_delay: currentSegmentConfig.exit_delay,
              // Scale configuration
              scale_mode: currentSegmentConfig.scale_mode,
              scale_start: currentSegmentConfig.scale_start,
              scale_end: currentSegmentConfig.scale_end,
            } : undefined}
            videoElement={videoElement}
            recorder={recorderRef.current}
            onRecordingComplete={handleRecordingComplete}
            onPoseDetected={(callback) => {
              // Set up pose detection callback
              poseCallbackRef.current = callback;
            }}
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
        // Use video duration for auto-reset, with minimum of 10 seconds
        const autoResetSeconds = Math.max(Math.ceil(context?.videoDuration || 30), 10);
        return (
          <FinalResultPage
            videoUrl={videoUrl || context?.videoUrl || ''}
            sessionId={context?.sessionId}
            onReset={handleReset}
            inactivityTimeoutSeconds={autoResetSeconds}
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