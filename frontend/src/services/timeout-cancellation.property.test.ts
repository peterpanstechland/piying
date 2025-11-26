/**
 * Property-Based Tests for Timeout Cancellation
 * Feature: shadow-puppet-interactive-system, Property 16: Timeout cancellation on user return
 * Validates: Requirements 11.5
 */

import * as fc from 'fast-check';
import { AppState } from '../state/state-machine';
import { TimeoutManager, TIMEOUT_CONFIG } from './timeout-manager.property.test';

describe('Timeout Cancellation Property Tests', () => {
  // Property 16: Timeout cancellation on user return
  // For any active timeout countdown, if a person is detected again before
  // the timeout completes, the timeout should be cancelled and the current
  // state should be maintained
  
  it('Property 16: User return cancels timeout and maintains state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random state with timeout
        fc.constantFrom(
          AppState.SCENE_SELECT,
          AppState.SEGMENT_GUIDE,
          AppState.SEGMENT_COUNTDOWN,
          AppState.SEGMENT_RECORD,
          AppState.SEGMENT_REVIEW
        ),
        // Generate random return time (before timeout completes)
        fc.integer({ min: 100, max: 8000 }),
        async (state, returnTime) => {
          const manager = new TimeoutManager();
          let timeoutTriggered = false;
          let warningTriggered = false;
          
          const timeoutDuration = TIMEOUT_CONFIG[state];
          
          // Ensure return time is before timeout
          fc.pre(returnTime < timeoutDuration);

          // Start timeout (simulating person absence)
          manager.startTimeout(
            state,
            () => {
              timeoutTriggered = true;
            },
            () => {
              warningTriggered = true;
            }
          );

          // Verify timeout is active
          expect(manager.isActive()).toBe(true);

          // Wait for return time
          await new Promise(resolve => setTimeout(resolve, returnTime));

          // User returns - cancel timeout
          manager.cancelTimeout();

          // Verify timeout is no longer active
          expect(manager.isActive()).toBe(false);

          // Wait for what would have been the full timeout duration
          await new Promise(resolve => setTimeout(resolve, timeoutDuration - returnTime + 100));

          // Verify timeout was NOT triggered (user returned in time)
          expect(timeoutTriggered).toBe(false);
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 16.1: Reset timeout restarts countdown from beginning', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          AppState.SCENE_SELECT,
          AppState.SEGMENT_GUIDE,
          AppState.SEGMENT_COUNTDOWN,
          AppState.SEGMENT_RECORD,
          AppState.SEGMENT_REVIEW
        ),
        // Generate random reset time (before timeout)
        fc.integer({ min: 100, max: 5000 }),
        async (state, resetTime) => {
          const manager = new TimeoutManager();
          let timeoutTriggered = false;
          let timeoutCount = 0;
          
          const timeoutDuration = TIMEOUT_CONFIG[state];
          
          // Ensure reset time is before timeout
          fc.pre(resetTime < timeoutDuration);

          // Start timeout
          manager.startTimeout(state, () => {
            timeoutTriggered = true;
            timeoutCount++;
          });

          const startTime = Date.now();

          // Wait for reset time
          await new Promise(resolve => setTimeout(resolve, resetTime));

          // Reset timeout (user briefly returns)
          manager.resetTimeout();

          // Wait for original timeout duration from start
          const elapsedSinceStart = Date.now() - startTime;
          const remainingOriginalTime = timeoutDuration - elapsedSinceStart + 100;
          
          if (remainingOriginalTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingOriginalTime));
          }

          // Timeout should NOT have triggered yet (reset extended it)
          expect(timeoutTriggered).toBe(false);

          // Wait for the reset timeout to complete
          await new Promise(resolve => setTimeout(resolve, timeoutDuration + 100));

          // Now timeout should have triggered
          expect(timeoutTriggered).toBe(true);
          expect(timeoutCount).toBe(1);

          // Cleanup
          manager.cancelTimeout();
        }
      ),
      { numRuns: 3 }
    );
  }, 120000);

  it('Property 16.2: Multiple cancellations do not cause errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          AppState.SCENE_SELECT,
          AppState.SEGMENT_GUIDE,
          AppState.SEGMENT_COUNTDOWN,
          AppState.SEGMENT_RECORD,
          AppState.SEGMENT_REVIEW
        ),
        // Generate random number of cancellations
        fc.integer({ min: 1, max: 5 }),
        async (state, cancelCount) => {
          const manager = new TimeoutManager();
          let timeoutTriggered = false;

          // Start timeout
          manager.startTimeout(state, () => {
            timeoutTriggered = true;
          });

          // Wait a bit
          await new Promise(resolve => setTimeout(resolve, 100));

          // Cancel multiple times
          for (let i = 0; i < cancelCount; i++) {
            expect(() => manager.cancelTimeout()).not.toThrow();
          }

          // Verify timeout is not active
          expect(manager.isActive()).toBe(false);

          // Wait to ensure timeout doesn't trigger
          await new Promise(resolve => setTimeout(resolve, 500));

          // Verify timeout was not triggered
          expect(timeoutTriggered).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  }, 60000);

  it('Property 16.3: Cancellation during warning period prevents timeout', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          AppState.SCENE_SELECT,
          AppState.SEGMENT_GUIDE,
          AppState.SEGMENT_COUNTDOWN,
          AppState.SEGMENT_RECORD,
          AppState.SEGMENT_REVIEW
        ),
        async (state) => {
          const manager = new TimeoutManager();
          let timeoutTriggered = false;
          let warningTriggered = false;
          
          const timeoutDuration = TIMEOUT_CONFIG[state];
          
          // Only test states with warning period (timeout > 5 seconds)
          fc.pre(timeoutDuration > 5000);

          // Start timeout
          manager.startTimeout(
            state,
            () => {
              timeoutTriggered = true;
            },
            () => {
              warningTriggered = true;
            }
          );

          // Wait for warning to trigger
          const warningTime = timeoutDuration - 5000;
          await new Promise(resolve => setTimeout(resolve, warningTime + 100));

          // Verify warning was triggered
          expect(warningTriggered).toBe(true);

          // User returns during warning period - cancel timeout
          manager.cancelTimeout();

          // Wait for what would have been the timeout
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Verify timeout was NOT triggered (cancelled during warning)
          expect(timeoutTriggered).toBe(false);
        }
      ),
      { numRuns: 3 }
    );
  }, 120000);

  it('Property 16.4: Elapsed time resets after cancellation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          AppState.SCENE_SELECT,
          AppState.SEGMENT_GUIDE,
          AppState.SEGMENT_COUNTDOWN,
          AppState.SEGMENT_RECORD,
          AppState.SEGMENT_REVIEW
        ),
        fc.integer({ min: 100, max: 2000 }),
        async (state, waitTime) => {
          const manager = new TimeoutManager();

          // Start timeout
          manager.startTimeout(state, () => {});

          // Wait some time
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // Verify elapsed time is approximately wait time
          const elapsedBefore = manager.getElapsedTime();
          expect(elapsedBefore).toBeGreaterThanOrEqual(waitTime - 50);
          expect(elapsedBefore).toBeLessThanOrEqual(waitTime + 200);

          // Cancel timeout
          manager.cancelTimeout();

          // Verify elapsed time is reset to 0
          const elapsedAfter = manager.getElapsedTime();
          expect(elapsedAfter).toBe(0);
        }
      ),
      { numRuns: 10 }
    );
  }, 60000);
});
