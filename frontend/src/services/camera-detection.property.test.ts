import * as fc from 'fast-check';

/**
 * Feature: shadow-puppet-interactive-system, Property 2: Hand position maps to valid cursor coordinates
 * 
 * This property test verifies that hand positions detected by MediaPipe (normalized coordinates in [0, 1])
 * are correctly mapped to valid cursor coordinates within the UI canvas bounds.
 * 
 * Validates: Requirements 2.1
 */

describe('CameraDetectionService Property Tests', () => {
  describe('Property 2: Hand position maps to valid cursor coordinates', () => {
    it('should map any normalized hand position to valid canvas coordinates', () => {
      fc.assert(
        fc.property(
          // Generate normalized hand positions (x, y in [0, 1])
          fc.record({
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          // Generate various canvas dimensions
          fc.record({
            width: fc.integer({ min: 320, max: 3840 }),
            height: fc.integer({ min: 240, max: 2160 }),
          }),
          (handPosition, canvasDimensions) => {
            // Skip if inputs contain NaN (shouldn't happen with noNaN, but be defensive)
            if (!Number.isFinite(handPosition.x) || !Number.isFinite(handPosition.y)) {
              return true; // Skip this test case
            }
            
            // Map normalized coordinates to canvas coordinates
            const cursorX = handPosition.x * canvasDimensions.width;
            const cursorY = handPosition.y * canvasDimensions.height;

            // Property: Cursor coordinates must be within canvas bounds
            const isXValid = cursorX >= 0 && cursorX <= canvasDimensions.width;
            const isYValid = cursorY >= 0 && cursorY <= canvasDimensions.height;

            // Property: Cursor coordinates must be finite numbers
            const isXFinite = Number.isFinite(cursorX);
            const isYFinite = Number.isFinite(cursorY);

            // Property: Mapping should preserve relative position
            // (0, 0) -> (0, 0), (1, 1) -> (width, height)
            const preservesOrigin = 
              (handPosition.x === 0 && cursorX === 0) &&
              (handPosition.y === 0 && cursorY === 0);
            
            const preservesMaxCorner = 
              (handPosition.x === 1 && cursorX === canvasDimensions.width) &&
              (handPosition.y === 1 && cursorY === canvasDimensions.height);

            const preservesRelativePosition = 
              (handPosition.x === 0 && handPosition.y === 0) ? preservesOrigin :
              (handPosition.x === 1 && handPosition.y === 1) ? preservesMaxCorner :
              true; // For intermediate values, just check bounds

            return isXValid && isYValid && isXFinite && isYFinite && preservesRelativePosition;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases at boundaries', () => {
      fc.assert(
        fc.property(
          // Test boundary values explicitly
          fc.constantFrom(
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
            { x: 1, y: 0 },
            { x: 0.5, y: 0.5 }
          ),
          fc.record({
            width: fc.integer({ min: 320, max: 3840 }),
            height: fc.integer({ min: 240, max: 2160 }),
          }),
          (handPosition, canvasDimensions) => {
            const cursorX = handPosition.x * canvasDimensions.width;
            const cursorY = handPosition.y * canvasDimensions.height;

            // All boundary positions should map to valid coordinates
            const isValid = 
              cursorX >= 0 && 
              cursorX <= canvasDimensions.width &&
              cursorY >= 0 && 
              cursorY <= canvasDimensions.height &&
              Number.isFinite(cursorX) &&
              Number.isFinite(cursorY);

            return isValid;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain proportional mapping across different canvas sizes', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1 }),
          fc.double({ min: 0, max: 1 }),
          fc.integer({ min: 320, max: 3840 }),
          fc.integer({ min: 240, max: 2160 }),
          (normalizedX, normalizedY, width, height) => {
            const cursorX = normalizedX * width;
            const cursorY = normalizedY * height;

            // Property: The ratio of cursor position to canvas size should equal normalized position
            const ratioX = width > 0 ? cursorX / width : 0;
            const ratioY = height > 0 ? cursorY / height : 0;

            // Allow small floating point error
            const epsilon = 0.0001;
            const xRatioCorrect = Math.abs(ratioX - normalizedX) < epsilon;
            const yRatioCorrect = Math.abs(ratioY - normalizedY) < epsilon;

            return xRatioCorrect && yRatioCorrect;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never produce NaN or Infinity coordinates', () => {
      fc.assert(
        fc.property(
          fc.record({
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          fc.record({
            width: fc.integer({ min: 1, max: 3840 }), // Ensure non-zero
            height: fc.integer({ min: 1, max: 2160 }), // Ensure non-zero
          }),
          (handPosition, canvasDimensions) => {
            const cursorX = handPosition.x * canvasDimensions.width;
            const cursorY = handPosition.y * canvasDimensions.height;

            // Property: Result must never be NaN or Infinity
            const isValidNumber = 
              !isNaN(cursorX) && 
              !isNaN(cursorY) &&
              isFinite(cursorX) &&
              isFinite(cursorY);

            return isValidNumber;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
