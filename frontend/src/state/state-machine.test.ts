/**
 * Unit tests for StateMachine
 */

import { StateMachine, AppState } from './state-machine';

describe('StateMachine', () => {
  let stateMachine: StateMachine;

  beforeEach(() => {
    stateMachine = new StateMachine();
  });

  describe('Initialization', () => {
    it('should initialize with IDLE state', () => {
      expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
    });

    it('should initialize with empty context', () => {
      const context = stateMachine.getContext();
      expect(context.currentSegment).toBe(0);
      expect(context.totalSegments).toBe(0);
      expect(context.recordedSegments).toEqual([]);
      expect(context.sessionId).toBeUndefined();
      expect(context.sceneId).toBeUndefined();
    });
  });

  describe('Valid Transitions', () => {
    it('should transition from IDLE to SCENE_SELECT', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      expect(stateMachine.getCurrentState()).toBe(AppState.SCENE_SELECT);
    });

    it('should transition from SCENE_SELECT to SEGMENT_GUIDE with context', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 3,
        currentSegment: 0,
      });
      
      expect(stateMachine.getCurrentState()).toBe(AppState.SEGMENT_GUIDE);
      const context = stateMachine.getContext();
      expect(context.sessionId).toBe('test-session');
      expect(context.sceneId).toBe('sceneA');
      expect(context.totalSegments).toBe(3);
    });

    it('should transition through motion capture flow', () => {
      // Setup
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 2,
        currentSegment: 0,
      });

      // Countdown
      stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
      expect(stateMachine.getCurrentState()).toBe(AppState.SEGMENT_COUNTDOWN);

      // Record
      stateMachine.transition(AppState.SEGMENT_RECORD);
      expect(stateMachine.getCurrentState()).toBe(AppState.SEGMENT_RECORD);

      // Review
      stateMachine.transition(AppState.SEGMENT_REVIEW);
      expect(stateMachine.getCurrentState()).toBe(AppState.SEGMENT_REVIEW);
    });

    it('should allow re-record by transitioning back to SEGMENT_GUIDE', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 2,
        currentSegment: 0,
      });
      stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
      stateMachine.transition(AppState.SEGMENT_RECORD);
      stateMachine.transition(AppState.SEGMENT_REVIEW);

      // Re-record
      stateMachine.transition(AppState.SEGMENT_GUIDE);
      expect(stateMachine.getCurrentState()).toBe(AppState.SEGMENT_GUIDE);
    });

    it('should transition to RENDER_WAIT when all segments recorded', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 1,
        currentSegment: 0,
      });
      
      // Add a recorded segment
      stateMachine.addRecordedSegment({
        index: 0,
        duration: 8,
        frames: [],
      });

      stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
      stateMachine.transition(AppState.SEGMENT_RECORD);
      stateMachine.transition(AppState.SEGMENT_REVIEW);
      stateMachine.transition(AppState.RENDER_WAIT);
      
      expect(stateMachine.getCurrentState()).toBe(AppState.RENDER_WAIT);
    });

    it('should transition to FINAL_RESULT with video URL', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 1,
        currentSegment: 0,
      });
      
      stateMachine.addRecordedSegment({
        index: 0,
        duration: 8,
        frames: [],
      });

      stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
      stateMachine.transition(AppState.SEGMENT_RECORD);
      stateMachine.transition(AppState.SEGMENT_REVIEW);
      stateMachine.transition(AppState.RENDER_WAIT);
      stateMachine.transition(AppState.FINAL_RESULT, {
        videoUrl: '/videos/test-session',
      });
      
      expect(stateMachine.getCurrentState()).toBe(AppState.FINAL_RESULT);
      expect(stateMachine.getContext().videoUrl).toBe('/videos/test-session');
    });

    it('should allow return to IDLE from any state', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.IDLE);
      expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
    });
  });

  describe('Invalid Transitions', () => {
    it('should throw error for invalid transition from IDLE to SEGMENT_GUIDE', () => {
      expect(() => {
        stateMachine.transition(AppState.SEGMENT_GUIDE);
      }).toThrow('Invalid state transition');
    });

    it('should throw error for invalid transition from IDLE to RENDER_WAIT', () => {
      expect(() => {
        stateMachine.transition(AppState.RENDER_WAIT);
      }).toThrow('Invalid state transition');
    });

    it('should throw error for transition to SEGMENT_GUIDE without sessionId', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      expect(() => {
        stateMachine.transition(AppState.SEGMENT_GUIDE, {
          sceneId: 'sceneA',
          totalSegments: 3,
        });
      }).toThrow('requires sessionId');
    });

    it('should throw error for transition to SEGMENT_GUIDE without sceneId', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      expect(() => {
        stateMachine.transition(AppState.SEGMENT_GUIDE, {
          sessionId: 'test-session',
          totalSegments: 3,
        });
      }).toThrow('requires sceneId');
    });

    it('should throw error for transition to RENDER_WAIT without all segments', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 2,
        currentSegment: 0,
      });
      
      // Only add 1 segment when 2 are required
      stateMachine.addRecordedSegment({
        index: 0,
        duration: 8,
        frames: [],
      });

      stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
      stateMachine.transition(AppState.SEGMENT_RECORD);
      stateMachine.transition(AppState.SEGMENT_REVIEW);
      
      expect(() => {
        stateMachine.transition(AppState.RENDER_WAIT);
      }).toThrow('requires all segments to be recorded');
    });

    it('should throw error for transition to FINAL_RESULT without videoUrl', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.transition(AppState.SEGMENT_GUIDE, {
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 1,
        currentSegment: 0,
      });
      
      stateMachine.addRecordedSegment({
        index: 0,
        duration: 8,
        frames: [],
      });

      stateMachine.transition(AppState.SEGMENT_COUNTDOWN);
      stateMachine.transition(AppState.SEGMENT_RECORD);
      stateMachine.transition(AppState.SEGMENT_REVIEW);
      stateMachine.transition(AppState.RENDER_WAIT);
      
      expect(() => {
        stateMachine.transition(AppState.FINAL_RESULT);
      }).toThrow('requires videoUrl');
    });
  });

  describe('Context Management', () => {
    it('should update context without changing state', () => {
      stateMachine.updateContext({ error: 'Test error' });
      expect(stateMachine.getContext().error).toBe('Test error');
      expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
    });

    it('should add recorded segments', () => {
      const segment = {
        index: 0,
        duration: 8,
        frames: [{ timestamp: 0, landmarks: [] }],
      };
      
      stateMachine.addRecordedSegment(segment);
      expect(stateMachine.getContext().recordedSegments).toHaveLength(1);
      expect(stateMachine.getContext().recordedSegments[0]).toEqual(segment);
    });

    it('should remove last segment', () => {
      stateMachine.addRecordedSegment({ index: 0, duration: 8, frames: [] });
      stateMachine.addRecordedSegment({ index: 1, duration: 8, frames: [] });
      
      expect(stateMachine.getContext().recordedSegments).toHaveLength(2);
      
      stateMachine.removeLastSegment();
      expect(stateMachine.getContext().recordedSegments).toHaveLength(1);
      expect(stateMachine.getContext().recordedSegments[0].index).toBe(0);
    });

    it('should check if all segments are recorded', () => {
      stateMachine.updateContext({ totalSegments: 2 });
      expect(stateMachine.areAllSegmentsRecorded()).toBe(false);
      
      stateMachine.addRecordedSegment({ index: 0, duration: 8, frames: [] });
      expect(stateMachine.areAllSegmentsRecorded()).toBe(false);
      
      stateMachine.addRecordedSegment({ index: 1, duration: 8, frames: [] });
      expect(stateMachine.areAllSegmentsRecorded()).toBe(true);
    });
  });

  describe('Reset', () => {
    it('should reset to IDLE state', () => {
      stateMachine.transition(AppState.SCENE_SELECT);
      stateMachine.updateContext({
        sessionId: 'test-session',
        sceneId: 'sceneA',
        totalSegments: 3,
      });
      
      stateMachine.reset();
      
      expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
      const context = stateMachine.getContext();
      expect(context.sessionId).toBeUndefined();
      expect(context.sceneId).toBeUndefined();
      expect(context.currentSegment).toBe(0);
      expect(context.totalSegments).toBe(0);
      expect(context.recordedSegments).toEqual([]);
    });
  });

  describe('Listeners', () => {
    it('should notify listeners on state change', () => {
      const listener = jest.fn();
      stateMachine.addListener(listener);
      
      stateMachine.transition(AppState.SCENE_SELECT);
      
      expect(listener).toHaveBeenCalledWith(
        AppState.SCENE_SELECT,
        expect.any(Object)
      );
    });

    it('should remove listeners', () => {
      const listener = jest.fn();
      stateMachine.addListener(listener);
      stateMachine.removeListener(listener);
      
      stateMachine.transition(AppState.SCENE_SELECT);
      
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      
      stateMachine.addListener(errorListener);
      stateMachine.addListener(goodListener);
      
      // Should not throw
      expect(() => {
        stateMachine.transition(AppState.SCENE_SELECT);
      }).not.toThrow();
      
      // Good listener should still be called
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('Context Immutability', () => {
    it('should return a copy of context, not the original', () => {
      const context1 = stateMachine.getContext();
      context1.sessionId = 'modified';
      
      const context2 = stateMachine.getContext();
      expect(context2.sessionId).toBeUndefined();
    });
  });
});
