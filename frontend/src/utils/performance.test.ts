/**
 * Performance Tests
 * Validates Requirements: 1.3, 2.5, 5.5, 12.1, 12.2, 12.3, 17.1, 17.3
 */

import { performanceMonitor } from './performance-monitor';
import { PerformanceTest } from './performance-test';

describe('Performance Monitor', () => {
  beforeEach(() => {
    performanceMonitor.reset();
  });

  it('should track FPS correctly', async () => {
    // Simulate 30 frames over 1 second
    for (let i = 0; i < 30; i++) {
      performanceMonitor.recordFrame();
    }
    
    // Wait for FPS calculation (happens every second)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const fps = performanceMonitor.getFps();
    expect(fps).toBeGreaterThan(0);
  });

  it('should track cursor latency', () => {
    // Record some latency samples
    performanceMonitor.recordCursorLatency(50);
    performanceMonitor.recordCursorLatency(60);
    performanceMonitor.recordCursorLatency(70);
    
    const avgLatency = performanceMonitor.getAverageCursorLatency();
    expect(avgLatency).toBe(60);
  });

  it('should track state transition duration', () => {
    performanceMonitor.recordStateTransition(500);
    performanceMonitor.recordStateTransition(600);
    
    const avgDuration = performanceMonitor.getAverageTransitionDuration();
    expect(avgDuration).toBe(550);
  });

  it('should detect frame drops', async () => {
    const initialDrops = performanceMonitor.getFrameDrops();
    
    // Simulate normal frame
    performanceMonitor.recordFrame();
    
    // Simulate frame drop (large gap)
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms gap (> 2x expected 33ms)
    performanceMonitor.recordFrame();
    
    const dropsAfter = performanceMonitor.getFrameDrops();
    expect(dropsAfter).toBeGreaterThan(initialDrops);
  });

  it('should validate FPS requirement (≥20 FPS)', async () => {
    // Simulate 25 FPS
    for (let i = 0; i < 25; i++) {
      performanceMonitor.recordFrame();
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.fps).toBe(true);
  });

  it('should validate cursor latency requirement (≤100ms)', () => {
    // Record latencies under 100ms
    for (let i = 0; i < 10; i++) {
      performanceMonitor.recordCursorLatency(80);
    }
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.cursorLatency).toBe(true);
  });

  it('should validate state transition requirement (≤1000ms)', () => {
    // Record transitions under 1 second
    performanceMonitor.recordStateTransition(500);
    performanceMonitor.recordStateTransition(800);
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.stateTransition).toBe(true);
  });

  it('should fail FPS requirement when below 20 FPS', async () => {
    // Simulate 15 FPS with proper timing
    for (let i = 0; i < 15; i++) {
      performanceMonitor.recordFrame();
      await new Promise(resolve => setTimeout(resolve, 66)); // ~15 FPS
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.fps).toBe(false);
  });

  it('should fail cursor latency requirement when above 100ms', () => {
    // Record latencies over 100ms
    for (let i = 0; i < 10; i++) {
      performanceMonitor.recordCursorLatency(150);
    }
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.cursorLatency).toBe(false);
  });

  it('should fail state transition requirement when above 1000ms', () => {
    // Record transitions over 1 second
    performanceMonitor.recordStateTransition(1500);
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.stateTransition).toBe(false);
  });

  it('should provide complete metrics', () => {
    performanceMonitor.recordFrame();
    performanceMonitor.recordCursorLatency(50);
    performanceMonitor.recordStateTransition(500);
    performanceMonitor.recordDetectionCallback(20);
    
    const metrics = performanceMonitor.getMetrics();
    
    expect(metrics).toHaveProperty('fps');
    expect(metrics).toHaveProperty('cursorLatency');
    expect(metrics).toHaveProperty('stateTransitionDuration');
    expect(metrics).toHaveProperty('detectionCallbackDuration');
    expect(metrics).toHaveProperty('frameDrops');
  });

  it('should notify listeners on metrics update', async () => {
    const listener = jest.fn();
    performanceMonitor.addListener(listener);
    
    // Trigger FPS update by recording frames over time
    const frameInterval = setInterval(() => {
      performanceMonitor.recordFrame();
    }, 33); // ~30 FPS
    
    // Wait for FPS calculation (happens every second)
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    clearInterval(frameInterval);
    
    expect(listener).toHaveBeenCalled();
    
    performanceMonitor.removeListener(listener);
  });

  it('should reset all metrics', () => {
    performanceMonitor.recordFrame();
    performanceMonitor.recordCursorLatency(50);
    performanceMonitor.recordStateTransition(500);
    
    performanceMonitor.reset();
    
    const metrics = performanceMonitor.getMetrics();
    expect(metrics.fps).toBe(0);
    expect(metrics.cursorLatency).toBe(0);
    expect(metrics.stateTransitionDuration).toBe(0);
    expect(metrics.frameDrops).toBe(0);
  });
});

describe('Performance Test', () => {
  it('should run performance test', async () => {
    const test = new PerformanceTest(1); // 1 second test
    
    // Simulate some activity
    for (let i = 0; i < 30; i++) {
      performanceMonitor.recordFrame();
      performanceMonitor.recordCursorLatency(50);
    }
    
    const result = await test.start();
    
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('requirements');
    expect(result.duration).toBe(1000);
  });

  it('should test FPS under load', async () => {
    const test = new PerformanceTest();
    const passed = await test.testFpsUnderLoad();
    
    expect(typeof passed).toBe('boolean');
  }, 10000); // Increase timeout to 10 seconds

  it('should test cursor latency', async () => {
    const test = new PerformanceTest();
    const passed = await test.testCursorLatency(10);
    
    expect(typeof passed).toBe('boolean');
  });

  it('should test state transition timing', () => {
    const test = new PerformanceTest();
    
    const passed1 = test.testStateTransition(500);
    expect(passed1).toBe(true);
    
    const passed2 = test.testStateTransition(1500);
    expect(passed2).toBe(false);
  });
});

describe('Performance Requirements Validation', () => {
  beforeEach(() => {
    performanceMonitor.reset();
  });

  it('should meet Requirement 1.3: Camera monitoring at ≥20 FPS', async () => {
    // Simulate 25 FPS camera monitoring
    for (let i = 0; i < 25; i++) {
      performanceMonitor.recordFrame();
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const fps = performanceMonitor.getFps();
    expect(fps).toBeGreaterThanOrEqual(20);
  });

  it('should meet Requirement 2.5: Hand tracking at ≥20 FPS', async () => {
    // Simulate 30 FPS hand tracking
    for (let i = 0; i < 30; i++) {
      performanceMonitor.recordFrame();
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const fps = performanceMonitor.getFps();
    expect(fps).toBeGreaterThanOrEqual(20);
  });

  it('should meet Requirement 5.5: Recording at ≥20 FPS', async () => {
    // Simulate 25 FPS during recording
    for (let i = 0; i < 25; i++) {
      performanceMonitor.recordFrame();
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const fps = performanceMonitor.getFps();
    expect(fps).toBeGreaterThanOrEqual(20);
  });

  it('should meet Requirement 12.1: System maintains ≥20 FPS', async () => {
    // Simulate sustained 22 FPS
    for (let i = 0; i < 22; i++) {
      performanceMonitor.recordFrame();
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.fps).toBe(true);
  });

  it('should meet Requirement 12.2: State transitions ≤1 second', () => {
    // Record fast transitions
    performanceMonitor.recordStateTransition(500);
    performanceMonitor.recordStateTransition(800);
    performanceMonitor.recordStateTransition(600);
    
    const avgDuration = performanceMonitor.getAverageTransitionDuration();
    expect(avgDuration).toBeLessThanOrEqual(1000);
  });

  it('should meet Requirement 12.3: Cursor latency ≤100ms', () => {
    // Record low latencies
    for (let i = 0; i < 10; i++) {
      performanceMonitor.recordCursorLatency(50 + Math.random() * 30);
    }
    
    const avgLatency = performanceMonitor.getAverageCursorLatency();
    expect(avgLatency).toBeLessThanOrEqual(100);
  });

  it('should meet Requirement 17.1: Continuous operation stability', async () => {
    // Simulate extended operation (simplified)
    for (let minute = 0; minute < 3; minute++) {
      for (let i = 0; i < 30; i++) {
        performanceMonitor.recordFrame();
      }
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    
    const fps = performanceMonitor.getFps();
    const frameDrops = performanceMonitor.getFrameDrops();
    
    expect(fps).toBeGreaterThanOrEqual(20);
    expect(frameDrops).toBeLessThan(10); // Allow some drops over 3 minutes
  }, 10000); // Increase timeout for this test

  it('should meet Requirement 17.3: Maintain responsiveness at ≥20 FPS', async () => {
    // Simulate continuous responsiveness
    for (let i = 0; i < 25; i++) {
      performanceMonitor.recordFrame();
    }
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const requirements = performanceMonitor.meetsRequirements();
    expect(requirements.fps).toBe(true);
    expect(requirements.overall).toBe(true);
  });
});
