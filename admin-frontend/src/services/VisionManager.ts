/**
 * VisionManager - MediaPipe Vision Tasks Manager for Admin Frontend
 * Uses @mediapipe/tasks-vision npm package (same as user frontend)
 */
import {
  FilesetResolver,
  PoseLandmarker,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

// Configuration Constants
const VISION_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/**
 * Singleton manager for MediaPipe Vision tasks
 */
export class VisionManager {
  private static instance: VisionManager;
  
  public poseLandmarker: PoseLandmarker | null = null;
  
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): VisionManager {
    if (!VisionManager.instance) {
      VisionManager.instance = new VisionManager();
    }
    return VisionManager.instance;
  }

  /**
   * Check if initialized
   */
  public isReady(): boolean {
    return this.poseLandmarker !== null;
  }

  /**
   * Initialize vision system (idempotent)
   */
  public async initialize(): Promise<void> {
    if (this.poseLandmarker) {
      return;
    }

    if (this.isInitializing && this.initializationPromise) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    
    this.initializationPromise = (async () => {
      console.log("🚀 Starting Vision System Initialization...");
      
      try {
        const vision = await FilesetResolver.forVisionTasks(VISION_BASE_URL);

        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });

        console.log("✅ Vision System Ready.");
      } catch (error) {
        console.error("❌ Vision Init Failed:", error);
        this.poseLandmarker = null;
        throw error;
      } finally {
        this.isInitializing = false;
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Detect pose in video frame
   */
  public detectPose(video: HTMLVideoElement): PoseLandmarkerResult | null {
    if (!this.poseLandmarker) return null;
    
    const timestamp = performance.now();
    return this.poseLandmarker.detectForVideo(video, timestamp);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
    this.isInitializing = false;
    this.initializationPromise = null;
  }
}

export const visionManager = VisionManager.getInstance();
