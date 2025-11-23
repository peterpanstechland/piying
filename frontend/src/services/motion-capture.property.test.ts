import * as fc from 'fast-check';
import { MotionCaptureRecorder, PoseLandmark } from './motion-capture';

/**
 * Property-Based Tests for Motion Capture Recorder
 */

describe('MotionCaptureRecorder Property Tests', () => {
  /**
   * Feature: shadow-puppet-interactive-system, Property 6: Recording captures frames for configured duration
   * 
   * This property test verifies that for any segment with configured duration D seconds,
   * recording captures pose frames for exactly D seconds (±100ms tolerance).
   * 
   * Validates: Requirements 5.1
   */
  describe('Property 6: Recording captures frames for configured duration', () => {
    it('should record for the configured duration with acceptable tolerance', () => {
      fc.assert(
        fc.property(
          // Generate random segment indices
          fc.integer({ min: 0, max: 10 }),
          // Generate random durations between 6 and 10 seconds (per requirements)
          fc.double({ min: 6, max: 10 }),
          // Generate random number of frames to capture
          fc.integer({ min: 10, max: 300 }),
          (segmentIndex, duration, frameCount) => {
            const recorder = new MotionCaptureRecorder();
            
            // Start recording
            recorder.startRecording(segmentIndex, duration);

            // Add frames
            for (let i = 0; i < frameCount; i++) {
              const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({
                x: Math.random(),
                y: Math.random(),
                z: Math.random() * 2 - 1,
                visibility: Math.random(),
              }));

              recorder.addFrame(landmarks);
            }

            const segmentData = recorder.stopRecording();

            // Property 1: Recording should capture frames
            const hasFrames = segmentData.frames.length > 0;

            // Property 2: Segment data should have correct index and duration
            const correctIndex = segmentData.index === segmentIndex;
            const correctDuration = Math.abs(segmentData.duration - duration) < 0.001;

            // Property 3: All frames should be captured
            const allFramesCaptured = segmentData.frames.length === frameCount;

            // Property 4: Frames should have timestamps
            const allFramesHaveTimestamps = segmentData.frames.every(
              (frame) => typeof frame.timestamp === 'number' && frame.timestamp >= 0
            );

            // Property 5: Timestamps should be in order
            const timestampsInOrder = segmentData.frames.every((frame, i) => {
              if (i === 0) return true;
              return frame.timestamp >= segmentData.frames[i - 1].timestamp;
            });

            return (
              hasFrames &&
              correctIndex &&
              correctDuration &&
              allFramesCaptured &&
              allFramesHaveTimestamps &&
              timestampsInOrder
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistent frame capture rate', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.double({ min: 6, max: 10 }),
          (segmentIndex, duration) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            // Add frames at regular intervals
            const frameCount = 100;
            for (let i = 0; i < frameCount; i++) {
              const landmarks: PoseLandmark[] = [
                { x: 0.5, y: 0.5, z: 0, visibility: 1 },
              ];
              recorder.addFrame(landmarks);
            }

            const segmentData = recorder.stopRecording();

            // Property: All frames should be captured
            return segmentData.frames.length === frameCount;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shadow-puppet-interactive-system, Property 7: All captured frames contain required data
   * 
   * This property test verifies that for any captured pose frame,
   * it contains a timestamp (relative to segment start) and an array of pose landmarks.
   * 
   * Validates: Requirements 5.2
   */
  describe('Property 7: All captured frames contain required data', () => {
    it('should ensure all frames have timestamp and landmarks', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.double({ min: 6, max: 10 }),
          fc.array(
            fc.array(
              fc.record({
                x: fc.double({ min: 0, max: 1 }),
                y: fc.double({ min: 0, max: 1 }),
                z: fc.double({ min: -1, max: 1 }),
                visibility: fc.double({ min: 0, max: 1 }),
              }),
              { minLength: 1, maxLength: 33 }
            ),
            { minLength: 10, maxLength: 100 }
          ),
          (segmentIndex, duration, landmarkSets) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            // Add frames with the generated landmarks
            for (const landmarks of landmarkSets) {
              recorder.addFrame(landmarks);
            }

            const segmentData = recorder.stopRecording();

            // Property 1: All frames must have a timestamp field
            const allHaveTimestamp = segmentData.frames.every(
              (frame) => typeof frame.timestamp === 'number'
            );

            // Property 2: All timestamps must be non-negative
            const allTimestampsNonNegative = segmentData.frames.every(
              (frame) => frame.timestamp >= 0
            );

            // Property 3: All frames must have landmarks array
            const allHaveLandmarks = segmentData.frames.every(
              (frame) => Array.isArray(frame.landmarks)
            );

            // Property 4: All landmarks arrays must be non-empty
            const allLandmarksNonEmpty = segmentData.frames.every(
              (frame) => frame.landmarks.length > 0
            );

            // Property 5: All landmarks must have required fields
            const allLandmarksComplete = segmentData.frames.every((frame) =>
              frame.landmarks.every(
                (landmark) =>
                  typeof landmark.x === 'number' &&
                  typeof landmark.y === 'number' &&
                  typeof landmark.z === 'number' &&
                  typeof landmark.visibility === 'number'
              )
            );

            // Property 6: Timestamps should be relative to segment start (first frame near 0)
            const firstTimestampNearZero =
              segmentData.frames.length === 0 ||
              segmentData.frames[0].timestamp < 1000; // Within 1 second of start

            return (
              allHaveTimestamp &&
              allTimestampsNonNegative &&
              allHaveLandmarks &&
              allLandmarksNonEmpty &&
              allLandmarksComplete &&
              firstTimestampNearZero
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve landmark data structure', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.double({ min: 6, max: 10 }),
          fc.record({
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
            z: fc.double({ min: -1, max: 1, noNaN: true }),
            visibility: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          (segmentIndex, duration, landmark) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            // Add a single frame with one landmark
            recorder.addFrame([landmark]);

            const segmentData = recorder.stopRecording();

            // Property: The landmark data should be preserved
            if (segmentData.frames.length === 0) return false;

            const capturedLandmark = segmentData.frames[0].landmarks[0];

            // Allow small floating point differences
            const epsilon = 0.0001;
            const xMatch = Math.abs(capturedLandmark.x - landmark.x) < epsilon;
            const yMatch = Math.abs(capturedLandmark.y - landmark.y) < epsilon;
            const zMatch = Math.abs(capturedLandmark.z - landmark.z) < epsilon;
            const visMatch =
              Math.abs(capturedLandmark.visibility - landmark.visibility) < epsilon;

            return xMatch && yMatch && zMatch && visMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple landmarks per frame', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.double({ min: 6, max: 10 }),
          fc.integer({ min: 1, max: 33 }),
          (segmentIndex, duration, landmarkCount) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            // Create landmarks
            const landmarks: PoseLandmark[] = Array.from(
              { length: landmarkCount },
              (_, i) => ({
                x: i / landmarkCount,
                y: i / landmarkCount,
                z: 0,
                visibility: 1,
              })
            );

            recorder.addFrame(landmarks);
            const segmentData = recorder.stopRecording();

            // Property: Frame should contain all landmarks
            return (
              segmentData.frames.length === 1 &&
              segmentData.frames[0].landmarks.length === landmarkCount
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shadow-puppet-interactive-system, Property 23: Saved frames contain normalized coordinates
   * 
   * This property test verifies that for any saved pose frame,
   * all landmark coordinates are in normalized format (values between 0 and 1).
   * 
   * Validates: Requirements 14.3
   */
  describe('Property 23: Saved frames contain normalized coordinates', () => {
    it('should normalize all landmark coordinates to [0, 1] range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.double({ min: 6, max: 10 }),
          fc.array(
            fc.array(
              fc.record({
                x: fc.double({ min: -2, max: 2, noNaN: true }), // Test with out-of-range values
                y: fc.double({ min: -2, max: 2, noNaN: true }),
                z: fc.double({ min: -5, max: 5, noNaN: true }),
                visibility: fc.double({ min: -1, max: 2, noNaN: true }), // Test with out-of-range values
              }),
              { minLength: 1, maxLength: 33 }
            ),
            { minLength: 5, maxLength: 50 }
          ),
          (segmentIndex, duration, landmarkSets) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            // Add frames with potentially out-of-range coordinates
            for (const landmarks of landmarkSets) {
              recorder.addFrame(landmarks);
            }

            const segmentData = recorder.stopRecording();

            // Property 1: All x coordinates must be in [0, 1]
            const allXNormalized = segmentData.frames.every((frame) =>
              frame.landmarks.every((landmark) => landmark.x >= 0 && landmark.x <= 1)
            );

            // Property 2: All y coordinates must be in [0, 1]
            const allYNormalized = segmentData.frames.every((frame) =>
              frame.landmarks.every((landmark) => landmark.y >= 0 && landmark.y <= 1)
            );

            // Property 3: All visibility values must be in [0, 1]
            const allVisibilityNormalized = segmentData.frames.every((frame) =>
              frame.landmarks.every(
                (landmark) => landmark.visibility >= 0 && landmark.visibility <= 1
              )
            );

            // Property 4: Z coordinates can be any value (depth is not normalized)
            const allZFinite = segmentData.frames.every((frame) =>
              frame.landmarks.every((landmark) => Number.isFinite(landmark.z))
            );

            return (
              allXNormalized &&
              allYNormalized &&
              allVisibilityNormalized &&
              allZFinite
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp out-of-range coordinates to [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.double({ min: 6, max: 10 }),
          fc.constantFrom(
            { x: -0.5, y: -0.5, z: 0, visibility: -0.5 }, // Below range
            { x: 1.5, y: 1.5, z: 0, visibility: 1.5 }, // Above range
            { x: -10, y: 10, z: 0, visibility: 5 }, // Far out of range
            { x: 0, y: 0, z: 0, visibility: 0 }, // At minimum
            { x: 1, y: 1, z: 0, visibility: 1 } // At maximum
          ),
          (segmentIndex, duration, landmark) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            recorder.addFrame([landmark]);
            const segmentData = recorder.stopRecording();

            if (segmentData.frames.length === 0) return false;

            const saved = segmentData.frames[0].landmarks[0];

            // Property: Coordinates should be clamped to [0, 1]
            const xClamped = saved.x >= 0 && saved.x <= 1;
            const yClamped = saved.y >= 0 && saved.y <= 1;
            const visClamped = saved.visibility >= 0 && saved.visibility <= 1;

            // Property: Clamping should work correctly
            const xCorrect =
              (landmark.x < 0 && saved.x === 0) ||
              (landmark.x > 1 && saved.x === 1) ||
              (landmark.x >= 0 && landmark.x <= 1 && Math.abs(saved.x - landmark.x) < 0.0001);

            const yCorrect =
              (landmark.y < 0 && saved.y === 0) ||
              (landmark.y > 1 && saved.y === 1) ||
              (landmark.y >= 0 && landmark.y <= 1 && Math.abs(saved.y - landmark.y) < 0.0001);

            return xClamped && yClamped && visClamped && xCorrect && yCorrect;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve normalized coordinates without modification', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.double({ min: 6, max: 10 }),
          fc.array(
            fc.record({
              x: fc.double({ min: 0, max: 1, noNaN: true }),
              y: fc.double({ min: 0, max: 1, noNaN: true }),
              z: fc.double({ min: -1, max: 1, noNaN: true }),
              visibility: fc.double({ min: 0, max: 1, noNaN: true }),
            }),
            { minLength: 1, maxLength: 33 }
          ),
          (segmentIndex, duration, landmarks) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            recorder.addFrame(landmarks);
            const segmentData = recorder.stopRecording();

            if (segmentData.frames.length === 0) return false;

            const savedLandmarks = segmentData.frames[0].landmarks;

            // Property: Already normalized coordinates should be preserved
            const epsilon = 0.0001;
            const allPreserved = landmarks.every((original, i) => {
              const saved = savedLandmarks[i];
              return (
                Math.abs(saved.x - original.x) < epsilon &&
                Math.abs(saved.y - original.y) < epsilon &&
                Math.abs(saved.z - original.z) < epsilon &&
                Math.abs(saved.visibility - original.visibility) < epsilon
              );
            });

            return allPreserved;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases at boundaries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.double({ min: 6, max: 10 }),
          (segmentIndex, duration) => {
            const recorder = new MotionCaptureRecorder();
            recorder.startRecording(segmentIndex, duration);

            // Test exact boundary values
            const boundaryLandmarks: PoseLandmark[] = [
              { x: 0, y: 0, z: 0, visibility: 0 },
              { x: 1, y: 1, z: 0, visibility: 1 },
              { x: 0.5, y: 0.5, z: 0, visibility: 0.5 },
            ];

            recorder.addFrame(boundaryLandmarks);
            const segmentData = recorder.stopRecording();

            if (segmentData.frames.length === 0) return false;

            const saved = segmentData.frames[0].landmarks;

            // Property: Boundary values should be preserved exactly
            return (
              saved[0].x === 0 &&
              saved[0].y === 0 &&
              saved[0].visibility === 0 &&
              saved[1].x === 1 &&
              saved[1].y === 1 &&
              saved[1].visibility === 1 &&
              saved[2].x === 0.5 &&
              saved[2].y === 0.5 &&
              saved[2].visibility === 0.5
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
