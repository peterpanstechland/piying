/**
 * Property-Based Tests for Timeout Manager
 * Feature: shadow-puppet-interactive-system, Property 15: Inactivity timeout triggers reset
 * Validates: Requirements 11.1, 11.2
 */

import * as fc from 'fast-check';
import { AppState } from '../state/state-machine';

// Timeout configuration for different states
export const TIMEOUT_CONFIG = {
  [AppState.SCENE_SELECT]: 10000, // 10 seconds
  [AppState.SEGMENT_GUIDE]: 15000, // 15 seconds
  [AppState.SEGMENT_COUNTDOWN]: 15000, // 15 seconds
  [AppState.SEGMENT_RECORD]: 15000, // 15 seconds
  [AppState.SEGMENT_REVIEW]: 15000, // 15 seconds
};

// TimeoutManager class to be implemented
export class TimeoutManager {
  private timeoutId: NodeJS.Timeout | null = null;
  private warningTimeoutId: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private currentState: AppState | null = null;
  private onTimeout: (() => void) | null = null;
  private onWarning: ((remainingSeconds: number) => void) | null = null;

  /**
   * Start timeout for a given state
   */
  startTimeout(
    state: AppState,
    onTimeout: () => void,
    onWarning?: (remainingSeconds: number) => void
  ): void {
    this.clearTimeout();
    
    const timeoutDuration = TIMEOUT_CONFIG[state];
    if (!timeoutDuration) {
      return; // No timeout for this state
    }

    this.currentState = state;
    this.onTimeout = onTimeout;
    this.onWarning = onWarning || null;
    this.startTime = Date.now();

    // Set warning timeout (5 seconds before actual timeout)
    const warningDuration = Math.max(0, timeoutDuration - 5000);
    if (warningDuration > 0 && this.onWarning) {
      this.warningTimeoutId = setTimeout(() => {
        if (this.onWarning) {
          this.onWarning(5);
        }
      }, warningDuration);
    }

    // Set actual timeout
    this.timeoutId = setTimeout(() => {
      if (this.onTimeout) {
        this.onTimeout();
      }
    }, timeoutDuration);
  }

  /**
   * Cancel current timeout
   */
  cancelTimeout(): void {
    this.clearTimeout();
  }

  /**
   * Reset timeout (restart from beginning)
   */
  resetTimeout(): void {
    if (this.currentState && this.onTimeout) {
      const state = this.currentState;
      const onTimeout = this.onTimeout;
      const onWarning = this.onWarning;
      this.startTimeout(state, onTimeout, onWarning);
    }
  }

  /**
   * Get elapsed time since timeout started
   */
  getElapsedTime(): number {
    if (this.startTime === 0) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Check if timeout is active
   */
  isActive(): boolean {
    return this.timeoutId !== null;
  }

  /**
   * Clear all timeouts
   */
  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
      this.warningTimeoutId = null;
    }
    this.startTime = 0;
    this.currentState = null;
    this.onTimeout = null;
    this.onWarning = null;
  }
}

describe('TimeoutManager Property Tests', () => {
  // Property 15: Inactivity timeout triggers reset
  // For any state with configured timeout duration T, if no person is detected
  // continuously for T seconds, the system should reset to IDLE state
  
  it('Property 15: Timeout triggers callback after configured duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random states that have timeout configured
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

          // Verify timeout is active
          expect(manager.isActive()).toBe(true);

          // Wait for timeout duration + small buffer
          await new Promise(resolve => setTimeout(resolve, timeoutDuration + 100));

          // Verify timeout was triggered
          expect(timeoutTriggered).toBe(true);
          
          // Verify warning was triggered (for timeouts > 5 seconds)
          if (timeoutDuration > 5000) {
            expect(warningTriggered).toBe(true);
          }

          // Cleanup
          manager.cancelTimeout();
        }
      ),
      { numRuns: 5 } // Reduced runs due to time-based nature
    );
  }, 120000); // 2 minute timeout for test

  it('Property 15.1: Timeout does not trigger if cancelled before duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          AppState.SCENE_SELECT,
          AppState.SEGMENT_GUIDE,
          AppState.SEGMENT_COUNTDOWN,
          AppState.SEGMENT_RECORD,
          AppState.SEGMENT_REVIEW
        ),
        // Generate random cancellation time (before timeout)
        fc.integer({ min: 100, max: 5000 }),
        async (state, cancelTime) => {
          const manager = new TimeoutManager();
          let timeoutTriggered = false;
          
          const timeoutDuration = TIMEOUT_CONFIG[state];
          
          // Only test if cancel time is before timeout
          fc.pre(cancelTime < timeoutDuration);

          // Start timeout
          manager.startTimeout(state, () => {
            timeoutTriggered = true;
          });

          // Wait for cancel time
          await new Promise(resolve => setTimeout(resolve, cancelTime));

          // Cancel timeout
          manager.cancelTimeout();

          // Wait additional time to ensure timeout would have triggered
          await new Promise(resolve => setTimeout(resolve, timeoutDuration - cancelTime + 100));

          // Verify timeout was NOT triggered
          expect(timeoutTriggered).toBe(false);
        }
      ),
      { numRuns: 5 }
    );
  }, 120000);

  it('Property 15.2: Warning triggers 5 seconds before timeout', async () => {
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
          let warningTime: number | null = null;
          let timeoutTime: number | null = null;
          
          const timeoutDuration = TIMEOUT_CONFIG[state];
          
          // Only test states with timeout > 5 seconds
          fc.pre(timeoutDuration > 5000);

          const startTime = Date.now();

          // Start timeout
          manager.startTimeout(
            state,
            () => {
              timeoutTime = Date.now() - startTime;
            },
            () => {
              warningTime = Date.now() - startTime;
            }
          );

          // Wait for timeout to complete
          await new Promise(resolve => setTimeout(resolve, timeoutDuration + 100));

          // Verify warning triggered approximately 5 seconds before timeout
          expect(warningTime).not.toBeNull();
          expect(timeoutTime).not.toBeNull();
          
          if (warningTime && timeoutTime) {
            const timeDifference = timeoutTime - warningTime;
            // Allow 500ms tolerance for timing
            expect(timeDifference).toBeGreaterThanOrEqual(4500);
            expect(timeDifference).toBeLessThanOrEqual(5500);
          }

          // Cleanup
          manager.cancelTimeout();
        }
      ),
      { numRuns: 3 }
    );
  }, 120000);

  it('Property 15.3: Different states have correct timeout durations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          AppState.SCENE_SELECT,
          AppState.SEGMENT_GUIDE,
          AppState.SEGMENT_COUNTDOWN,
          AppState.SEGMENT_RECORD,
          AppState.SEGMENT_REVIEW
        ),
        (state) => {
          const duration = TIMEOUT_CONFIG[state];
          
          // Verify timeout durations match requirements
          if (state === AppState.SCENE_SELECT) {
            expect(duration).toBe(10000); // 10 seconds per Requirement 11.1
          } else {
            expect(duration).toBe(15000); // 15 seconds per Requirement 11.2
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
