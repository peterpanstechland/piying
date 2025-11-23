import '@testing-library/jest-dom';

// Mock MediaPipe for tests
global.MediaPipe = {
  Pose: jest.fn(),
  Hands: jest.fn(),
} as any;

// Mock getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn(),
  },
});
