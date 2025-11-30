import React from 'react';
import * as fc from 'fast-check';
import { waitFor } from '@testing-library/react';
import { CountdownPage } from './CountdownPage';
import { renderWithI18n } from './test-utils';

describe('CountdownPage Property Tests', () => {
  describe('Property 5: Countdown triggers automatic recording', () => {
    it('should trigger onCountdownComplete callback when countdown reaches zero', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (countdownDuration) => {
            let callbackTriggered = false;
            const startTime = Date.now();
            const handleComplete = () => { callbackTriggered = true; };
            renderWithI18n(<CountdownPage countdownDuration={countdownDuration} onCountdownComplete={handleComplete} />);
            await waitFor(() => expect(callbackTriggered).toBe(true), { timeout: countdownDuration * 1000 + 500 });
            const elapsedTime = Date.now() - startTime;
            expect(elapsedTime).toBeGreaterThanOrEqual(countdownDuration * 1000 - 200);
          }
        ),
        { numRuns: 10 }
      );
    }, 60000); // 60 second timeout for this test
  });
});
