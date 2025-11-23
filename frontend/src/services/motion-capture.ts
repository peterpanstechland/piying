/**
 * Motion Capture Recorder Service
 * Handles recording of pose data across multiple segments
 */

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestamp: number; // milliseconds relative to segment start
  landmarks: PoseLandmark[];
}

export interface SegmentData {
  index: number;
  duration: number; // seconds
  frames: PoseFrame[];
}

export type RecordingCallback = (elapsedTime: number, totalDuration: number) => void;

/**
 * MotionCaptureRecorder manages the recording of pose data for motion capture segments
 */
export class MotionCaptureRecorder {
  private isRecording: boolean = false;
  private currentSegmentIndex: number = -1;
  private segmentDuration: number = 0;
  private frames: PoseFrame[] = [];
  private recordingStartTime: number = 0;
  private callback: RecordingCallback | null = null;

  /**
   * Start recording a new segment
   * @param segmentIndex - Index of the segment being recorded (0-based)
   * @param duration - Duration of the segment in seconds
   * @param callback - Optional callback for recording progress updates
   */
  startRecording(
    segmentIndex: number,
    duration: number,
    callback?: RecordingCallback
  ): void {
    if (this.isRecording) {
      throw new Error('Recording already in progress. Stop current recording first.');
    }

    if (segmentIndex < 0) {
      throw new Error('Segment index must be non-negative');
    }

    if (duration <= 0) {
      throw new Error('Duration must be positive');
    }

    this.isRecording = true;
    this.currentSegmentIndex = segmentIndex;
    this.segmentDuration = duration;
    this.frames = [];
    this.recordingStartTime = performance.now();
    this.callback = callback || null;

    console.log(
      `Started recording segment ${segmentIndex} for ${duration} seconds`
    );
  }

  /**
   * Stop recording and return the captured segment data
   * @returns SegmentData containing all captured frames
   */
  stopRecording(): SegmentData {
    if (!this.isRecording) {
      throw new Error('No recording in progress');
    }

    this.isRecording = false;

    const segmentData: SegmentData = {
      index: this.currentSegmentIndex,
      duration: this.segmentDuration,
      frames: [...this.frames],
    };

    console.log(
      `Stopped recording segment ${this.currentSegmentIndex}. Captured ${this.frames.length} frames`
    );

    // Reset state
    this.currentSegmentIndex = -1;
    this.segmentDuration = 0;
    this.frames = [];
    this.recordingStartTime = 0;
    this.callback = null;

    return segmentData;
  }

  /**
   * Add a pose frame to the current recording
   * @param landmarks - Array of pose landmarks
   */
  addFrame(landmarks: PoseLandmark[]): void {
    if (!this.isRecording) {
      return; // Silently ignore frames when not recording
    }

    // Calculate timestamp relative to recording start
    const currentTime = performance.now();
    const timestamp = currentTime - this.recordingStartTime;

    // Validate that landmarks are normalized (coordinates in [0, 1])
    // Handle NaN values by clamping to 0
    const normalizedLandmarks = landmarks.map((landmark) => ({
      x: isNaN(landmark.x) ? 0 : Math.max(0, Math.min(1, landmark.x)),
      y: isNaN(landmark.y) ? 0 : Math.max(0, Math.min(1, landmark.y)),
      z: isNaN(landmark.z) ? 0 : landmark.z,
      visibility: isNaN(landmark.visibility) ? 0 : Math.max(0, Math.min(1, landmark.visibility)),
    }));

    const frame: PoseFrame = {
      timestamp,
      landmarks: normalizedLandmarks,
    };

    this.frames.push(frame);

    // Invoke progress callback if provided
    if (this.callback) {
      const elapsedSeconds = timestamp / 1000;
      this.callback(elapsedSeconds, this.segmentDuration);
    }

    // Auto-stop if duration exceeded
    if (timestamp >= this.segmentDuration * 1000) {
      console.log('Recording duration reached, auto-stopping');
      // Note: We don't auto-stop here to allow the caller to control when to stop
      // The caller should monitor elapsed time and call stopRecording()
    }
  }

  /**
   * Check if currently recording
   */
  isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get the current segment index being recorded
   */
  getCurrentSegmentIndex(): number {
    return this.currentSegmentIndex;
  }

  /**
   * Get the number of frames captured so far
   */
  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * Get elapsed recording time in milliseconds
   */
  getElapsedTime(): number {
    if (!this.isRecording) {
      return 0;
    }
    return performance.now() - this.recordingStartTime;
  }

  /**
   * Get the configured segment duration in seconds
   */
  getSegmentDuration(): number {
    return this.segmentDuration;
  }

  /**
   * Cancel current recording without returning data
   */
  cancelRecording(): void {
    if (!this.isRecording) {
      return;
    }

    console.log(`Cancelled recording segment ${this.currentSegmentIndex}`);

    this.isRecording = false;
    this.currentSegmentIndex = -1;
    this.segmentDuration = 0;
    this.frames = [];
    this.recordingStartTime = 0;
    this.callback = null;
  }
}
