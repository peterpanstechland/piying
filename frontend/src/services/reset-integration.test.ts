/**
 * Integration tests for reset and cleanup functionality
 * Tests the full flow of resetting state and notifying backend
 */

import { StateMachine, AppState } from '../state/state-machine';
import { APIClient } from './api-client';

// Mock axios
jest.mock('axios');

describe('Reset Integration Tests', () => {
  let stateMachine: StateMachine;
  let apiClient: APIClient;

  beforeEach(() => {
    stateMachine = new StateMachine(AppState.IDLE);
    apiClient = new APIClient();
    jest.clearAllMocks();
  });

  it('should clear frontend state and notify backend on reset', async () => {
    // Setup: Create a session context
    const sessionId = 'test-session-123';
    const sceneId = 'sceneA';
    
    stateMachine.transition(AppState.SCENE_SELECT);
    stateMachine.transition(AppState.SEGMENT_GUIDE, {
      sessionId,
      sceneId,
      totalSegments: 3,
      currentSegment: 0,
    });

    // Verify session is active
    const beforeContext = stateMachine.getContext();
    expect(beforeContext.sessionId).toBe(sessionId);
    expect(beforeContext.sceneId).toBe(sceneId);

    // Mock the cancelSession method
    const cancelSessionSpy = jest.spyOn(apiClient, 'cancelSession').mockResolvedValue();

    // Action: Perform reset (simulating what App.tsx does)
    if (beforeContext.sessionId) {
      await apiClient.cancelSession(beforeContext.sessionId);
    }
    stateMachine.reset();

    // Verify: Backend was notified
    expect(cancelSessionSpy).toHaveBeenCalledWith(sessionId);
    expect(cancelSessionSpy).toHaveBeenCalledTimes(1);

    // Verify: Frontend state is cleared
    const afterContext = stateMachine.getContext();
    expect(afterContext.sessionId).toBeUndefined();
    expect(afterContext.sceneId).toBeUndefined();
    expect(afterContext.recordedSegments).toEqual([]);
    expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
  });

  it('should handle backend notification failure gracefully', async () => {
    // Setup: Create a session context
    const sessionId = 'test-session-456';
    
    stateMachine.transition(AppState.SCENE_SELECT);
    stateMachine.transition(AppState.SEGMENT_GUIDE, {
      sessionId,
      sceneId: 'sceneB',
      totalSegments: 3,
      currentSegment: 0,
    });

    // Mock cancelSession to fail
    const cancelSessionSpy = jest.spyOn(apiClient, 'cancelSession')
      .mockRejectedValue(new Error('Network error'));

    // Action: Attempt reset even with backend failure
    try {
      await apiClient.cancelSession(sessionId);
    } catch (error) {
      // Expected to fail, continue with reset
    }
    stateMachine.reset();

    // Verify: Backend was called
    expect(cancelSessionSpy).toHaveBeenCalledWith(sessionId);

    // Verify: Frontend state is still cleared despite backend failure
    const afterContext = stateMachine.getContext();
    expect(afterContext.sessionId).toBeUndefined();
    expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
  });

  it('should not call backend if no active session', async () => {
    // Setup: State machine in IDLE with no session
    expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
    const context = stateMachine.getContext();
    expect(context.sessionId).toBeUndefined();

    // Mock cancelSession
    const cancelSessionSpy = jest.spyOn(apiClient, 'cancelSession').mockResolvedValue();

    // Action: Reset without active session
    if (context.sessionId) {
      await apiClient.cancelSession(context.sessionId);
    }
    stateMachine.reset();

    // Verify: Backend was not called
    expect(cancelSessionSpy).not.toHaveBeenCalled();

    // Verify: State is still IDLE
    expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
  });

  it('should clear all session data including recorded segments', async () => {
    // Setup: Create session with recorded segments
    const sessionId = 'test-session-789';
    const segments = [
      {
        index: 0,
        duration: 8,
        frames: [
          {
            timestamp: 0.033,
            landmarks: Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1 }),
          },
        ],
      },
      {
        index: 1,
        duration: 8,
        frames: [
          {
            timestamp: 0.033,
            landmarks: Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1 }),
          },
        ],
      },
    ];

    stateMachine.transition(AppState.SCENE_SELECT);
    stateMachine.transition(AppState.SEGMENT_GUIDE, {
      sessionId,
      sceneId: 'sceneC',
      totalSegments: 3,
      currentSegment: 2,
      recordedSegments: segments,
    });

    // Verify segments are present
    const beforeContext = stateMachine.getContext();
    expect(beforeContext.recordedSegments.length).toBe(2);

    // Mock cancelSession
    jest.spyOn(apiClient, 'cancelSession').mockResolvedValue();

    // Action: Reset
    await apiClient.cancelSession(sessionId);
    stateMachine.reset();

    // Verify: All data cleared
    const afterContext = stateMachine.getContext();
    expect(afterContext.recordedSegments).toEqual([]);
    expect(afterContext.currentSegment).toBe(0);
    expect(afterContext.totalSegments).toBe(0);
  });

  it('should be idempotent - multiple resets should work', async () => {
    // Setup: Create session
    const sessionId = 'test-session-multi';
    
    stateMachine.transition(AppState.SCENE_SELECT);
    stateMachine.transition(AppState.SEGMENT_GUIDE, {
      sessionId,
      sceneId: 'sceneA',
      totalSegments: 3,
      currentSegment: 0,
    });

    // Mock cancelSession
    const cancelSessionSpy = jest.spyOn(apiClient, 'cancelSession').mockResolvedValue();

    // Action: Reset multiple times
    for (let i = 0; i < 3; i++) {
      const context = stateMachine.getContext();
      if (context.sessionId) {
        await apiClient.cancelSession(context.sessionId);
      }
      stateMachine.reset();
    }

    // Verify: Backend called only once (no session ID after first reset)
    expect(cancelSessionSpy).toHaveBeenCalledTimes(1);

    // Verify: State is IDLE
    expect(stateMachine.getCurrentState()).toBe(AppState.IDLE);
    const finalContext = stateMachine.getContext();
    expect(finalContext.sessionId).toBeUndefined();
  });
});
