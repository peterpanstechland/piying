/**
 * Property-based tests for QR code URL format
 * Feature: shadow-puppet-interactive-system, Property 14: QR code contains correct URL format
 * Validates: Requirements 10.2
 */

import React from 'react';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import { FinalResultPage } from './FinalResultPage';

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

describe('Property 14: QR code contains correct URL format', () => {
  // Helper to extract QR code value from rendered component
  const getQRCodeValue = (container: HTMLElement): string | null => {
    // QRCodeSVG component receives the value as a prop
    // We can find it in the displayed URL text below the QR code
    const urlElement = container.querySelector('.qr-url');
    return urlElement?.textContent || null;
  };

  // Property test with 100 iterations
  it('should generate QR codes with URLs matching format http://<ip>:8000/api/videos/<sessionId>', () => {
    fc.assert(
      fc.property(
        // Generate valid session IDs
        fc.uuid(),
        // Generate valid IP addresses (simplified for testing)
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 })
        ),
        (sessionId, [a, b, c, d]) => {
          const localIp = `${a}.${b}.${c}.${d}`;
          const videoUrl = `http://${localIp}:8000/api/videos/${sessionId}`;

          const { container } = render(
            <FinalResultPage
              videoUrl={videoUrl}
              onReset={() => {}}
              inactivityTimeoutSeconds={30}
            />
          );

          const qrValue = getQRCodeValue(container);

          // Property: QR code should contain the exact video URL
          expect(qrValue).toBe(videoUrl);

          // Additional checks for URL format
          if (qrValue) {
            expect(qrValue).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:8000\/api\/videos\/.+$/);
            expect(qrValue).toContain(sessionId);
            expect(qrValue).toContain(':8000');
            expect(qrValue).toContain('/api/videos/');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate QR codes with localhost URLs in correct format', () => {
    fc.assert(
      fc.property(fc.uuid(), (sessionId) => {
        const videoUrl = `http://localhost:8000/api/videos/${sessionId}`;

        const { container } = render(
          <FinalResultPage
            videoUrl={videoUrl}
            onReset={() => {}}
            inactivityTimeoutSeconds={30}
          />
        );

        const qrValue = getQRCodeValue(container);

        // Property: QR code should contain the localhost URL
        expect(qrValue).toBe(videoUrl);
        expect(qrValue).toContain('localhost:8000');
        expect(qrValue).toContain(`/api/videos/${sessionId}`);
      }),
      { numRuns: 100 }
    );
  });

  it('should generate QR codes with LAN IP addresses in correct format', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom('192.168.1', '192.168.0', '10.0.0', '172.16.0'),
        fc.integer({ min: 1, max: 254 }),
        (sessionId, subnet, lastOctet) => {
          const lanIp = `${subnet}.${lastOctet}`;
          const videoUrl = `http://${lanIp}:8000/api/videos/${sessionId}`;

          const { container } = render(
            <FinalResultPage
              videoUrl={videoUrl}
              onReset={() => {}}
              inactivityTimeoutSeconds={30}
            />
          );

          const qrValue = getQRCodeValue(container);

          // Property: QR code should contain the LAN IP URL
          expect(qrValue).toBe(videoUrl);
          expect(qrValue).toContain(lanIp);
          expect(qrValue).toContain(':8000');
          expect(qrValue).toContain(`/api/videos/${sessionId}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve the complete URL structure in QR code', () => {
    fc.assert(
      fc.property(fc.uuid(), (sessionId) => {
        const videoUrl = `http://192.168.1.100:8000/api/videos/${sessionId}`;

        const { container } = render(
          <FinalResultPage
            videoUrl={videoUrl}
            onReset={() => {}}
            inactivityTimeoutSeconds={30}
          />
        );

        const qrValue = getQRCodeValue(container);

        // Property: QR code value should be exactly the video URL
        expect(qrValue).toBe(videoUrl);

        // Verify URL structure
        if (qrValue) {
          const url = new URL(qrValue);
          expect(url.protocol).toBe('http:');
          expect(url.port).toBe('8000');
          expect(url.pathname).toBe(`/api/videos/${sessionId}`);
        }
      }),
      { numRuns: 100 }
    );
  });
});
