/**
 * Property-Based Tests for Exit Confirmation
 * Feature: shadow-puppet-interactive-system, Property 18: Exit confirmation requires additional duration
 * Validates: Requirements 16.3
 */

import * as fc from 'fast-check';
import { PoseLandmark } from './camera-detection';

// Exit gesture and confirmation configuration
const EXIT_GESTURE_DURATION = 3000; // 3 seconds for initial detection (Requirement 16.1)
const EXIT_CONFIRMATION_DURATION = 2000; // Additional 2 seconds for confirmation (Requirement 16.3)
const TOTAL_EXIT_DURATION = EXIT_GESTURE_DURATION + EXIT_CONFIRMATION_DURATION; // 5 seconds total

/**
 * ExitConfirmationManager class to track exit gesture and confirmation
 */
export class ExitConfirmationManager {
  private gestureStartTime: number | null = null;
  private confirmationStartTime: number | null = null;
  private isGestureDetected: boolean = false;
  private isConfirmationActive: boolean = false;

  /**
   * Update with current pose and hand data
   * Returns 'none' | 'gesture_detected' | 'confirmed'
   */
  update(pose: PoseLandmark[], handsAboveHead: number): 'none' | 'gesture_detected' | 'confirmed' {
    const currentTime = Date.now();
    const isExitGesture = this.detectExitGesture(pose, handsAboveHead);

    if (!isExitGesture) {
      // Gesture broken - reset everything
      this.reset();
      return 'none';
    }

    // Start tracking gesture if not already tracking
    if (this.gestureStartTime === null) {
      this.gestureStartTime = currentTime;
    }

    const elapsedSinceGestureStart = currentTime - this.gestureStartTime;

    // Check if initial gesture duration is met (3 seconds)
    if (elapsedSinceGestureStart >= EXIT_GESTURE_DURATION && !this.isGestureDetected) {
      this.isGestureDetected = true;
      this.confirmationStartTime = currentTime;
      this.isConfirmationActive = true;
      return 'gesture_detected';
    }

    // Check if confirmation duration is met (additional 2 seconds)
    if (this.isConfirmationActive && this.confirmationStartTime !== null) {
      const elapsedSinceConfirmationStart = currentTime - this.confirmationStartTime;
      
      if (elapsedSinceConfirmationStart >= EXIT_CONFIRMATION_DURATION) {
        return 'confirmed';
      }
      
      return 'gesture_detected'; // Still in confirmation phase
    }

    return 'none'; // Still in initial gesture phase
  }

  /**
   * Reset all tracking
   */
  reset(): void {
    this.gestureStartTime = null;
    this.confirmationStartTime = null;
    this.isGestureDetected = false;
    this.isConfirmationActive = false;
  }

  /**
   * Get total elapsed time since gesture started
   */
  getTotalElapsedTime(): number {
    if (this.gestureStartTime === null) {
      return 0;
    }
    return Date.now() - this.gestureStartTime;
  }

  /**
   * Get elapsed time in confirmation phase
   */
  getConfirmationElapsedTime(): number {
    if (this.confirmationStartTime === null) {
      return 0;
    }
    return Date.now() - this.confirmationStartTime;
  }

  /**
   * Check if in confirmation phase
   */
  isInConfirmationPhase(): boolean {
    return this.isConfirmationActive;
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
 * Generate a pose with nose landmark
 */
function generatePose(noseY: number): PoseLandmark[] {
  return [
    { x: 0.5, y: noseY, z: 0, visibility: 1.0 }, // Nose at index 0
  ];
}

describe('ExitConfirmationManager Property Tests', () => {
  // Property 18: Exit confirmation requires additional duration
  // For any detected exit gesture, if the gesture is maintained for an additional
  // 2 seconds (5 seconds total), the system should confirm exit

  it('Property 18: Sustained gesture for 5 seconds total confirms exit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random nose Y position
        fc.double({ min: 0.2, max: 0.8 }),
        // Generate frame count for ~5+ seconds at 20 FPS
        fc.integer({ min: 100, max: 150 }),
        async (noseY, frameCount) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(noseY);
          let gestureDetected = false;
          let exitConfirmed = false;
          let gestureDetectionTime: number | null = null;
          let confirmationTime: number | null = null;
          const startTime = Date.now();

          const frameInterval = 50; // ~20 FPS

          for (let i = 0; i < frameCount; i++) {
            const result = manager.update(pose, 2);

            if (result === 'gesture_detected' && !gestureDetected) {
              gestureDetected = true;
              gestureDetectionTime = Date.now() - startTime;
            }

            if (result === 'confirmed' && !exitConfirmed) {
              exitConfirmed = true;
              confirmationTime = Date.now() - startTime;
            }

            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Gesture should be detected after ~3 seconds
          expect(gestureDetected).toBe(true);
          if (gestureDetectionTime !== null) {
            expect(gestureDetectionTime).toBeGreaterThanOrEqual(EXIT_GESTURE_DURATION - 200);
            expect(gestureDetectionTime).toBeLessThanOrEqual(EXIT_GESTURE_DURATION + 500);
          }

          // Property: Exit should be confirmed after ~5 seconds total
          expect(exitConfirmed).toBe(true);
          if (confirmationTime !== null) {
            expect(confirmationTime).toBeGreaterThanOrEqual(TOTAL_EXIT_DURATION - 300);
            expect(confirmationTime).toBeLessThanOrEqual(TOTAL_EXIT_DURATION + 700);
          }

          manager.reset();
        }
      ),
      { numRuns: 5 } // Reduced runs due to time-based nature
    );
  }, 180000); // 3 minute timeout

  it('Property 18.1: Gesture interrupted during confirmation phase does not confirm', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate interruption time during confirmation phase (between 3-5 seconds)
        fc.integer({ min: 3200, max: 4500 }),
        async (interruptTime) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(0.5);
          let exitConfirmed = false;
          const startTime = Date.now();
          const frameInterval = 50;

          // Phase 1: Sustain gesture until interruption
          while (Date.now() - startTime < interruptTime) {
            const result = manager.update(pose, 2);
            if (result === 'confirmed') exitConfirmed = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Phase 2: Interrupt gesture (hands down)
          manager.update(pose, 0);
          await new Promise(resolve => setTimeout(resolve, 100));

          // Property: Exit should NOT be confirmed because gesture was interrupted
          // during confirmation phase
          expect(exitConfirmed).toBe(false);

          manager.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 18.2: Gesture interrupted before confirmation phase does not confirm', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate interruption time before confirmation phase (before 3 seconds)
        fc.integer({ min: 1000, max: 2800 }),
        async (interruptTime) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(0.5);
          let gestureDetected = false;
          let exitConfirmed = false;
          const startTime = Date.now();
          const frameInterval = 50;

          // Phase 1: Sustain gesture until interruption
          while (Date.now() - startTime < interruptTime) {
            const result = manager.update(pose, 2);
            if (result === 'gesture_detected') gestureDetected = true;
            if (result === 'confirmed') exitConfirmed = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Phase 2: Interrupt gesture
          manager.update(pose, 0);
          await new Promise(resolve => setTimeout(resolve, 100));

          // Property: Gesture should not be detected and exit should not be confirmed
          expect(gestureDetected).toBe(false);
          expect(exitConfirmed).toBe(false);

          manager.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 18.3: Confirmation requires exactly 2 additional seconds after detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate durations in confirmation phase but less than 2 seconds
        fc.integer({ min: 3500, max: 4800 }),
        async (duration) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(0.5);
          let gestureDetected = false;
          let exitConfirmed = false;
          const startTime = Date.now();
          const frameInterval = 50;

          // Keep updating until we reach the target duration
          while (Date.now() - startTime < duration) {
            const result = manager.update(pose, 2);
            if (result === 'gesture_detected') gestureDetected = true;
            if (result === 'confirmed') exitConfirmed = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Gesture should be detected
          expect(gestureDetected).toBe(true);

          // Property: Exit should NOT be confirmed before full 5 seconds
          const actualElapsed = Date.now() - startTime;
          if (actualElapsed < TOTAL_EXIT_DURATION - 200) {
            expect(exitConfirmed).toBe(false);
          }

          manager.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 18.4: Confirmation phase starts only after initial gesture detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.2, max: 0.8 }),
        async (noseY) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(noseY);
          const frameInterval = 50;

          // Phase 1: Sustain gesture for 2 seconds (before detection)
          const startTime = Date.now();
          while (Date.now() - startTime < 2000) {
            manager.update(pose, 2);
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Should not be in confirmation phase yet
          expect(manager.isInConfirmationPhase()).toBe(false);

          // Phase 2: Continue for another 1.5 seconds (total 3.5 seconds)
          const phase2Start = Date.now();
          while (Date.now() - phase2Start < 1500) {
            manager.update(pose, 2);
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Should now be in confirmation phase
          expect(manager.isInConfirmationPhase()).toBe(true);

          manager.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 18.5: Confirmation elapsed time increases monotonically', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 15 }),
        async (sampleCount) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(0.5);
          const frameInterval = 50;

          // First, reach confirmation phase (3+ seconds)
          const startTime = Date.now();
          while (Date.now() - startTime < 3500) {
            manager.update(pose, 2);
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Now sample confirmation elapsed time
          const confirmationTimes: number[] = [];
          for (let i = 0; i < sampleCount; i++) {
            manager.update(pose, 2);
            confirmationTimes.push(manager.getConfirmationElapsedTime());
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Property: Confirmation elapsed time should increase monotonically
          for (let i = 1; i < confirmationTimes.length; i++) {
            expect(confirmationTimes[i]).toBeGreaterThanOrEqual(confirmationTimes[i - 1]);
          }

          manager.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 18.6: Reset during confirmation phase clears all state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.2, max: 0.8 }),
        async (noseY) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(0.5);
          const frameInterval = 50;

          // Reach confirmation phase
          const startTime = Date.now();
          while (Date.now() - startTime < 3500) {
            manager.update(pose, 2);
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Verify we're in confirmation phase
          expect(manager.isInConfirmationPhase()).toBe(true);
          expect(manager.getConfirmationElapsedTime()).toBeGreaterThan(0);

          // Reset by lowering hands
          manager.update(pose, 0);

          // Property: All state should be cleared
          expect(manager.isInConfirmationPhase()).toBe(false);
          expect(manager.getTotalElapsedTime()).toBe(0);
          expect(manager.getConfirmationElapsedTime()).toBe(0);
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 18.7: Total elapsed time equals gesture + confirmation time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.2, max: 0.8 }),
        async (noseY) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(noseY);
          const frameInterval = 50;

          // Sustain gesture through confirmation
          const startTime = Date.now();
          while (Date.now() - startTime < 5500) {
            manager.update(pose, 2);
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Total elapsed time should be approximately 5.5 seconds
          const totalElapsed = manager.getTotalElapsedTime();
          expect(totalElapsed).toBeGreaterThanOrEqual(5300);
          expect(totalElapsed).toBeLessThanOrEqual(5800);

          // Property: Confirmation elapsed time should be approximately 2.5 seconds
          const confirmationElapsed = manager.getConfirmationElapsedTime();
          expect(confirmationElapsed).toBeGreaterThanOrEqual(2300);
          expect(confirmationElapsed).toBeLessThanOrEqual(2800);

          manager.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 18.8: Multiple reset cycles work correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 10, maxLength: 30 }),
        (gestureSequence) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(0.5);

          for (const isGestureActive of gestureSequence) {
            if (isGestureActive) {
              manager.update(pose, 2);
            } else {
              manager.update(pose, 0);
            }

            // Property: After any reset, all times should be 0
            if (!isGestureActive) {
              expect(manager.getTotalElapsedTime()).toBe(0);
              expect(manager.getConfirmationElapsedTime()).toBe(0);
              expect(manager.isInConfirmationPhase()).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 18.9: Confirmation cannot be confirmed without initial gesture detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 2500 }),
        async (duration) => {
          const manager = new ExitConfirmationManager();
          const pose = generatePose(0.5);
          let exitConfirmed = false;
          const startTime = Date.now();
          const frameInterval = 50;

          // Sustain gesture for less than 3 seconds
          while (Date.now() - startTime < duration) {
            const result = manager.update(pose, 2);
            if (result === 'confirmed') exitConfirmed = true;
            await new Promise(resolve => setTimeout(resolve, frameInterval));
          }

          // Property: Exit should NOT be confirmed without reaching initial detection
          expect(exitConfirmed).toBe(false);
          expect(manager.isInConfirmationPhase()).toBe(false);

          manager.reset();
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);
});
