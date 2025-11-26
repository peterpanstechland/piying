/**
 * Property-Based Tests for Exit Gesture Detection
 * Feature: shadow-puppet-interactive-system, Property 17: Exit gesture requires sustained pose
 * Validates: Requirements 16.1
 */

import * as fc from 'fast-check';
import { PoseLandmark } from './camera-detection';

// Exit gesture configuration
const EXIT_GESTURE_DURATION = 3000; // 3 seconds as per Requirement 16.1

/**
 * ExitGestureDetector class to track sustained exit gesture
 */
export class ExitGestureDetector {
  private gestureStartTime: number | null = null;
  private isGestureActive: boolean = false;

  /**
   * Update detection with current pose and hand data
   * Returns true if exit gesture has been sustained for required duration
   */
  update(pose: PoseLandmark[], handsAboveHead: number): boolean {
    const currentTime = Date.now();
    const isExitGesture = this.detectExitGesture(pose, handsAboveHead);

    if (isExitGesture) {
      // Start tracking if not already tracking
      if (this.gestureStartTime === null) {
        this.gestureStartTime = currentTime;
        this.isGestureActive = true;
      }

      // Check if gesture has been sustained for required duration
      const elapsedTime = currentTime - this.gestureStartTime;
      return elapsedTime >= EXIT_GESTURE_DURATION;
    } else {
      // Reset if gesture is broken
      this.reset();
      return false;
    }
  }

  /**
   * Reset gesture tracking
   */
  reset(): void {
    this.gestureStartTime = null;
    this.isGestureActive = false;
  }

  /**
   * Get elapsed time since gesture started
   */
  getElapsedTime(): number {
    if (this.gestureStartTime === null) {
      return 0;
    }
    return Date.now() - this.gestureStartTime;
  }

  /**
   * Check if gesture is currently active (but not necessarily sustained)
   */
  isActive(): boolean {
    return this.isGestureActive;
  }

  /**
   * Detect if current frame shows exit gesture (both hands above head)
   */
  private detectExitGesture(pose: PoseLandmark[], handsAboveHead: number): boolean {
    // Need valid pose data
    if (!pose || pose.length === 0) {
      return false;
    }

    // Need at least 2 hands above head
    if (handsAboveHead < 2) {
      return false;
    }

    return true;
  }
}

/**
 * Helper to simulate detection frames over time
 */
interface DetectionFrame {
  timestamp: number;
  pose: PoseLandmark[];
  handsAboveHead: number;
}

/**
 * Generate a pose with nose landmark
 */
function generatePose(noseY: number): PoseLandmark[] {
  return [
    { x: 0.5, y: noseY, z: 0, visibility: 1.0 }, // Nose at index 0
    // Add other landmarks as needed
  ];
}

describe('ExitGestureDetector Property Tests', () => {
  // Property 17: Exit gesture requires sustained pose
  // For any pose sequence where both hands are raised above head continuously
  // for 3 seconds, the system should detect this as an exit gesture

  it('Property 17: Sustained exit gesture for 3 seconds triggers detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random nose Y position (head position)
        fc.double({ min: 0.2, max: 0.8 }),
        // Generate random number of frames (at ~20 FPS, 3 seconds = ~60 frames)
        fc.integer({ min: 60, max: 100 }),
        async (noseY, frameCount) => {
          const detector = new ExitGestureDetector();
          const pose = generatePose(noseY);
          let detectionTriggered = false;
          let detectionTime: number | null = null;
          const startTime = Date.now();

          // Simulate continuous exit gesture for the duration
          const frameInterval = 50; // ~20 FPS
          
          for (let i = 0; i < frameCount; i++) {
            // Both hands above head (2 hands)
            const result = detector.update(pose, 2);
            
            if (result && !detectionTriggered) {
              detectionTriggered = true;
              detectionTime = Date.now() - startTime;
            }

            // Wait for next frame
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Detection should trigger after 3 seconds
          expect(detectionTriggered).toBe(true);
          
          // Property: Detection time should be approximately 3 seconds (±200ms tolerance)
          if (detectionTime !== null) {
            expect(detectionTime).toBeGreaterThanOrEqual(EXIT_GESTURE_DURATION - 200);
            expect(detectionTime).toBeLessThanOrEqual(EXIT_GESTURE_DURATION + 500);
          }

          detector.reset();
        }
      ),
      { numRuns: 5 } // Reduced runs due to time-based nature
    );
  }, 120000); // 2 minute timeout

  it('Property 17.1: Interrupted gesture does not trigger detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random interruption time (before 3 seconds)
        fc.integer({ min: 500, max: 2500 }),
        // Generate random continuation time after interruption (less than 3 seconds)
        fc.integer({ min: 500, max: 2500 }),
        async (interruptTime, continueTime) => {
          // Ensure continuation time is less than EXIT_GESTURE_DURATION
          fc.pre(continueTime < EXIT_GESTURE_DURATION);
          
          const detector = new ExitGestureDetector();
          const pose = generatePose(0.5);
          let detectionTriggered = false;
          const frameInterval = 50;

          // Phase 1: Gesture active until interruption
          const framesBeforeInterrupt = Math.floor(interruptTime / frameInterval);
          for (let i = 0; i < framesBeforeInterrupt; i++) {
            const result = detector.update(pose, 2);
            if (result) detectionTriggered = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Phase 2: Interrupt gesture (hands down)
          detector.update(pose, 0);
          await new Promise(resolve => setTimeout(resolve, 100));

          // Phase 3: Resume gesture (but not long enough to trigger)
          const framesAfterInterrupt = Math.floor(continueTime / frameInterval);
          for (let i = 0; i < framesAfterInterrupt; i++) {
            const result = detector.update(pose, 2);
            if (result) detectionTriggered = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Detection should NOT trigger because gesture was interrupted
          // and not sustained for full 3 seconds after resuming
          expect(detectionTriggered).toBe(false);

          detector.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 17.2: Less than 2 hands above head does not trigger', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of hands (0 or 1)
        fc.constantFrom(0, 1),
        async (handsAboveHead) => {
          const detector = new ExitGestureDetector();
          const pose = generatePose(0.5);
          let detectionTriggered = false;

          // Simulate sustained pose with insufficient hands for 4 seconds
          const frameInterval = 50;
          const totalFrames = 80; // 4 seconds at 20 FPS

          for (let i = 0; i < totalFrames; i++) {
            const result = detector.update(pose, handsAboveHead);
            if (result) detectionTriggered = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Detection should NOT trigger with less than 2 hands
          expect(detectionTriggered).toBe(false);

          detector.reset();
        }
      ),
      { numRuns: 3 }
    );
  }, 120000);

  it('Property 17.3: No pose data does not trigger detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const detector = new ExitGestureDetector();
          let detectionTriggered = false;

          // Simulate frames with no pose data for 4 seconds
          const frameInterval = 50;
          const totalFrames = 80;

          for (let i = 0; i < totalFrames; i++) {
            const result = detector.update([], 2);
            if (result) detectionTriggered = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Detection should NOT trigger without pose data
          expect(detectionTriggered).toBe(false);

          detector.reset();
        }
      ),
      { numRuns: 3 }
    );
  }, 120000);

  it('Property 17.4: Gesture resets when hands are lowered', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.2, max: 0.8 }),
        async (noseY) => {
          const detector = new ExitGestureDetector();
          const pose = generatePose(noseY);

          // Start gesture
          detector.update(pose, 2);
          expect(detector.isActive()).toBe(true);
          
          // Wait a bit to ensure elapsed time > 0
          await new Promise(resolve => setTimeout(resolve, 100));
          const elapsedBefore = detector.getElapsedTime();
          expect(elapsedBefore).toBeGreaterThan(0);

          // Lower hands
          detector.update(pose, 0);

          // Property: Gesture should be reset
          expect(detector.isActive()).toBe(false);
          expect(detector.getElapsedTime()).toBe(0);
        }
      ),
      { numRuns: 10 }
    );
  }, 30000);

  it('Property 17.5: Elapsed time increases monotonically during sustained gesture', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }),
        async (sampleCount) => {
          const detector = new ExitGestureDetector();
          const pose = generatePose(0.5);
          const elapsedTimes: number[] = [];

          // Sample elapsed time multiple times during sustained gesture
          for (let i = 0; i < sampleCount; i++) {
            detector.update(pose, 2);
            elapsedTimes.push(detector.getElapsedTime());
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Property: Elapsed time should increase monotonically
          for (let i = 1; i < elapsedTimes.length; i++) {
            expect(elapsedTimes[i]).toBeGreaterThanOrEqual(elapsedTimes[i - 1]);
          }

          detector.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 60000);

  it('Property 17.6: Detection requires exactly 3 seconds, not less', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate durations slightly less than 3 seconds
        fc.integer({ min: 2000, max: 2800 }),
        async (duration) => {
          const detector = new ExitGestureDetector();
          const pose = generatePose(0.5);
          let detectionTriggered = false;
          const startTime = Date.now();

          const frameInterval = 50;
          
          // Keep updating until we reach the target duration
          while (Date.now() - startTime < duration) {
            const result = detector.update(pose, 2);
            if (result) detectionTriggered = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Detection should NOT trigger before 3 seconds
          // Allow small tolerance for timing precision
          const actualElapsed = Date.now() - startTime;
          if (actualElapsed < EXIT_GESTURE_DURATION - 100) {
            expect(detectionTriggered).toBe(false);
          }

          detector.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 17.7: Multiple resets work correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 5, maxLength: 20 }),
        (gestureSequence) => {
          const detector = new ExitGestureDetector();
          const pose = generatePose(0.5);

          for (const isGestureActive of gestureSequence) {
            if (isGestureActive) {
              detector.update(pose, 2);
            } else {
              detector.update(pose, 0);
            }

            // Property: After any reset, elapsed time should be 0
            if (!isGestureActive) {
              expect(detector.getElapsedTime()).toBe(0);
              expect(detector.isActive()).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
