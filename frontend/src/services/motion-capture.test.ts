import { MotionCaptureRecorder, PoseLandmark } from './motion-capture';

describe('MotionCaptureRecorder', () => {
  let recorder: MotionCaptureRecorder;

  beforeEach(() => {
    recorder = new MotionCaptureRecorder();
  });

  describe('startRecording', () => {
    it('should start recording with valid parameters', () => {
      recorder.startRecording(0, 8.0);
      expect(recorder.isRecordingActive()).toBe(true);
      expect(recorder.getCurrentSegmentIndex()).toBe(0);
      expect(recorder.getSegmentDuration()).toBe(8.0);
    });

    it('should throw error if already recording', () => {
      recorder.startRecording(0, 8.0);
      expect(() => recorder.startRecording(1, 10.0)).toThrow(
        'Recording already in progress'
      );
    });

    it('should throw error for negative segment index', () => {
      expect(() => recorder.startRecording(-1, 8.0)).toThrow(
        'Segment index must be non-negative'
      );
    });

    it('should throw error for non-positive duration', () => {
      expect(() => recorder.startRecording(0, 0)).toThrow(
        'Duration must be positive'
      );
      expect(() => recorder.startRecording(0, -5)).toThrow(
        'Duration must be positive'
      );
    });

    it('should accept callback parameter', () => {
      const callback = jest.fn();
      recorder.startRecording(0, 8.0, callback);
      expect(recorder.isRecordingActive()).toBe(true);
    });
  });

  describe('stopRecording', () => {
    it('should stop recording and return segment data', () => {
      recorder.startRecording(0, 8.0);
      
      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      const segmentData = recorder.stopRecording();

      expect(recorder.isRecordingActive()).toBe(false);
      expect(segmentData.index).toBe(0);
      expect(segmentData.duration).toBe(8.0);
      expect(segmentData.frames.length).toBe(1);
    });

    it('should throw error if not recording', () => {
      expect(() => recorder.stopRecording()).toThrow('No recording in progress');
    });

    it('should reset state after stopping', () => {
      recorder.startRecording(0, 8.0);
      recorder.stopRecording();

      expect(recorder.getCurrentSegmentIndex()).toBe(-1);
      expect(recorder.getSegmentDuration()).toBe(0);
      expect(recorder.getFrameCount()).toBe(0);
    });

    it('should return a copy of frames array', () => {
      recorder.startRecording(0, 8.0);
      
      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      const segmentData = recorder.stopRecording();
      
      // Modifying returned data should not affect internal state
      segmentData.frames.push({
        timestamp: 1000,
        landmarks: [{ x: 0.1, y: 0.1, z: 0, visibility: 1 }],
      });

      // Start new recording and verify frame count is 0
      recorder.startRecording(1, 8.0);
      expect(recorder.getFrameCount()).toBe(0);
    });
  });

  describe('addFrame', () => {
    it('should add frame with timestamp when recording', () => {
      recorder.startRecording(0, 8.0);

      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      expect(recorder.getFrameCount()).toBe(1);
    });

    it('should ignore frames when not recording', () => {
      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      expect(recorder.getFrameCount()).toBe(0);
    });

    it('should normalize coordinates to [0, 1] range', () => {
      recorder.startRecording(0, 8.0);

      const landmarks: PoseLandmark[] = [
        { x: -0.5, y: 1.5, z: 0, visibility: 2.0 },
      ];
      recorder.addFrame(landmarks);

      const segmentData = recorder.stopRecording();
      const frame = segmentData.frames[0];

      expect(frame.landmarks[0].x).toBe(0); // Clamped to 0
      expect(frame.landmarks[0].y).toBe(1); // Clamped to 1
      expect(frame.landmarks[0].visibility).toBe(1); // Clamped to 1
    });

    it('should preserve z coordinate without normalization', () => {
      recorder.startRecording(0, 8.0);

      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: -5.5, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      const segmentData = recorder.stopRecording();
      const frame = segmentData.frames[0];

      expect(frame.landmarks[0].z).toBe(-5.5);
    });

    it('should call progress callback when provided', () => {
      const callback = jest.fn();
      recorder.startRecording(0, 8.0, callback);

      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      expect(callback).toHaveBeenCalled();
      const [elapsedSeconds, totalDuration] = callback.mock.calls[0];
      expect(elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(totalDuration).toBe(8.0);
    });

    it('should handle multiple landmarks per frame', () => {
      recorder.startRecording(0, 8.0);

      const landmarks: PoseLandmark[] = [
        { x: 0.1, y: 0.1, z: 0, visibility: 1 },
        { x: 0.2, y: 0.2, z: 0, visibility: 1 },
        { x: 0.3, y: 0.3, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      const segmentData = recorder.stopRecording();
      expect(segmentData.frames[0].landmarks.length).toBe(3);
    });

    it('should create timestamps in ascending order', () => {
      recorder.startRecording(0, 8.0);

      for (let i = 0; i < 5; i++) {
        const landmarks: PoseLandmark[] = [
          { x: 0.5, y: 0.5, z: 0, visibility: 1 },
        ];
        recorder.addFrame(landmarks);
      }

      const segmentData = recorder.stopRecording();
      
      for (let i = 1; i < segmentData.frames.length; i++) {
        expect(segmentData.frames[i].timestamp).toBeGreaterThanOrEqual(
          segmentData.frames[i - 1].timestamp
        );
      }
    });
  });

  describe('cancelRecording', () => {
    it('should cancel recording and reset state', () => {
      recorder.startRecording(0, 8.0);
      
      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      recorder.cancelRecording();

      expect(recorder.isRecordingActive()).toBe(false);
      expect(recorder.getCurrentSegmentIndex()).toBe(-1);
      expect(recorder.getFrameCount()).toBe(0);
    });

    it('should do nothing if not recording', () => {
      expect(() => recorder.cancelRecording()).not.toThrow();
      expect(recorder.isRecordingActive()).toBe(false);
    });
  });

  describe('getElapsedTime', () => {
    it('should return 0 when not recording', () => {
      expect(recorder.getElapsedTime()).toBe(0);
    });

    it('should return elapsed time when recording', () => {
      recorder.startRecording(0, 8.0);
      
      const landmarks: PoseLandmark[] = [
        { x: 0.5, y: 0.5, z: 0, visibility: 1 },
      ];
      recorder.addFrame(landmarks);

      const elapsed = recorder.getElapsedTime();
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('state queries', () => {
    it('should return correct initial state', () => {
      expect(recorder.isRecordingActive()).toBe(false);
      expect(recorder.getCurrentSegmentIndex()).toBe(-1);
      expect(recorder.getFrameCount()).toBe(0);
      expect(recorder.getSegmentDuration()).toBe(0);
      expect(recorder.getElapsedTime()).toBe(0);
    });

    it('should return correct state during recording', () => {
      recorder.startRecording(2, 10.0);

      expect(recorder.isRecordingActive()).toBe(true);
      expect(recorder.getCurrentSegmentIndex()).toBe(2);
      expect(recorder.getSegmentDuration()).toBe(10.0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty landmarks array', () => {
      recorder.startRecording(0, 8.0);
      recorder.addFrame([]);

      const segmentData = recorder.stopRecording();
      expect(segmentData.frames.length).toBe(1);
      expect(segmentData.frames[0].landmarks.length).toBe(0);
    });

    it('should handle very short duration', () => {
      recorder.startRecording(0, 0.1);
      expect(recorder.getSegmentDuration()).toBe(0.1);
    });

    it('should handle very long duration', () => {
      recorder.startRecording(0, 100.0);
      expect(recorder.getSegmentDuration()).toBe(100.0);
    });

    it('should handle large number of frames', () => {
      recorder.startRecording(0, 8.0);

      for (let i = 0; i < 1000; i++) {
        const landmarks: PoseLandmark[] = [
          { x: 0.5, y: 0.5, z: 0, visibility: 1 },
        ];
        recorder.addFrame(landmarks);
      }

      const segmentData = recorder.stopRecording();
      expect(segmentData.frames.length).toBe(1000);
    });
  });
});
