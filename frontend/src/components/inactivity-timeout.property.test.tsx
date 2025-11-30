/**
 * Property-based tests for inactivity timeout
 * Feature: shadow-puppet-interactive-system, Property 10.4: Inactivity timeout triggers reset
 * Validates: Requirements 10.4
 */

import React from 'react';
import * as fc from 'fast-check';
import { render, waitFor } from '@testing-library/react';
import { FinalResultPage } from './FinalResultPage';
import { act } from 'react-dom/test-utils';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      if (key === 'result.ready') return 'Your video is ready!';
      if (key === 'result.scanQR') return 'Scan QR code to download';
      if (key === 'result.autoReset') return `Auto-reset in ${params?.seconds || 30} seconds`;
      return key;
    },
  }),
}));

// Mock QRCodeSVG
jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}));

describe('Property 10.4: Inactivity timeout triggers reset', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // Property test with 10 iterations (reduced for timer-based tests)
  it('should trigger reset after configured timeout for any session', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 5, max: 30 }), // Timeout in seconds (reduced max)
        (sessionId, timeoutSeconds) => {
          const videoUrl = `http://localhost:8000/api/videos/${sessionId}`;
          const onReset = jest.fn();

          const { unmount } = render(
            <FinalResultPage
              videoUrl={videoUrl}
              onReset={onReset}
              inactivityTimeoutSeconds={timeoutSeconds}
            />
          );

          // Property: Reset should NOT be called before timeout
          expect(onReset).not.toHaveBeenCalled();

          // Advance time to just before timeout
          act(() => {
            jest.advanceTimersByTime((timeoutSeconds - 1) * 1000);
          });

          // Should still not be called
          expect(onReset).not.toHaveBeenCalled();

          // Advance time to exactly timeout
          act(() => {
            jest.advanceTimersByTime(1000);
          });

          // Property: Reset should be called exactly once after timeout
          expect(onReset).toHaveBeenCalledTimes(1);
          
          // Cleanup
          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should reset after exactly the configured timeout duration', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(5, 10, 15), // Smaller timeout values for faster tests
        (sessionId, timeoutSeconds) => {
          const videoUrl = `http://localhost:8000/api/videos/${sessionId}`;
          const onReset = jest.fn();

          const { unmount } = render(
            <FinalResultPage
              videoUrl={videoUrl}
              onReset={onReset}
              inactivityTimeoutSeconds={timeoutSeconds}
            />
          );

          // Advance time to just before timeout
          act(() => {
            jest.advanceTimersByTime((timeoutSeconds - 1) * 1000);
          });
          
          // Should not reset before timeout
          expect(onReset).not.toHaveBeenCalled();

          // Advance final second
          act(() => {
            jest.advanceTimersByTime(1000);
          });

          // Property: Should reset exactly at timeout
          expect(onReset).toHaveBeenCalledTimes(1);
          
          // Cleanup
          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should use default 30-second timeout when not specified', () => {
    fc.assert(
      fc.property(fc.uuid(), (sessionId) => {
        const videoUrl = `http://localhost:8000/api/videos/${sessionId}`;
        const onReset = jest.fn();

        const { unmount } = render(
          <FinalResultPage
            videoUrl={videoUrl}
            onReset={onReset}
            // inactivityTimeoutSeconds not provided - should default to 30
          />
        );

        // Advance time to 29 seconds
        act(() => {
          jest.advanceTimersByTime(29000);
        });

        // Should not reset yet
        expect(onReset).not.toHaveBeenCalled();

        // Advance to 30 seconds
        act(() => {
          jest.advanceTimersByTime(1000);
        });

        // Property: Should reset at default 30 seconds
        expect(onReset).toHaveBeenCalledTimes(1);
        
        // Cleanup
        unmount();
      }),
      { numRuns: 10 }
    );
  });

  it('should countdown from timeout to zero', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 5, max: 10 }), // Small timeout for faster test
        (sessionId, timeoutSeconds) => {
          const videoUrl = `http://localhost:8000/api/videos/${sessionId}`;
          const onReset = jest.fn();

          const { container, unmount } = render(
            <FinalResultPage
              videoUrl={videoUrl}
              onReset={onReset}
              inactivityTimeoutSeconds={timeoutSeconds}
            />
          );

          // Check initial countdown display
          const timerElement = container.querySelector('.reset-timer');
          expect(timerElement?.textContent).toContain(timeoutSeconds.toString());

          // Advance time by 1 second
          act(() => {
            jest.advanceTimersByTime(1000);
          });

          // Property: Countdown should decrease by 1
          expect(timerElement?.textContent).toContain((timeoutSeconds - 1).toString());
          
          // Cleanup
          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should not reset multiple times', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 5, max: 15 }),
        (sessionId, timeoutSeconds) => {
          const videoUrl = `http://localhost:8000/api/videos/${sessionId}`;
          const onReset = jest.fn();

          const { unmount } = render(
            <FinalResultPage
              videoUrl={videoUrl}
              onReset={onReset}
              inactivityTimeoutSeconds={timeoutSeconds}
            />
          );

          // Advance past timeout
          act(() => {
            jest.advanceTimersByTime(timeoutSeconds * 1000);
          });

          expect(onReset).toHaveBeenCalledTimes(1);

          // Advance more time
          act(() => {
            jest.advanceTimersByTime(timeoutSeconds * 1000);
          });

          // Property: Should still only be called once
          expect(onReset).toHaveBeenCalledTimes(1);
          
          // Cleanup
          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });
});
