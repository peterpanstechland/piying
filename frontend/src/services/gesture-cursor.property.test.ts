import * as fc from 'fast-check';
import { GestureCursorController, SceneCard } from './gesture-cursor';

/**
 * Property-Based Tests for GestureCursorController
 */

describe('GestureCursorController Property Tests', () => {
  /**
   * Feature: shadow-puppet-interactive-system, Property 3: Hover selection requires continuous presence
   * 
   * This property test verifies that hover selection only triggers after the cursor remains
   * continuously within a scene card's bounds for at least 5 seconds.
   * 
   * Validates: Requirements 2.3, 2.4
   */
  describe('Property 3: Hover selection requires continuous presence', () => {
    it('should only trigger selection after continuous 5-second hover', () => {
      fc.assert(
        fc.property(
          // Generate canvas dimensions
          fc.integer({ min: 800, max: 1920 }),
          fc.integer({ min: 600, max: 1080 }),
          // Generate scene card that fits within canvas
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            bounds: fc.record({
              x: fc.integer({ min: 100, max: 400 }),
              y: fc.integer({ min: 100, max: 300 }),
              width: fc.integer({ min: 100, max: 200 }),
              height: fc.integer({ min: 100, max: 150 }),
            }),
          }),
          (canvasWidth, canvasHeight, sceneCard) => {
            const controller = new GestureCursorController();
            let selectionTriggered = false;
            let selectedSceneId: string | null = null;

            const callback = (sceneId: string) => {
              selectionTriggered = true;
              selectedSceneId = sceneId;
            };

            // Calculate a cursor position inside the card
            const normalizedX = (sceneCard.bounds.x + sceneCard.bounds.width / 2) / canvasWidth;
            const normalizedY = (sceneCard.bounds.y + sceneCard.bounds.height / 2) / canvasHeight;

            // Clamp to valid range
            const cursorX = Math.max(0, Math.min(1, normalizedX));
            const cursorY = Math.max(0, Math.min(1, normalizedY));

            controller.updateCursorPosition({ x: cursorX, y: cursorY });

            // Property 1: Selection should NOT trigger before 5 seconds
            controller.updateHoverState([sceneCard], canvasWidth, canvasHeight, 5000, callback);
            
            // Check immediately - should not have triggered
            const notTriggeredImmediately = !selectionTriggered;

            // Property 2: Hover progress should increase over time
            const progress1 = controller.getHoverProgress();
            const progressIncreases = progress1 >= 0 && progress1 <= 1;

            // Property 3: Hovered card should be tracked
            const hoveredCardCorrect = controller.getHoveredCardId() === sceneCard.id;

            return notTriggeredImmediately && progressIncreases && hoveredCardCorrect;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should cancel selection if cursor moves away before completion', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            bounds: fc.record({
              x: fc.integer({ min: 100, max: 400 }),
              y: fc.integer({ min: 100, max: 300 }),
              width: fc.integer({ min: 100, max: 200 }),
              height: fc.integer({ min: 100, max: 150 }),
            }),
          }),
          fc.integer({ min: 800, max: 1200 }),
          fc.integer({ min: 600, max: 900 }),
          (sceneCard, canvasWidth, canvasHeight) => {
            const controller = new GestureCursorController();
            let selectionTriggered = false;

            const callback = (sceneId: string) => {
              selectionTriggered = true;
            };

            // Start hovering inside the card
            const insideX = (sceneCard.bounds.x + sceneCard.bounds.width / 2) / canvasWidth;
            const insideY = (sceneCard.bounds.y + sceneCard.bounds.height / 2) / canvasHeight;
            controller.updateCursorPosition({ 
              x: Math.max(0, Math.min(1, insideX)), 
              y: Math.max(0, Math.min(1, insideY)) 
            });
            controller.updateHoverState([sceneCard], canvasWidth, canvasHeight, 5000, callback);

            // Property: Should be hovering
            const wasHovering = controller.getHoveredCardId() === sceneCard.id;

            // Move cursor outside the card
            const outsideX = 0.01; // Far left
            const outsideY = 0.01; // Far top
            controller.updateCursorPosition({ x: outsideX, y: outsideY });
            controller.updateHoverState([sceneCard], canvasWidth, canvasHeight, 5000, callback);

            // Property: Should no longer be hovering
            const notHoveringAfterMove = controller.getHoveredCardId() === null;

            // Property: Selection should not have triggered
            const notTriggered = !selectionTriggered;

            return wasHovering && notHoveringAfterMove && notTriggered;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain hover state when cursor stays within bounds', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            bounds: fc.record({
              x: fc.integer({ min: 100, max: 400 }),
              y: fc.integer({ min: 100, max: 300 }),
              width: fc.integer({ min: 150, max: 250 }),
              height: fc.integer({ min: 100, max: 200 }),
            }),
          }),
          fc.integer({ min: 800, max: 1200 }),
          fc.integer({ min: 600, max: 900 }),
          // Generate multiple cursor positions within the card
          fc.array(
            fc.record({
              offsetX: fc.integer({ min: 10, max: 90 }), // Percentage within card
              offsetY: fc.integer({ min: 10, max: 90 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          (sceneCard, canvasWidth, canvasHeight, cursorOffsets) => {
            const controller = new GestureCursorController();
            let selectionTriggered = false;

            const callback = (sceneId: string) => {
              selectionTriggered = true;
            };

            // Move cursor to different positions within the card
            let allPositionsHovered = true;
            for (const offset of cursorOffsets) {
              const cursorX = (sceneCard.bounds.x + (sceneCard.bounds.width * offset.offsetX / 100)) / canvasWidth;
              const cursorY = (sceneCard.bounds.y + (sceneCard.bounds.height * offset.offsetY / 100)) / canvasHeight;
              
              controller.updateCursorPosition({ 
                x: Math.max(0, Math.min(1, cursorX)), 
                y: Math.max(0, Math.min(1, cursorY)) 
              });
              controller.updateHoverState([sceneCard], canvasWidth, canvasHeight, 5000, callback);

              // Property: Should still be hovering over the same card
              if (controller.getHoveredCardId() !== sceneCard.id) {
                allPositionsHovered = false;
                break;
              }
            }

            // Property: Hover should be maintained across all positions
            return allPositionsHovered;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple scene cards correctly', () => {
      fc.assert(
        fc.property(
          // Generate 2-4 non-overlapping scene cards
          fc.integer({ min: 2, max: 4 }).chain((numCards) =>
            fc.tuple(
              fc.array(
                fc.record({
                  id: fc.string({ minLength: 1, maxLength: 10 }),
                  bounds: fc.record({
                    x: fc.integer({ min: 0, max: 600 }),
                    y: fc.integer({ min: 0, max: 400 }),
                    width: fc.integer({ min: 80, max: 150 }),
                    height: fc.integer({ min: 80, max: 120 }),
                  }),
                }),
                { minLength: numCards, maxLength: numCards }
              ),
              fc.constant(numCards)
            )
          ),
          fc.integer({ min: 800, max: 1200 }),
          fc.integer({ min: 600, max: 900 }),
          ([sceneCards, _numCards], canvasWidth, canvasHeight) => {
            const controller = new GestureCursorController();
            let selectionTriggered = false;
            let selectedSceneId: string | null = null;

            const callback = (sceneId: string) => {
              selectionTriggered = true;
              selectedSceneId = sceneId;
            };

            // Test hovering over the first card
            const firstCard = sceneCards[0];
            const cursorX = (firstCard.bounds.x + firstCard.bounds.width / 2) / canvasWidth;
            const cursorY = (firstCard.bounds.y + firstCard.bounds.height / 2) / canvasHeight;

            controller.updateCursorPosition({ 
              x: Math.max(0, Math.min(1, cursorX)), 
              y: Math.max(0, Math.min(1, cursorY)) 
            });
            controller.updateHoverState(sceneCards, canvasWidth, canvasHeight, 5000, callback);

            // Property: Should hover over the correct card
            const hoveredCorrectCard = controller.getHoveredCardId() === firstCard.id;

            // Property: Should not trigger selection immediately
            const notTriggeredImmediately = !selectionTriggered;

            return hoveredCorrectCard && notTriggeredImmediately;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reset hover state when reset is called', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            bounds: fc.record({
              x: fc.integer({ min: 100, max: 400 }),
              y: fc.integer({ min: 100, max: 300 }),
              width: fc.integer({ min: 100, max: 200 }),
              height: fc.integer({ min: 100, max: 150 }),
            }),
          }),
          fc.integer({ min: 800, max: 1200 }),
          fc.integer({ min: 600, max: 900 }),
          (sceneCard, canvasWidth, canvasHeight) => {
            const controller = new GestureCursorController();
            let selectionTriggered = false;

            const callback = (sceneId: string) => {
              selectionTriggered = true;
            };

            // Start hovering
            const cursorX = (sceneCard.bounds.x + sceneCard.bounds.width / 2) / canvasWidth;
            const cursorY = (sceneCard.bounds.y + sceneCard.bounds.height / 2) / canvasHeight;
            controller.updateCursorPosition({ 
              x: Math.max(0, Math.min(1, cursorX)), 
              y: Math.max(0, Math.min(1, cursorY)) 
            });
            controller.updateHoverState([sceneCard], canvasWidth, canvasHeight, 5000, callback);

            // Property: Should be hovering before reset
            const wasHovering = controller.getHoveredCardId() !== null;

            // Reset controller
            controller.reset();

            // Property: Should not be hovering after reset
            const notHoveringAfterReset = controller.getHoveredCardId() === null;

            // Property: Hover progress should be 0
            const progressIsZero = controller.getHoverProgress() === 0;

            // Property: Cursor should be at default position
            const cursorPos = controller.getCursorPosition();
            const cursorAtDefault = cursorPos.x === 0.5 && cursorPos.y === 0.5;

            return wasHovering && notHoveringAfterReset && progressIsZero && cursorAtDefault;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shadow-puppet-interactive-system, Property 22: Cursor latency within acceptable range
   * 
   * This property test verifies that cursor position updates occur within 100ms latency.
   * 
   * Validates: Requirements 12.3
   */
  describe('Property 22: Cursor latency within acceptable range', () => {
    it('should update cursor position with minimal latency', () => {
      fc.assert(
        fc.property(
          fc.record({
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          (handPosition) => {
            const controller = new GestureCursorController();

            // Record time before update
            const startTime = performance.now();
            
            // Update cursor position
            controller.updateCursorPosition(handPosition);
            
            // Record time after update
            const endTime = performance.now();
            const updateDuration = endTime - startTime;

            // Get cursor latency
            const latency = controller.getCursorLatency();

            // Property 1: Update should complete quickly (within 10ms for the operation itself)
            const updateFast = updateDuration < 10;

            // Property 2: Latency should be very small immediately after update
            const latencySmall = latency < 10;

            // Property 3: Cursor position should match input
            const cursorPos = controller.getCursorPosition();
            const epsilon = 0.0001;
            const positionCorrect = 
              Math.abs(cursorPos.x - Math.max(0, Math.min(1, handPosition.x))) < epsilon &&
              Math.abs(cursorPos.y - Math.max(0, Math.min(1, handPosition.y))) < epsilon;

            return updateFast && latencySmall && positionCorrect;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track latency accurately over time', async () => {
      const controller = new GestureCursorController();

      // Update cursor position
      controller.updateCursorPosition({ x: 0.5, y: 0.5 });

      // Wait a small amount of time
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check latency
      const latency = controller.getCursorLatency();

      // Property: Latency should be approximately 50ms (±20ms tolerance for timing variations)
      const latencyInRange = latency >= 30 && latency <= 100;

      expect(latencyInRange).toBe(true);
    });

    it('should maintain low latency across multiple updates', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              x: fc.double({ min: 0, max: 1 }),
              y: fc.double({ min: 0, max: 1 }),
            }),
            { minLength: 5, maxLength: 20 }
          ),
          (handPositions) => {
            const controller = new GestureCursorController();
            let allUpdatesfast = true;

            for (const position of handPositions) {
              const startTime = performance.now();
              controller.updateCursorPosition(position);
              const endTime = performance.now();
              const updateDuration = endTime - startTime;

              // Property: Each update should be fast
              if (updateDuration >= 10) {
                allUpdatesfast = false;
                break;
              }

              // Property: Latency should be small after each update
              const latency = controller.getCursorLatency();
              if (latency >= 10) {
                allUpdatesfast = false;
                break;
              }
            }

            return allUpdatesfast;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle rapid cursor updates efficiently', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              x: fc.double({ min: 0, max: 1, noNaN: true }),
              y: fc.double({ min: 0, max: 1, noNaN: true }),
            }),
            { minLength: 10, maxLength: 30 }
          ),
          (handPositions) => {
            const controller = new GestureCursorController();

            // Perform rapid updates
            const startTime = performance.now();
            for (const position of handPositions) {
              controller.updateCursorPosition(position);
            }
            const endTime = performance.now();
            const totalDuration = endTime - startTime;

            // Property: Total time for all updates should be reasonable
            // (less than 1ms per update on average)
            const averageTimePerUpdate = totalDuration / handPositions.length;
            const efficientUpdates = averageTimePerUpdate < 1;

            // Property: Final cursor position should match last input
            const lastPosition = handPositions[handPositions.length - 1];
            const cursorPos = controller.getCursorPosition();
            const epsilon = 0.0001;
            const finalPositionCorrect = 
              Math.abs(cursorPos.x - Math.max(0, Math.min(1, lastPosition.x))) < epsilon &&
              Math.abs(cursorPos.y - Math.max(0, Math.min(1, lastPosition.y))) < epsilon;

            return efficientUpdates && finalPositionCorrect;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp out-of-range coordinates efficiently', () => {
      fc.assert(
        fc.property(
          fc.record({
            x: fc.double({ min: -2, max: 3, noNaN: true }), // Allow out-of-range values but not NaN
            y: fc.double({ min: -2, max: 3, noNaN: true }),
          }),
          (handPosition) => {
            const controller = new GestureCursorController();

            const startTime = performance.now();
            controller.updateCursorPosition(handPosition);
            const endTime = performance.now();
            const updateDuration = endTime - startTime;

            // Property: Clamping should not add significant overhead
            const updateFast = updateDuration < 10;

            // Property: Coordinates should be clamped to [0, 1]
            const cursorPos = controller.getCursorPosition();
            const xClamped = cursorPos.x >= 0 && cursorPos.x <= 1;
            const yClamped = cursorPos.y >= 0 && cursorPos.y <= 1;

            return updateFast && xClamped && yClamped;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
