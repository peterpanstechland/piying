import * as fc from 'fast-check';
import { StateMachine, AppState, SegmentData, PoseFrame } from '../state/state-machine';

/**
 * Property-Based Tests for Segment Review Page Re-record Behavior
 */

describe('SegmentReviewPage Property Tests', () => {
  /**
   * Feature: shadow-puppet-interactive-system, Property 6.2: Re-record discards data and resets
   * 
   * This property test verifies that when User selects re-record option,
   * the System discards current segment data and returns to guidance page for that segment.
   * 
   * Validates: Requirements 6.2
   */
  describe('Property 6.2: Re-record discards data and resets', () => {
    it('should discard current segment data when re-record is selected', () => {
      fc.assert(
        fc.property(
          // Generate random session configuration
          fc.record({
            sessionId: fc.uuid(),
            sceneId: fc.constantFrom('sceneA', 'sceneB', 'sceneC'),
            totalSegments: fc.integer({ min: 2, max: 4 }),
          }),
          // Generate random segment index to re-record
          fc.integer({ min: 0, max: 3 }),
          // Generate random number of frames for the segment
          fc.integer({ min: 10, max: 100 }),
          (sessionConfig, segmentIndex, frameCount) => {
            // Ensure segment index is within bounds
            if (segmentIndex >= sessionConfig.totalSegments) {
              return true; // Skip invalid combinations
            }

            const stateMachine = new StateMachine(AppState.IDLE);

            // Transition to SEGMENT_REVIEW state with recorded segments
            const recordedSegments: SegmentData[] = [];
            
            // Add segments up to and including the current segment
            for (let i = 0; i <= segmentIndex; i++) {
              const frames: PoseFrame[] = Array.from({ length: frameCount }, (_, j) => ({
                timestamp: j * 33.33, // ~30 FPS
                landmarks: Array.from({ length: 33 }, () => ({
                  x: Math.random(),
                  y: Math.random(),
                  z: Math.random() * 2 - 1,
                  visibility: Math.random(),
                })),
              }));

              recordedSegments.push({
                index: i,
                duration: 8.0,
                frames,
              });
            }

            // Set up state machine in SEGMENT_REVIEW state
            stateMachine.transition(AppState.SCENE_SELECT);
            stateMachine.transition(AppState.SEGMENT_GUIDE, {
              sessionId: sessionConfig.sessionId,
              sceneId: sessionConfig.sceneId,
              totalSegments: sessionConfig.totalSegments,
              currentSegment: segmentIndex,
              recordedSegments: recordedSegments,
            });

            // Simulate recording completion and transition to review
            stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
            stateMachine.transition(AppState.SEGMENT_RECORD);
            stateMachine.transition(AppState.SEGMENT_REVIEW);

            // Get state before re-record
            const contextBefore = stateMachine.getContext();
            const segmentCountBefore = contextBefore.recordedSegments.length;

            // Property 1: Should have recorded segments before re-record
            const hasSegmentsBefore = segmentCountBefore > 0;

            // Simulate re-record action: remove last segment and transition back to SEGMENT_GUIDE
            stateMachine.removeLastSegment();
            stateMachine.transition(AppState.SEGMENT_GUIDE);

            // Get state after re-record
            const contextAfter = stateMachine.getContext();
            const segmentCountAfter = contextAfter.recordedSegments.length;

            // Property 2: Segment count should decrease by 1
            const segmentRemoved = segmentCountAfter === segmentCountBefore - 1;

            // Property 3: Should transition back to SEGMENT_GUIDE state
            const correctState = stateMachine.getCurrentState() === AppState.SEGMENT_GUIDE;

            // Property 4: Current segment index should remain the same
            const sameSegmentIndex = contextAfter.currentSegment === segmentIndex;

            // Property 5: Session ID and scene ID should be preserved
            const sessionPreserved = contextAfter.sessionId === sessionConfig.sessionId;
            const scenePreserved = contextAfter.sceneId === sessionConfig.sceneId;

            // Property 6: Total segments should remain unchanged
            const totalSegmentsPreserved = contextAfter.totalSegments === sessionConfig.totalSegments;

            return (
              hasSegmentsBefore &&
              segmentRemoved &&
              correctState &&
              sameSegmentIndex &&
              sessionPreserved &&
              scenePreserved &&
              totalSegmentsPreserved
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain segment index consistency after re-record', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('sceneA', 'sceneB', 'sceneC'),
          fc.integer({ min: 2, max: 4 }),
          fc.integer({ min: 0, max: 3 }),
          (sessionId, sceneId, totalSegments, currentSegment) => {
            // Ensure segment index is within bounds
            if (currentSegment >= totalSegments) {
              return true; // Skip invalid combinations
            }

            const stateMachine = new StateMachine(AppState.IDLE);

            // Build up recorded segments
            const recordedSegments: SegmentData[] = [];
            for (let i = 0; i <= currentSegment; i++) {
              recordedSegments.push({
                index: i,
                duration: 8.0,
                frames: [
                  {
                    timestamp: 0,
                    landmarks: [{ x: 0.5, y: 0.5, z: 0, visibility: 1 }],
                  },
                ],
              });
            }

            // Set up state
            stateMachine.transition(AppState.SCENE_SELECT);
            stateMachine.transition(AppState.SEGMENT_GUIDE, {
              sessionId,
              sceneId,
              totalSegments,
              currentSegment,
              recordedSegments,
            });
            stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
            stateMachine.transition(AppState.SEGMENT_RECORD);
            stateMachine.transition(AppState.SEGMENT_REVIEW);

            // Perform re-record
            stateMachine.removeLastSegment();
            stateMachine.transition(AppState.SEGMENT_GUIDE);

            const context = stateMachine.getContext();

            // Property: After re-record, the segment index should match the segment being re-recorded
            const correctIndex = context.currentSegment === currentSegment;

            // Property: The removed segment should not be in the recorded segments
            const segmentNotPresent = !context.recordedSegments.some(
              (seg) => seg.index === currentSegment
            );

            // Property: All previous segments should still be present
            const previousSegmentsPresent =
              currentSegment === 0 ||
              context.recordedSegments.every((seg) => seg.index < currentSegment);

            return correctIndex && segmentNotPresent && previousSegmentsPresent;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow re-recording the same segment multiple times', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('sceneA', 'sceneB', 'sceneC'),
          fc.integer({ min: 2, max: 4 }),
          fc.integer({ min: 1, max: 5 }), // Number of re-record attempts
          (sessionId, sceneId, totalSegments, reRecordCount) => {
            const stateMachine = new StateMachine(AppState.IDLE);
            const segmentIndex = 0; // Test with first segment

            // Initial setup
            stateMachine.transition(AppState.SCENE_SELECT);
            stateMachine.transition(AppState.SEGMENT_GUIDE, {
              sessionId,
              sceneId,
              totalSegments,
              currentSegment: segmentIndex,
              recordedSegments: [],
            });

            // Perform multiple re-record cycles
            for (let i = 0; i < reRecordCount; i++) {
              // Record segment
              stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
              stateMachine.transition(AppState.SEGMENT_RECORD);

              // Add a segment
              stateMachine.addRecordedSegment({
                index: segmentIndex,
                duration: 8.0,
                frames: [
                  {
                    timestamp: i * 100, // Different timestamp each time
                    landmarks: [{ x: 0.5, y: 0.5, z: 0, visibility: 1 }],
                  },
                ],
              });

              stateMachine.transition(AppState.SEGMENT_REVIEW);

              // Re-record (except on last iteration)
              if (i < reRecordCount - 1) {
                stateMachine.removeLastSegment();
                stateMachine.transition(AppState.SEGMENT_GUIDE);
              }
            }

            const context = stateMachine.getContext();

            // Property 1: After all re-records, should have exactly 1 segment
            const hasOneSegment = context.recordedSegments.length === 1;

            // Property 2: Should be in SEGMENT_REVIEW state after final recording
            const inReviewState = stateMachine.getCurrentState() === AppState.SEGMENT_REVIEW;

            // Property 3: Segment index should still be 0
            const correctIndex = context.currentSegment === segmentIndex;

            return hasOneSegment && inReviewState && correctIndex;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve other segments when re-recording a middle segment', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('sceneA', 'sceneB', 'sceneC'),
          fc.integer({ min: 3, max: 4 }), // Need at least 3 segments
          (sessionId, sceneId, totalSegments) => {
            const stateMachine = new StateMachine(AppState.IDLE);
            const segmentToReRecord = 1; // Re-record middle segment

            // Record first two segments
            const recordedSegments: SegmentData[] = [
              {
                index: 0,
                duration: 8.0,
                frames: [
                  {
                    timestamp: 0,
                    landmarks: [{ x: 0.1, y: 0.1, z: 0, visibility: 1 }],
                  },
                ],
              },
              {
                index: 1,
                duration: 8.0,
                frames: [
                  {
                    timestamp: 0,
                    landmarks: [{ x: 0.2, y: 0.2, z: 0, visibility: 1 }],
                  },
                ],
              },
            ];

            // Set up state at segment 1 review
            stateMachine.transition(AppState.SCENE_SELECT);
            stateMachine.transition(AppState.SEGMENT_GUIDE, {
              sessionId,
              sceneId,
              totalSegments,
              currentSegment: segmentToReRecord,
              recordedSegments,
            });
            stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
            stateMachine.transition(AppState.SEGMENT_RECORD);
            stateMachine.transition(AppState.SEGMENT_REVIEW);

            // Get first segment data before re-record
            const firstSegmentBefore = stateMachine.getContext().recordedSegments[0];

            // Perform re-record
            stateMachine.removeLastSegment();
            stateMachine.transition(AppState.SEGMENT_GUIDE);

            const context = stateMachine.getContext();

            // Property 1: First segment should still be present
            const firstSegmentPresent = context.recordedSegments.length === 1;

            // Property 2: First segment data should be unchanged
            const firstSegmentUnchanged =
              context.recordedSegments[0].index === firstSegmentBefore.index &&
              context.recordedSegments[0].duration === firstSegmentBefore.duration &&
              context.recordedSegments[0].frames.length === firstSegmentBefore.frames.length;

            // Property 3: Second segment should be removed
            const secondSegmentRemoved = !context.recordedSegments.some(
              (seg) => seg.index === segmentToReRecord
            );

            // Property 4: Current segment should be set to re-record the middle segment
            const correctCurrentSegment = context.currentSegment === segmentToReRecord;

            return (
              firstSegmentPresent &&
              firstSegmentUnchanged &&
              secondSegmentRemoved &&
              correctCurrentSegment
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle re-record on first segment correctly', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('sceneA', 'sceneB', 'sceneC'),
          fc.integer({ min: 2, max: 4 }),
          (sessionId, sceneId, totalSegments) => {
            const stateMachine = new StateMachine(AppState.IDLE);

            // Record first segment
            stateMachine.transition(AppState.SCENE_SELECT);
            stateMachine.transition(AppState.SEGMENT_GUIDE, {
              sessionId,
              sceneId,
              totalSegments,
              currentSegment: 0,
              recordedSegments: [],
            });
            stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
            stateMachine.transition(AppState.SEGMENT_RECORD);

            // Add first segment
            stateMachine.addRecordedSegment({
              index: 0,
              duration: 8.0,
              frames: [
                {
                  timestamp: 0,
                  landmarks: [{ x: 0.5, y: 0.5, z: 0, visibility: 1 }],
                },
              ],
            });

            stateMachine.transition(AppState.SEGMENT_REVIEW);

            // Perform re-record
            stateMachine.removeLastSegment();
            stateMachine.transition(AppState.SEGMENT_GUIDE);

            const context = stateMachine.getContext();

            // Property 1: Should have no recorded segments
            const noSegments = context.recordedSegments.length === 0;

            // Property 2: Should be back at segment 0
            const atFirstSegment = context.currentSegment === 0;

            // Property 3: Should be in SEGMENT_GUIDE state
            const inGuideState = stateMachine.getCurrentState() === AppState.SEGMENT_GUIDE;

            // Property 4: Session and scene should be preserved
            const sessionPreserved = context.sessionId === sessionId;
            const scenePreserved = context.sceneId === sceneId;

            return (
              noSegments &&
              atFirstSegment &&
              inGuideState &&
              sessionPreserved &&
              scenePreserved
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle re-record on last segment correctly', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('sceneA', 'sceneB', 'sceneC'),
          fc.integer({ min: 2, max: 4 }),
          (sessionId, sceneId, totalSegments) => {
            const stateMachine = new StateMachine(AppState.IDLE);
            const lastSegmentIndex = totalSegments - 1;

            // Record all segments
            const recordedSegments: SegmentData[] = Array.from(
              { length: totalSegments },
              (_, i) => ({
                index: i,
                duration: 8.0,
                frames: [
                  {
                    timestamp: 0,
                    landmarks: [{ x: 0.5, y: 0.5, z: 0, visibility: 1 }],
                  },
                ],
              })
            );

            // Set up state at last segment review
            stateMachine.transition(AppState.SCENE_SELECT);
            stateMachine.transition(AppState.SEGMENT_GUIDE, {
              sessionId,
              sceneId,
              totalSegments,
              currentSegment: lastSegmentIndex,
              recordedSegments,
            });
            stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
            stateMachine.transition(AppState.SEGMENT_RECORD);
            stateMachine.transition(AppState.SEGMENT_REVIEW);

            // Perform re-record
            stateMachine.removeLastSegment();
            stateMachine.transition(AppState.SEGMENT_GUIDE);

            const context = stateMachine.getContext();

            // Property 1: Should have totalSegments - 1 recorded segments
            const correctSegmentCount = context.recordedSegments.length === totalSegments - 1;

            // Property 2: Should be at last segment index
            const atLastSegment = context.currentSegment === lastSegmentIndex;

            // Property 3: All previous segments should be present
            const allPreviousPresent = context.recordedSegments.every(
              (seg, i) => seg.index === i
            );

            // Property 4: Last segment should not be present
            const lastSegmentRemoved = !context.recordedSegments.some(
              (seg) => seg.index === lastSegmentIndex
            );

            return (
              correctSegmentCount &&
              atLastSegment &&
              allPreviousPresent &&
              lastSegmentRemoved
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
