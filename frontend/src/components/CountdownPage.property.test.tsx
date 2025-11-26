/**
 * Property-based tests for CountdownPage
 * Feature: shadow-puppet-interactive-system
 */

import * as fc from 'fast-check';
import { waitFor } from '@testing-library/react';
import { CountdownPage } from './CountdownPage';
import { renderWithI18n } from './test-utils';

describe('CountdownPage Property Tests', () => {
  /**
   * Feature: shadow-puppet-interactive-system, Property 5: Countdown triggers automatic recording
   * Validates: Requirements 4.4
   */
  describe('Property 5: Countdown triggers automatic recording', () => {
    it('should trigger onCountdownComplete callback when countdown reaches zero', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (countdownDuration) => {
            let callbackTriggered = false;
            const startTime = Date.now();
            const handleComplete = () => {
              callbackTriggered = true;
            };
            renderWithI18n(
              <CountdownPage
                countdownDuration={countdownDuration}
                onCountdownComplete={handleComplete}
              />
            );
            await waitFor(
              () => expect(callbackTriggered).toBe(true),
              { timeout: countdownDuration * 1000 + 500 }
            );
            const elapsedTime = Date.now() - startTime;
            expect(elapsedTime).toBeGreaterThanOrEqual(countdownDuration * 1000 - 200);
          }
        ),
        { numRuns: 10 }
      );
    }, 60000);

    it('should trigger recording automatically without user interaction', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (countdownDuration) => {
            let automaticTriggerCount = 0;
            const handleComplete = () => {
              automaticTriggerCount++;
            };
            renderWithI18n(
              <CountdownPage
                countdownDuration={countdownDuration}
                onCountdownComplete={handleComplete}
              />
            );
            await waitFor(
              () => expect(automaticTriggerCount).toBeGreaterThan(0),
              { timeout: countdownDuration * 1000 + 500 }
            );
            expect(automaticTriggerCount).toBe(1);
          }
        ),
        { numRuns: 10 }
      );
    }, 60000);

    it('should complete countdown for standard 5-second duration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(5),
          async (countdownDuration) => {
            let recordingStarted = false;
            const startTime = performance.now();
            let recordingStartTime = 0;
            const handleComplete = () => {
              recordingStarted = true;
              recordingStartTime = performance.now();
            };
            renderWithI18n(
              <CountdownPage
                countdownDuration={countdownDuration}
                onCountdownComplete={handleComplete}
              />
            );
            await waitFor(
              () => expect(recordingStarted).toBe(true),
              { timeout: 6000 }
            );
            const actualDuration = recordingStartTime - startTime;
            expect(actualDuration).toBeGreaterThanOrEqual(4800);
            expect(actualDuration).toBeLessThanOrEqual(5500);
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);
  });
});
