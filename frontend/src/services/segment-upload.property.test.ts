/**
 * Property-based tests for segment upload timestamp precision
 * Feature: shadow-puppet-interactive-system, Property 24: Timestamp precision preserved in upload
 * Validates: Requirements 14.4
 */

import fc from 'fast-check';
import { SegmentData } from './api-client';

describe('Segment Upload Property Tests', () => {
  describe('Property 24: Timestamp precision preserved in upload', () => {
    /**
     * For any pose data uploaded to backend, timestamps should preserve millisecond precision
     * (no loss of precision beyond 1ms).
     * 
     * This property verifies that when segment data is serialized and sent to the backend,
     * the timestamp values maintain their precision to the millisecond level.
     */
    it('should preserve timestamp precision to milliseconds in upload', () => {
      fc.assert(
        fc.property(
          // Generate random segment data with precise timestamps
          fc.record({
            index: fc.integer({ min: 0, max: 10 }),
            duration: fc.float({ min: 1, max: 30, noNaN: true }),
            frames: fc.array(
              fc.record({
                // Generate timestamps with millisecond precision
                timestamp: fc.float({ 
                  min: 0, 
                  max: 30000, // 30 seconds in milliseconds
                  noNaN: true,
                  noDefaultInfinity: true
                }),
                landmarks: fc.array(
                  fc.tuple(
                    fc.float({ min: 0, max: 1, noNaN: true }), // x
                    fc.float({ min: 0, max: 1, noNaN: true }), // y
                    fc.float({ min: -1, max: 1, noNaN: true }), // z
                    fc.float({ min: 0, max: 1, noNaN: true })  // visibility
                  ),
                  { minLength: 33, maxLength: 33 } // MediaPipe Pose has 33 landmarks
                )
              }),
              { minLength: 1, maxLength: 300 } // 1-300 frames
            )
          }),
          (segmentData) => {
            // Convert to the format expected by API
            const apiSegmentData: SegmentData = {
              index: segmentData.index,
              duration: segmentData.duration,
              frames: segmentData.frames.map(frame => ({
                timestamp: frame.timestamp,
                landmarks: frame.landmarks
              }))
            };

            // Serialize to JSON (simulating upload)
            const serialized = JSON.stringify(apiSegmentData);
            
            // Deserialize (simulating backend receiving the data)
            const deserialized = JSON.parse(serialized) as SegmentData;

            // Verify timestamp precision is preserved
            for (let i = 0; i < apiSegmentData.frames.length; i++) {
              const originalTimestamp = apiSegmentData.frames[i].timestamp;
              const deserializedTimestamp = deserialized.frames[i].timestamp;
              
              // Calculate precision loss
              const precisionLoss = Math.abs(originalTimestamp - deserializedTimestamp);
              
              // Precision loss should be less than 1ms (accounting for floating point precision)
              // We use 0.001 as the threshold (1 microsecond) to account for floating point representation
              expect(precisionLoss).toBeLessThan(0.001);
              
              // Also verify that the timestamp is exactly equal (no precision loss in JSON serialization)
              expect(deserializedTimestamp).toBe(originalTimestamp);
            }

            // Verify all other data is preserved
            expect(deserialized.index).toBe(apiSegmentData.index);
            expect(deserialized.duration).toBe(apiSegmentData.duration);
            expect(deserialized.frames.length).toBe(apiSegmentData.frames.length);
          }
        ),
        { numRuns: 100 } // Run 100 iterations as specified in design
      );
    });

    it('should preserve timestamp precision for edge case values', () => {
      fc.assert(
        fc.property(
          fc.record({
            index: fc.integer({ min: 0, max: 10 }),
            duration: fc.float({ min: 1, max: 30, noNaN: true }),
            frames: fc.array(
              fc.record({
                // Test edge cases: very small, very large, and precise decimal timestamps
                timestamp: fc.oneof(
                  fc.constant(0), // Start of segment
                  fc.constant(0.001), // 1 millisecond
                  fc.constant(0.999), // Just under 1 second
                  fc.constant(1000.123), // Precise decimal
                  fc.constant(29999.999), // Near end of 30 second segment
                  fc.float({ min: 0, max: 30000, noNaN: true })
                ),
                landmarks: fc.array(
                  fc.tuple(
                    fc.float({ min: 0, max: 1, noNaN: true }),
                    fc.float({ min: 0, max: 1, noNaN: true }),
                    fc.float({ min: -1, max: 1, noNaN: true }),
                    fc.float({ min: 0, max: 1, noNaN: true })
                  ),
                  { minLength: 33, maxLength: 33 }
                )
              }),
              { minLength: 5, maxLength: 50 }
            )
          }),
          (segmentData) => {
            const apiSegmentData: SegmentData = {
              index: segmentData.index,
              duration: segmentData.duration,
              frames: segmentData.frames.map(frame => ({
                timestamp: frame.timestamp,
                landmarks: frame.landmarks
              }))
            };

            // Serialize and deserialize
            const serialized = JSON.stringify(apiSegmentData);
            const deserialized = JSON.parse(serialized) as SegmentData;

            // Verify timestamp precision for all frames
            deserialized.frames.forEach((frame, i) => {
              const originalTimestamp = apiSegmentData.frames[i].timestamp;
              const deserializedTimestamp = frame.timestamp;
              
              // Timestamps should be exactly equal
              expect(deserializedTimestamp).toBe(originalTimestamp);
              
              // Verify precision is maintained (no rounding beyond millisecond)
              const precisionLoss = Math.abs(originalTimestamp - deserializedTimestamp);
              expect(precisionLoss).toBeLessThan(0.001);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain timestamp ordering after serialization', () => {
      fc.assert(
        fc.property(
          fc.record({
            index: fc.integer({ min: 0, max: 10 }),
            duration: fc.float({ min: 1, max: 30, noNaN: true }),
            frames: fc.array(
              fc.record({
                timestamp: fc.float({ min: 0, max: 30000, noNaN: true }),
                landmarks: fc.array(
                  fc.tuple(
                    fc.float({ min: 0, max: 1, noNaN: true }),
                    fc.float({ min: 0, max: 1, noNaN: true }),
                    fc.float({ min: -1, max: 1, noNaN: true }),
                    fc.float({ min: 0, max: 1, noNaN: true })
                  ),
                  { minLength: 33, maxLength: 33 }
                )
              }),
              { minLength: 2, maxLength: 100 }
            )
          }),
          (segmentData) => {
            // Sort frames by timestamp to ensure ordering
            const sortedFrames = [...segmentData.frames].sort((a, b) => a.timestamp - b.timestamp);
            
            const apiSegmentData: SegmentData = {
              index: segmentData.index,
              duration: segmentData.duration,
              frames: sortedFrames.map(frame => ({
                timestamp: frame.timestamp,
                landmarks: frame.landmarks
              }))
            };

            // Serialize and deserialize
            const serialized = JSON.stringify(apiSegmentData);
            const deserialized = JSON.parse(serialized) as SegmentData;

            // Verify timestamp ordering is preserved
            for (let i = 1; i < deserialized.frames.length; i++) {
              const prevTimestamp = deserialized.frames[i - 1].timestamp;
              const currTimestamp = deserialized.frames[i].timestamp;
              
              // Current timestamp should be >= previous timestamp
              expect(currTimestamp).toBeGreaterThanOrEqual(prevTimestamp);
            }

            // Verify exact timestamp values are preserved
            deserialized.frames.forEach((frame, i) => {
              expect(frame.timestamp).toBe(apiSegmentData.frames[i].timestamp);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
