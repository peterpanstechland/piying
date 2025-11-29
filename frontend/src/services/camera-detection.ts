import { VisionManager } from './VisionManager';
import type { PoseLandmarkerResult, HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PersonDetection {
  pose: PoseLandmark[];
  centerX: number;
  centerY: number;
  distanceFromCenter: number;
}

export interface DetectionResult {
  presence: boolean;
  rightHand?: { x: number; y: number };
  pose?: PoseLandmark[];
  exitGesture: boolean;
  multiPerson: boolean;
  allPersons: PersonDetection[];
  trackedPersonIndex: number;
}

export type DetectionCallback = (result: DetectionResult) => void;

export class CameraDetectionService {
  private videoElement: HTMLVideoElement | null = null;
  private visionManager: VisionManager | null = null;
  private callback: DetectionCallback | null = null;
  private isInitialized = false;
  private isDetecting = false;
  
  // Detection state
  private lastPoseResult: PoseLandmarkerResult | null = null;
  private lastHandsResult: HandLandmarkerResult | null = null;
  
  // Animation frame loop
  private animationFrameId: number | null = null;
  
  // Multi-person tracking state
  private trackedPersonIndex: number = -1;
  private isRecording: boolean = false;
  private recordingStartPersonIndex: number = -1;
  
  // Performance optimization
  private lastCallbackTime: number = 0;
  private callbackThrottleMs: number = 33; // ~30 FPS max callback rate
  private rafId: number | null = null;
  private pendingCallback: boolean = false;

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
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      document.body.appendChild(this.videoElement);

      // Initialize VisionManager (singleton)
      this.visionManager = VisionManager.getInstance();
      await this.visionManager.initialize();

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      this.videoElement.srcObject = stream;
      
      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        if (this.videoElement) {
          this.videoElement.onloadeddata = () => {
            resolve();
          };
        }
      });
      
      await this.videoElement.play();

      this.isInitialized = true;
      console.log('✅ Camera Detection Service Initialized');
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

    // Start detection loop
    this.startDetectionLoop();
  }

  /**
   * Stop detection
   */
  stopDetection(): void {
    this.isDetecting = false;
    this.callback = null;

    // Stop animation frame loop
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Get video element for rendering
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Set recording state for multi-person tracking persistence
   */
  setRecordingState(isRecording: boolean): void {
    this.isRecording = isRecording;
    if (isRecording) {
      // Lock tracking to current person when recording starts
      this.recordingStartPersonIndex = this.trackedPersonIndex;
    } else {
      // Reset recording person when recording stops
      this.recordingStartPersonIndex = -1;
    }
  }

  /**
   * Get current tracked person index
   */
  getTrackedPersonIndex(): number {
    return this.trackedPersonIndex;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopDetection();
    
    // Cancel any pending RAF callbacks
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop camera stream
    if (this.videoElement) {
      const stream = this.videoElement.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      this.videoElement.remove();
      this.videoElement = null;
    }

    // Note: VisionManager is a singleton, don't cleanup here
    // It will be reused across component remounts
    this.visionManager = null;

    this.isInitialized = false;
    this.trackedPersonIndex = -1;
    this.isRecording = false;
    this.recordingStartPersonIndex = -1;
    this.pendingCallback = false;
  }

  /**
   * Schedule callback processing with throttling
   * Uses requestAnimationFrame for smooth updates
   */
  private scheduleCallbackProcessing(): void {
    if (this.pendingCallback) {
      return; // Already scheduled
    }
    
    this.pendingCallback = true;
    
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.pendingCallback = false;
      
      const now = performance.now();
      const timeSinceLastCallback = now - this.lastCallbackTime;
      
      // Throttle callbacks to maintain target FPS
      if (timeSinceLastCallback >= this.callbackThrottleMs) {
        this.lastCallbackTime = now;
        this.processDetectionResults();
      } else {
        // Schedule next attempt
        this.scheduleCallbackProcessing();
      }
    });
  }

  /**
   * Start the detection loop using requestAnimationFrame
   */
  private startDetectionLoop(): void {
    if (!this.videoElement || !this.visionManager) {
      return;
    }

    let frameCount = 0;
    const skipFrames = 1; // Process every 2nd frame (30 FPS -> 15 FPS detection)

    const loop = () => {
      if (!this.isDetecting || !this.videoElement || !this.visionManager) {
        return;
      }

      frameCount++;
      
      // Skip frames to reduce CPU load
      if (frameCount % (skipFrames + 1) === 0) {
        // Run detection
        const { poseResult, handResult } = this.visionManager.detect(this.videoElement);
        this.lastPoseResult = poseResult;
        this.lastHandsResult = handResult;

        // Schedule throttled callback processing
        this.scheduleCallbackProcessing();
      }

      // Continue loop
      this.animationFrameId = requestAnimationFrame(loop);
    };

    // Start the loop
    this.animationFrameId = requestAnimationFrame(loop);
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
      multiPerson: false,
      allPersons: [],
      trackedPersonIndex: -1,
    };

    // Detect all persons in the frame
    const allPersons = this.detectAllPersons();
    result.allPersons = allPersons;
    result.multiPerson = allPersons.length > 1;

    if (allPersons.length > 0) {
      result.presence = true;

      // Select which person to track
      const trackedIndex = this.selectTrackedPerson(allPersons);
      this.trackedPersonIndex = trackedIndex;
      result.trackedPersonIndex = trackedIndex;

      // Use the tracked person's pose
      if (trackedIndex >= 0 && trackedIndex < allPersons.length) {
        result.pose = allPersons[trackedIndex].pose;
      }

      // Check for exit gesture (both hands above head)
      result.exitGesture = this.detectExitGesture();
    } else {
      // No person detected
      result.presence = false;
      this.trackedPersonIndex = -1;
    }

    // Extract right hand position for cursor control
    if (this.lastHandsResult?.landmarks && this.lastHandsResult.handedness) {
      for (let i = 0; i < this.lastHandsResult.landmarks.length; i++) {
        const handedness = this.lastHandsResult.handedness[i];
        const landmarks = this.lastHandsResult.landmarks[i];

        // Camera is mirrored: user's right hand appears as "Left" in MediaPipe
        // So we look for "Left" to get the actual right hand
        if (handedness[0]?.categoryName === 'Left' && landmarks.length > 0) {
          // Use wrist (landmark 0) or index finger tip (landmark 8) for cursor
          const wrist = landmarks[0];
          const indexTip = landmarks[8];
          
          // Use index finger tip if available, otherwise wrist
          const cursorPoint = indexTip || wrist;
          
          // Mirror the x coordinate for natural interaction
          // When user moves hand right, cursor should move right (like a mirror)
          result.rightHand = {
            x: 1 - cursorPoint.x,  // Mirror horizontally
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
   * Detect all persons in the current frame
   * Note: MediaPipe Pose currently only detects one person per frame
   * This method is structured to support future multi-person detection
   */
  private detectAllPersons(): PersonDetection[] {
    const persons: PersonDetection[] = [];

    if (this.lastPoseResult?.landmarks && this.lastPoseResult.landmarks.length > 0) {
      // Get the first (and typically only) detected pose
      const poseLandmarks = this.lastPoseResult.landmarks[0];
      
      // Convert pose landmarks to our format
      const pose = poseLandmarks.map((landmark: NormalizedLandmark) => ({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z,
        visibility: landmark.visibility || 0,
      }));

      // Calculate center point (average of all visible landmarks)
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (const landmark of pose) {
        if (landmark.visibility > 0.5) {
          sumX += landmark.x;
          sumY += landmark.y;
          count++;
        }
      }

      if (count > 0) {
        const centerX = sumX / count;
        const centerY = sumY / count;

        // Calculate distance from frame center (0.5, 0.5)
        const distanceFromCenter = Math.sqrt(
          Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2)
        );

        persons.push({
          pose,
          centerX,
          centerY,
          distanceFromCenter,
        });
      }
    }

    return persons;
  }

  /**
   * Select which person to track based on current state
   */
  private selectTrackedPerson(allPersons: PersonDetection[]): number {
    if (allPersons.length === 0) {
      return -1;
    }

    // If recording, persist tracking of the original person
    if (this.isRecording && this.recordingStartPersonIndex >= 0) {
      // Check if the originally tracked person is still present
      // Since MediaPipe Pose only detects one person, we assume continuity
      // In a true multi-person system, we'd match by position/features
      if (this.recordingStartPersonIndex < allPersons.length) {
        return this.recordingStartPersonIndex;
      }
      // Original person left, return -1 to indicate tracking lost
      return -1;
    }

    // Not recording: select person closest to center
    if (allPersons.length === 1) {
      return 0;
    }

    let closestIndex = 0;
    let minDistance = allPersons[0].distanceFromCenter;

    for (let i = 1; i < allPersons.length; i++) {
      if (allPersons[i].distanceFromCenter < minDistance) {
        minDistance = allPersons[i].distanceFromCenter;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  /**
   * Detect exit gesture (both hands above head)
   */
  private detectExitGesture(): boolean {
    if (!this.lastPoseResult?.landmarks || !this.lastHandsResult?.landmarks) {
      return false;
    }

    const poseLandmarks = this.lastPoseResult.landmarks;
    const handLandmarks = this.lastHandsResult.landmarks;

    // Get head position (nose landmark, index 0)
    if (poseLandmarks.length === 0 || poseLandmarks[0].length === 0) {
      return false;
    }
    const nose = poseLandmarks[0][0]; // First pose, nose landmark

    // Check if we have at least 2 hands detected
    if (handLandmarks.length < 2) {
      return false;
    }

    // Check if both hands are above the nose
    let handsAboveHead = 0;
    for (const hand of handLandmarks) {
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

  /**
   * Force immediate processing of detection results (for testing)
   * Bypasses throttling and RAF scheduling
   */
  forceProcessResults(): void {
    this.processDetectionResults();
  }
}
