import { Pose, Results as PoseResults, POSE_CONNECTIONS } from '@mediapipe/pose';
import { Hands, Results as HandsResults } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface DetectionResult {
  presence: boolean;
  rightHand?: { x: number; y: number };
  pose?: PoseLandmark[];
  exitGesture: boolean;
}

export type DetectionCallback = (result: DetectionResult) => void;

export class CameraDetectionService {
  private videoElement: HTMLVideoElement | null = null;
  private pose: Pose | null = null;
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private callback: DetectionCallback | null = null;
  private isInitialized = false;
  private isDetecting = false;
  
  // Detection state
  private lastPoseResult: PoseResults | null = null;
  private lastHandsResult: HandsResults | null = null;

  /**
   * Initialize camera and MediaPipe models
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create video element
      this.videoElement = document.createElement('video');
      this.videoElement.style.display = 'none';
      document.body.appendChild(this.videoElement);

      // Initialize MediaPipe Pose
      this.pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        },
      });

      this.pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.pose.onResults((results: PoseResults) => {
        this.lastPoseResult = results;
        this.processDetectionResults();
      });

      // Initialize MediaPipe Hands
      this.hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        },
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.hands.onResults((results: HandsResults) => {
        this.lastHandsResult = results;
        this.processDetectionResults();
      });

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.isInitialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize camera detection: ${errorMessage}`);
    }
  }

  /**
   * Start detection with callback
   */
  startDetection(callback: DetectionCallback): void {
    if (!this.isInitialized) {
      throw new Error('CameraDetectionService not initialized. Call initialize() first.');
    }

    this.callback = callback;
    this.isDetecting = true;

    // Start camera processing
    if (this.videoElement && this.pose && this.hands) {
      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          if (this.videoElement && this.pose && this.hands && this.isDetecting) {
            await this.pose.send({ image: this.videoElement });
            await this.hands.send({ image: this.videoElement });
          }
        },
        width: 1280,
        height: 720,
      });

      this.camera.start();
    }
  }

  /**
   * Stop detection
   */
  stopDetection(): void {
    this.isDetecting = false;
    this.callback = null;

    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
  }

  /**
   * Get video element for rendering
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopDetection();

    if (this.pose) {
      this.pose.close();
      this.pose = null;
    }

    if (this.hands) {
      this.hands.close();
      this.hands = null;
    }

    if (this.videoElement) {
      const stream = this.videoElement.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      this.videoElement.remove();
      this.videoElement = null;
    }

    this.isInitialized = false;
  }

  /**
   * Process detection results and invoke callback
   */
  private processDetectionResults(): void {
    if (!this.callback || !this.isDetecting) {
      return;
    }

    const result: DetectionResult = {
      presence: false,
      rightHand: undefined,
      pose: undefined,
      exitGesture: false,
    };

    // Check for person presence
    if (this.lastPoseResult?.poseLandmarks && this.lastPoseResult.poseLandmarks.length > 0) {
      result.presence = true;
      
      // Convert pose landmarks to our format
      result.pose = this.lastPoseResult.poseLandmarks.map((landmark) => ({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z,
        visibility: landmark.visibility || 0,
      }));

      // Check for exit gesture (both hands above head)
      result.exitGesture = this.detectExitGesture();
    }

    // Extract right hand position for cursor control
    if (this.lastHandsResult?.multiHandLandmarks && this.lastHandsResult.multiHandedness) {
      for (let i = 0; i < this.lastHandsResult.multiHandLandmarks.length; i++) {
        const handedness = this.lastHandsResult.multiHandedness[i];
        const landmarks = this.lastHandsResult.multiHandLandmarks[i];

        // Check if this is the right hand (note: MediaPipe returns mirrored labels)
        if (handedness.label === 'Right' && landmarks.length > 0) {
          // Use wrist (landmark 0) or index finger tip (landmark 8) for cursor
          const wrist = landmarks[0];
          const indexTip = landmarks[8];
          
          // Use index finger tip if available, otherwise wrist
          const cursorPoint = indexTip || wrist;
          
          result.rightHand = {
            x: cursorPoint.x,
            y: cursorPoint.y,
          };
          break;
        }
      }
    }

    // Invoke callback with results
    this.callback(result);
  }

  /**
   * Detect exit gesture (both hands above head)
   */
  private detectExitGesture(): boolean {
    if (!this.lastPoseResult?.poseLandmarks || !this.lastHandsResult?.multiHandLandmarks) {
      return false;
    }

    const pose = this.lastPoseResult.poseLandmarks;
    const hands = this.lastHandsResult.multiHandLandmarks;

    // Get head position (nose landmark, index 0)
    if (pose.length === 0) {
      return false;
    }
    const nose = pose[0];

    // Check if we have at least 2 hands detected
    if (hands.length < 2) {
      return false;
    }

    // Check if both hands are above the nose
    let handsAboveHead = 0;
    for (const hand of hands) {
      if (hand.length > 0) {
        const wrist = hand[0];
        // Y coordinate increases downward, so above means smaller Y
        if (wrist.y < nose.y) {
          handsAboveHead++;
        }
      }
    }

    return handsAboveHead >= 2;
  }
}
