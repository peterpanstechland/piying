import { useEffect, useState, useRef } from 'react';
import { StateMachine, AppState } from './state/state-machine';
import { CameraDetectionService, DetectionResult } from './services/camera-detection';
import { IdlePage, SceneSelectionPage, Scene } from './components';
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
  
  const stateMachineRef = useRef<StateMachine | null>(null);
  const cameraServiceRef = useRef<CameraDetectionService | null>(null);
  const personDetectedTimeRef = useRef<number | null>(null);

  // Initialize state machine
  useEffect(() => {
    stateMachineRef.current = new StateMachine(AppState.IDLE);
    
    // Listen to state changes
    stateMachineRef.current.addListener((state) => {
      setCurrentState(state);
    });

    return () => {
      if (stateMachineRef.current) {
        stateMachineRef.current.reset();
      }
    };
  }, []);

  // Load scenes
  useEffect(() => {
    loadScenes().then(setScenes);
  }, []);

  // Initialize camera and detection
  useEffect(() => {
    const initCamera = async () => {
      try {
        const service = new CameraDetectionService();
        await service.initialize();
        cameraServiceRef.current = service;
        setVideoElement(service.getVideoElement());

        // Start detection
        service.startDetection(handleDetection);
      } catch (error) {
        console.error('Failed to initialize camera:', error);
      }
    };

    initCamera();

    return () => {
      if (cameraServiceRef.current) {
        cameraServiceRef.current.cleanup();
      }
    };
  }, []);

  // Handle detection results
  const handleDetection = (result: DetectionResult) => {
    const currentState = stateMachineRef.current?.getCurrentState();

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
    if (currentState === AppState.SCENE_SELECT && result.rightHand) {
      setHandPosition(result.rightHand);
    } else if (currentState === AppState.SCENE_SELECT && !result.rightHand) {
      setHandPosition(null);
    }

    // Handle person absence timeout
    if (currentState === AppState.SCENE_SELECT && !result.presence) {
      // TODO: Implement timeout logic (10 seconds)
    }
  };

  // Handle scene selection
  const handleSceneSelect = (sceneId: string) => {
    console.log('Scene selected:', sceneId);
    const selectedScene = scenes.find((s) => s.id === sceneId);
    
    if (selectedScene && stateMachineRef.current) {
      // TODO: Create session via API
      // For now, just transition to next state with mock data
      stateMachineRef.current.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'mock-session-id',
        sceneId: sceneId,
        totalSegments: selectedScene.segments.length,
        currentSegment: 0,
      });
    }
  };

  // Render current page based on state
  const renderCurrentPage = () => {
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
          </div>
        );
    }
  };

  return <div className="App">{renderCurrentPage()}</div>;
}

export default App;
