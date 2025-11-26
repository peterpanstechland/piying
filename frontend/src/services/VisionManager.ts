import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker,
  PoseLandmarkerResult,
  HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

// Configuration Constants
const VISION_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

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
        // 1. Load the unified WASM runtime ONCE
        const vision = await FilesetResolver.forVisionTasks(VISION_BASE_URL);

        // 2. Initialize Pose (GPU Accelerated)
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // 3. Initialize Hands (GPU Accelerated)
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: HAND_MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        console.log("✅ Vision System Ready.");
      } catch (error) {
        console.error("❌ Vision Init Failed:", error);
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
