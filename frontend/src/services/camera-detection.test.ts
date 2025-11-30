import { CameraDetectionService } from './camera-detection';

// Mock VisionManager
jest.mock('./VisionManager', () => ({
  VisionManager: {
    getInstance: jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      detect: jest.fn().mockReturnValue({
        poseResult: null,
        handResult: null,
      }),
      cleanup: jest.fn(),
    }),
  },
}));

describe('CameraDetectionService', () => {
  let service: CameraDetectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CameraDetectionService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('before initialization', () => {
    it('should return null video element before initialization', () => {
      expect(service.getVideoElement()).toBeNull();
    });

    it('should throw error when starting detection before initialization', () => {
      const callback = jest.fn();
      expect(() => service.startDetection(callback)).toThrow('CameraDetectionService not initialized');
    });

    it('should return -1 for tracked person index before initialization', () => {
      expect(service.getTrackedPersonIndex()).toBe(-1);
    });
  });

  describe('cleanup', () => {
    it('should be safe to call cleanup multiple times', () => {
      service.cleanup();
      expect(() => service.cleanup()).not.toThrow();
    });

    it('should return null video element after cleanup', () => {
      service.cleanup();
      expect(service.getVideoElement()).toBeNull();
    });
  });

  describe('recording state', () => {
    it('should allow setting recording state', () => {
      expect(() => service.setRecordingState(true)).not.toThrow();
      expect(() => service.setRecordingState(false)).not.toThrow();
    });
  });
});
