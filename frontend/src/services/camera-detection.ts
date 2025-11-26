import { Pose, Results as PoseResults, POSE_CONNECTIONS } from '@mediapipe/pose';
import { Hands, Results as HandsResults } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

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
  private pose: Pose | null = null;
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private callback: DetectionCallback | null = null;
  private isInitialized = false;
  private isDetecting = false;
  
  // Detection state
  private lastPoseResult: PoseResults | null = null;
  private lastHandsResult: HandsResults | null = null;
  
  // Multi-person tracking state
  private trackedPersonIndex: number = -1;
  private isRecording: boolean = false;
  private recordingStartPersonIndex: number = -1;

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
        // Process results immediately when pose is detected
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
        // Process results immediately when hands are detected
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
    this.trackedPersonIndex = -1;
    this.isRecording = false;
    this.recordingStartPersonIndex = -1;
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
   * Detect all persons in the current frame
   * Note: MediaPipe Pose currently only detects one person per frame
   * This method is structured to support future multi-person detection
   */
  private detectAllPersons(): PersonDetection[] {
    const persons: PersonDetection[] = [];

    if (this.lastPoseResult?.poseLandmarks && this.lastPoseResult.poseLandmarks.length > 0) {
      // Convert pose landmarks to our format
      const pose = this.lastPoseResult.poseLandmarks.map((landmark) => ({
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
