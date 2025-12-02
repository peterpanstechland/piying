import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker,
  PoseLandmarkerResult,
  HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

// Use local files for offline deployment
function getWasmBaseUrl(): string {
  return `${window.location.origin}/mediapipe/wasm`;
}
function getPoseModelUrl(): string {
  return `${window.location.origin}/mediapipe/pose_landmarker_lite.task`;
}
function getHandModelUrl(): string {
  return `${window.location.origin}/mediapipe/hand_landmarker.task`;
}

/**
 * Singleton manager for MediaPipe Vision tasks
 * Prevents "Too Many Players" error by ensuring single initialization
 * Resolves WASM conflicts by using unified FilesetResolver
 */
export class VisionManager {
  private static instance: VisionManager;
  
  public poseLandmarker: PoseLandmarker | null = null;
  public handLandmarker: HandLandmarker | null = null;
  
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  // Private constructor ensures Singleton pattern
  private constructor() {}

  public static getInstance(): VisionManager {
    if (!VisionManager.instance) {
      VisionManager.instance = new VisionManager();
    }
    return VisionManager.instance;
  }

  /**
   * Initialize vision system (idempotent)
   * Returns immediately if already initialized or initializing
   */
  public async initialize(): Promise<void> {
    // Already initialized
    if (this.poseLandmarker && this.handLandmarker) {
      return;
    }

    // Currently initializing - return existing promise
    if (this.isInitializing && this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.isInitializing = true;
    
    this.initializationPromise = (async () => {
      console.log("🚀 Starting Vision System Initialization...");
      
      try {
        const wasmUrl = getWasmBaseUrl();
        const poseUrl = getPoseModelUrl();
        const handUrl = getHandModelUrl();
        
        console.log("📦 Loading MediaPipe WASM from local files...");
        console.log("WASM URL:", wasmUrl);
        console.log("Pose Model URL:", poseUrl);
        console.log("Hand Model URL:", handUrl);
        
        const vision = await FilesetResolver.forVisionTasks(wasmUrl);
        console.log("✅ WASM loaded successfully");

        // 2. Initialize Pose Landmarker
        console.log("🎯 Loading Pose model...");
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: poseUrl,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.log("✅ Pose Landmarker ready");

        // 3. Initialize Hand Landmarker
        console.log("👋 Loading Hand model...");
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: handUrl,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.log("✅ Hand Landmarker ready");

        console.log("🎉 Vision System Ready.");
      } catch (error) {
        console.error("❌ Vision Init Failed:", error);
        console.error("Error details:", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        this.poseLandmarker = null;
        this.handLandmarker = null;
        throw error;
      } finally {
        this.isInitializing = false;
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Detect pose and hands in video frame
   */
  public detect(video: HTMLVideoElement): {
    poseResult: PoseLandmarkerResult | null;
    handResult: HandLandmarkerResult | null;
  } {
    const timestamp = performance.now();
    let poseResult: PoseLandmarkerResult | null = null;
    let handResult: HandLandmarkerResult | null = null;

    if (this.poseLandmarker) {
      poseResult = this.poseLandmarker.detectForVideo(video, timestamp);
    }

    if (this.handLandmarker) {
      handResult = this.handLandmarker.detectForVideo(video, timestamp);
    }

    return { poseResult, handResult };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }

    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }

    this.isInitializing = false;
    this.initializationPromise = null;
  }
}
