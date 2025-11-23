import { CameraDetectionService, DetectionResult } from './camera-detection';

// Mock MediaPipe modules
jest.mock('@mediapipe/pose', () => ({
  Pose: jest.fn().mockImplementation(() => ({
    setOptions: jest.fn(),
    onResults: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
  })),
  POSE_CONNECTIONS: [],
}));

jest.mock('@mediapipe/hands', () => ({
  Hands: jest.fn().mockImplementation(() => ({
    setOptions: jest.fn(),
    onResults: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('@mediapipe/camera_utils', () => ({
  Camera: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

describe('CameraDetectionService', () => {
  let service: CameraDetectionService;

  beforeEach(() => {
    service = new CameraDetectionService();
    
    // Mock getUserMedia
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: () => [{ stop: jest.fn() }],
      } as any),
    } as any;
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('initialization', () => {
    it('should initialize successfully with camera access', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should throw error when camera access fails', async () => {
      (global.navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValue(
        new Error('Camera access denied')
      );

      await expect(service.initialize()).rejects.toThrow(
        'Failed to initialize camera detection'
      );
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize();
      const getUserMediaSpy = global.navigator.mediaDevices.getUserMedia as jest.Mock;
      getUserMediaSpy.mockClear();

      await service.initialize();
      
      expect(getUserMediaSpy).not.toHaveBeenCalled();
    });
  });

  describe('detection lifecycle', () => {
    it('should throw error when starting detection before initialization', () => {
      const callback = jest.fn();
      
      expect(() => service.startDetection(callback)).toThrow(
        'CameraDetectionService not initialized'
      );
    });

    it('should start detection after initialization', async () => {
      await service.initialize();
      const callback = jest.fn();
      
      expect(() => service.startDetection(callback)).not.toThrow();
    });

    it('should stop detection', async () => {
      await service.initialize();
      const callback = jest.fn();
      
      service.startDetection(callback);
      expect(() => service.stopDetection()).not.toThrow();
    });
  });

  describe('video element', () => {
    it('should return null before initialization', () => {
      expect(service.getVideoElement()).toBeNull();
    });

    it('should return video element after initialization', async () => {
      await service.initialize();
      const videoElement = service.getVideoElement();
      
      expect(videoElement).toBeInstanceOf(HTMLVideoElement);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      await service.initialize();
      const videoElement = service.getVideoElement();
      
      service.cleanup();
      
      expect(service.getVideoElement()).toBeNull();
      expect(videoElement?.parentElement).toBeNull();
    });

    it('should be safe to call cleanup multiple times', async () => {
      await service.initialize();
      
      service.cleanup();
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('detection results', () => {
    it('should provide detection result with presence false when no person detected', async () => {
      await service.initialize();
      
      const results: DetectionResult[] = [];
      service.startDetection((result) => {
        results.push(result);
      });

      // Get the callbacks that were registered
      const { Pose } = require('@mediapipe/pose');
      const { Hands } = require('@mediapipe/hands');
      const poseInstance = Pose.mock.results[0].value;
      const handsInstance = Hands.mock.results[0].value;
      const poseCallback = poseInstance.onResults.mock.calls[0][0];
      const handsCallback = handsInstance.onResults.mock.calls[0][0];
      
      // Trigger callbacks with no detection
      poseCallback({ poseLandmarks: null });
      
      // Should have at least one result
      expect(results.length).toBeGreaterThan(0);
      const lastResult = results[results.length - 1];
      expect(lastResult.presence).toBe(false);
      expect(lastResult.rightHand).toBeUndefined();
      expect(lastResult.pose).toBeUndefined();
      expect(lastResult.exitGesture).toBe(false);
    });

    it('should detect person presence when pose landmarks are available', async () => {
      await service.initialize();
      
      const results: DetectionResult[] = [];
      service.startDetection((result) => {
        results.push(result);
      });

      // Get the callbacks
      const { Pose } = require('@mediapipe/pose');
      const poseInstance = Pose.mock.results[0].value;
      const poseCallback = poseInstance.onResults.mock.calls[0][0];
      
      const mockLandmarks = [
        { x: 0.5, y: 0.3, z: 0, visibility: 0.9 }, // nose
        { x: 0.4, y: 0.4, z: 0, visibility: 0.8 }, // left eye
      ];
      
      // Trigger callback with person detection
      poseCallback({ poseLandmarks: mockLandmarks });

      expect(results.length).toBeGreaterThan(0);
      const lastResult = results[results.length - 1];
      expect(lastResult.presence).toBe(true);
      expect(lastResult.pose).toHaveLength(2);
      expect(lastResult.pose?.[0]).toEqual({
        x: 0.5,
        y: 0.3,
        z: 0,
        visibility: 0.9,
      });
    });

    it('should extract right hand position for cursor control', async () => {
      await service.initialize();
      
      const results: DetectionResult[] = [];
      service.startDetection((result) => {
        results.push(result);
      });

      // Get the callbacks
      const { Hands } = require('@mediapipe/hands');
      const handsInstance = Hands.mock.results[0].value;
      const handsCallback = handsInstance.onResults.mock.calls[0][0];
      
      const mockHandLandmarks = [
        { x: 0.6, y: 0.5, z: 0 }, // wrist
        { x: 0.61, y: 0.49, z: 0 }, // thumb
        { x: 0.62, y: 0.48, z: 0 },
        { x: 0.63, y: 0.47, z: 0 },
        { x: 0.64, y: 0.46, z: 0 },
        { x: 0.65, y: 0.45, z: 0 },
        { x: 0.66, y: 0.44, z: 0 },
        { x: 0.67, y: 0.43, z: 0 },
        { x: 0.68, y: 0.42, z: 0 }, // index finger tip
      ];
      
      // Trigger callback with hand detection
      handsCallback({
        multiHandLandmarks: [mockHandLandmarks],
        multiHandedness: [{ label: 'Right' }],
      });

      expect(results.length).toBeGreaterThan(0);
      const lastResult = results[results.length - 1];
      expect(lastResult.rightHand).toBeDefined();
      expect(lastResult.rightHand?.x).toBe(0.68);
      expect(lastResult.rightHand?.y).toBe(0.42);
    });
  });
});
