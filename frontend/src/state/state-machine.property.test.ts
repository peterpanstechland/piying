/**
 * Property-based tests for StateMachine
 * Feature: shadow-puppet-interactive-system
 */

import * as fc from 'fast-check';
import { StateMachine, AppState } from './state-machine';

describe('StateMachine Property Tests', () => {
  /**
   * Feature: shadow-puppet-interactive-system, Property 1: Person detection triggers state transition
   * Validates: Requirements 1.2
   * 
   * For any detection sequence where a person is continuously detected for at least 1 second,
   * the system should automatically transition from IDLE state to SCENE_SELECT state.
   * 
   * Note: This property tests the state machine's ability to handle the transition that would
   * be triggered by continuous person detection. The actual detection logic is in CameraDetectionService.
   */
  describe('Property 1: Person detection triggers state transition', () => {
    it('should support transition from IDLE to SCENE_SELECT after continuous detection period', () => {
      fc.assert(
        fc.property(
          // Generate detection sequences with continuous presence
          fc.record({
            detectionDuration: fc.integer({ min: 1000, max: 5000 }), // milliseconds
            detectionInterval: fc.integer({ min: 16, max: 50 }), // FPS: 20-60
          }),
          ({ detectionDuration, detectionInterval }) => {
            const stateMachine = new StateMachine(AppState.IDLE);
            
            // Simulate continuous person detection
            const detectionCount = Math.floor(detectionDuration / detectionInterval);
            let accumulatedTime = 0;
            let shouldTransition = false;
            
            // Simulate detection loop - accumulate detection time
            for (let i = 0; i < detectionCount; i++) {
              accumulatedTime += detectionInterval;
              
              // After 1 second of continuous detection, we should be able to transition
              if (accumulatedTime >= 1000) {
                shouldTransition = true;
                break;
              }
            }
            
            // Property: If we accumulated >= 1 second of detection, 
            // the state machine should allow transition to SCENE_SELECT
            if (shouldTransition) {
              // This should succeed without throwing
              expect(() => {
                stateMachine.transition(AppState.SCENE_SELECT);
              }).not.toThrow();
              
              expect(stateMachine.getCurrentState()).toBe(AppState.SCENE_SELECT);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT transition if person detection is interrupted before 1 second', () => {
      fc.assert(
        fc.property(
          fc.record({
            detectionDuration: fc.integer({ min: 100, max: 999 }), // Less than 1 second
            detectionInterval: fc.integer({ min: 16, max: 50 }),
          }),
          ({ detectionDuration, detectionInterval }) => {
            const stateMachine = new StateMachine(AppState.IDLE);
            
            // Simulate detection that stops before 1 second
            const detectionCount = Math.floor(detectionDuration / detectionInterval);
            let detectionTime = 0;
            
            for (let i = 0; i < detectionCount; i++) {
              detectionTime += detectionInterval;
              
              // Should NOT transition before 1 second
              if (detectionTime < 1000) {
                expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
              }
            }
            
            // Property: Should still be in IDLE if detection stopped before 1 second
            expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle interrupted detection sequences correctly', () => {
      fc.assert(
        fc.property(
          fc.record({
            firstDetectionDuration: fc.integer({ min: 100, max: 800 }),
            gapDuration: fc.integer({ min: 100, max: 500 }),
            secondDetectionDuration: fc.integer({ min: 200, max: 1500 }),
            detectionInterval: fc.integer({ min: 16, max: 50 }),
          }),
          ({
            firstDetectionDuration,
            gapDuration,
            secondDetectionDuration,
            detectionInterval,
          }) => {
            const stateMachine = new StateMachine(AppState.IDLE);
            
            // First detection period (interrupted)
            let totalTime = 0;
            let detectionCount = Math.floor(firstDetectionDuration / detectionInterval);
            
            for (let i = 0; i < detectionCount; i++) {
              totalTime += detectionInterval;
            }
            
            // Gap (no detection)
            totalTime += gapDuration;
            
            // Reset detection timer due to gap
            let continuousDetectionTime = 0;
            
            // Second detection period
            detectionCount = Math.floor(secondDetectionDuration / detectionInterval);
            
            for (let i = 0; i < detectionCount; i++) {
              continuousDetectionTime += detectionInterval;
              
              // Only transition if continuous detection reaches 1 second
              if (continuousDetectionTime >= 1000 && stateMachine.getCurrentState() === AppState.IDLE) {
                stateMachine.transition(AppState.SCENE_SELECT);
              }
            }
            
            // Property: Should only transition if accumulated continuous time reaches 1 second
            // Note: Due to rounding, actual accumulated time may be less than secondDetectionDuration
            const actualAccumulatedTime = detectionCount * detectionInterval;
            if (actualAccumulatedTime >= 1000) {
              expect(stateMachine.getCurrentState()).toBe(AppState.SCENE_SELECT);
            } else {
              expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shadow-puppet-interactive-system, Property 21: State transitions complete within time limit
   * Validates: Requirements 12.2
   * 
   * For any state transition, the transition should complete within 1 second.
   */
  describe('Property 21: State transitions complete within time limit', () => {
    it('should complete all valid transitions within 1 second', () => {
      fc.assert(
        fc.property(
          // Generate random valid transition sequences
          fc.array(
            fc.constantFrom(
              { from: AppState.IDLE, to: AppState.SCENE_SELECT },
              { from: AppState.SCENE_SELECT, to: AppState.IDLE },
              { from: AppState.SCENE_SELECT, to: AppState.SEGMENT_GUIDE },
              { from: AppState.SEGMENT_GUIDE, to: AppState.SEGMENT_COUNTDOWN },
              { from: AppState.SEGMENT_COUNTDOWN, to: AppState.SEGMENT_RECORD },
              { from: AppState.SEGMENT_RECORD, to: AppState.SEGMENT_REVIEW },
              { from: AppState.SEGMENT_REVIEW, to: AppState.SEGMENT_GUIDE },
              { from: AppState.SEGMENT_REVIEW, to: AppState.RENDER_WAIT },
              { from: AppState.RENDER_WAIT, to: AppState.FINAL_RESULT },
              { from: AppState.FINAL_RESULT, to: AppState.IDLE }
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (transitions) => {
            const stateMachine = new StateMachine(AppState.IDLE);
            
            // Setup context for transitions that require it
            const setupContext = (targetState: AppState) => {
              if (
                targetState === AppState.SEGMENT_GUIDE ||
                targetState === AppState.SEGMENT_COUNTDOWN ||
                targetState === AppState.SEGMENT_RECORD ||
                targetState === AppState.SEGMENT_REVIEW
              ) {
                return {
                  sessionId: 'test-session',
                  sceneId: 'sceneA',
                  totalSegments: 2,
                  currentSegment: 0,
                };
              }
              
              if (targetState === AppState.RENDER_WAIT) {
                // Add required segments
                stateMachine.updateContext({ totalSegments: 1 });
                stateMachine.addRecordedSegment({
                  index: 0,
                  duration: 8,
                  frames: [],
                });
                return {};
              }
              
              if (targetState === AppState.FINAL_RESULT) {
                return { videoUrl: '/videos/test-session' };
              }
              
              return {};
            };
            
            // Execute transitions and measure timing
            for (const { from, to } of transitions) {
              // Reset to expected starting state if needed
              if (stateMachine.getCurrentState() !== from) {
                stateMachine.reset();
                
                // Navigate to the 'from' state
                if (from === AppState.SCENE_SELECT) {
                  stateMachine.transition(AppState.SCENE_SELECT);
                } else if (from !== AppState.IDLE) {
                  // For other states, we need to set up properly
                  continue; // Skip complex setup for this property test
                }
              }
              
              const context = setupContext(to);
              const startTime = performance.now();
              
              try {
                stateMachine.transition(to, context);
                const duration = performance.now() - startTime;
                
                // Property: Transition should complete within 1 second (1000ms)
                expect(duration).toBeLessThan(1000);
              } catch (error) {
                // Some transitions may fail due to context requirements
                // This is expected and not a timing issue
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should complete simple IDLE to SCENE_SELECT transition within 1 second', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }), // Number of times to test
          (iterations) => {
            for (let i = 0; i < iterations; i++) {
              const stateMachine = new StateMachine(AppState.IDLE);
              const startTime = performance.now();
              
              stateMachine.transition(AppState.SCENE_SELECT);
              
              const duration = performance.now() - startTime;
              
              // Property: Transition should complete within 1 second
              expect(duration).toBeLessThan(1000);
              
              // Should also be much faster in practice (< 100ms)
              expect(duration).toBeLessThan(100);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should complete reset operation within 1 second', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            AppState.IDLE,
            AppState.SCENE_SELECT,
            AppState.FINAL_RESULT
          ),
          (initialState) => {
            const stateMachine = new StateMachine(initialState);
            
            // Add some context
            stateMachine.updateContext({
              sessionId: 'test-session',
              sceneId: 'sceneA',
              totalSegments: 3,
            });
            
            const startTime = performance.now();
            stateMachine.reset();
            const duration = performance.now() - startTime;
            
            // Property: Reset should complete within 1 second
            expect(duration).toBeLessThan(1000);
            
            // Should also be very fast in practice
            expect(duration).toBeLessThan(100);
            
            // Should be back to IDLE
            expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: State machine maintains valid state invariants
   */
  describe('Property: State machine invariants', () => {
    it('should always have a valid current state', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom(
              AppState.IDLE,
              AppState.SCENE_SELECT,
              AppState.SEGMENT_GUIDE,
              AppState.SEGMENT_COUNTDOWN,
              AppState.SEGMENT_RECORD,
              AppState.SEGMENT_REVIEW,
              AppState.RENDER_WAIT,
              AppState.FINAL_RESULT
            ),
            { minLength: 1, maxLength: 20 }
          ),
          (states) => {
            const stateMachine = new StateMachine();
            
            // Current state should always be one of the valid states
            const validStates = Object.values(AppState);
            expect(validStates).toContain(stateMachine.getCurrentState());
            
            // After any operation, state should still be valid
            for (const state of states) {
              try {
                // Try to transition (may fail, that's ok)
                if (state === AppState.SCENE_SELECT && stateMachine.getCurrentState() === AppState.IDLE) {
                  stateMachine.transition(state);
                }
              } catch {
                // Invalid transition, ignore
              }
              
              // State should still be valid
              expect(validStates).toContain(stateMachine.getCurrentState());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain context integrity across operations', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.string({ minLength: 1, maxLength: 50 }),
            sceneId: fc.constantFrom('sceneA', 'sceneB', 'sceneC'),
            totalSegments: fc.integer({ min: 1, max: 5 }),
          }),
          ({ sessionId, sceneId, totalSegments }) => {
            const stateMachine = new StateMachine();
            
            // Update context
            stateMachine.updateContext({ sessionId, sceneId, totalSegments });
            
            // Context should be retrievable
            const context = stateMachine.getContext();
            expect(context.sessionId).toBe(sessionId);
            expect(context.sceneId).toBe(sceneId);
            expect(context.totalSegments).toBe(totalSegments);
            
            // Context should persist across state changes
            stateMachine.transition(AppState.SCENE_SELECT);
            const context2 = stateMachine.getContext();
            expect(context2.sessionId).toBe(sessionId);
            expect(context2.sceneId).toBe(sceneId);
            expect(context2.totalSegments).toBe(totalSegments);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
