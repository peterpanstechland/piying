import '@testing-library/jest-dom';

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
