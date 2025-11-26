import '@testing-library/jest-dom';

// Mock import.meta for Jest
// @ts-ignore
global.import = {
  meta: {
    env: {
      DEV: true,
      PROD: false,
      VITE_API_BASE_URL: 'http://localhost:8000',
    },
  },
};

// Also mock it on globalThis for better compatibility
Object.defineProperty(globalThis, 'import', {
  value: {
    meta: {
      env: {
        DEV: true,
        PROD: false,
        VITE_API_BASE_URL: 'http://localhost:8000',
      },
    },
  },
  writable: true,
  configurable: true,
});

// Mock MediaPipe for tests
global.MediaPipe = {
  Pose: jest.fn(),
  Hands: jest.fn(),
} as any;

// Mock getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn(),
  },
});

// Mock HTMLMediaElement.play()
window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
window.HTMLMediaElement.prototype.pause = jest.fn();
window.HTMLMediaElement.prototype.load = jest.fn();
