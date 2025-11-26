/**
 * Performance Testing Utilities
 * Validates Requirements: 1.3, 2.5, 5.5, 12.1, 12.2, 12.3, 17.1, 17.3
 */

import { performanceMonitor, PerformanceMetrics } from './performance-monitor';

export interface PerformanceTestResult {
  passed: boolean;
  metrics: PerformanceMetrics;
  requirements: {
    fps: { required: number; actual: number; passed: boolean };
    cursorLatency: { required: number; actual: number; passed: boolean };
    stateTransition: { required: number; actual: number; passed: boolean };
  };
  duration: number;
  timestamp: number;
}

export class PerformanceTest {
  private testDuration: number;
  private _startTime: number = 0;
  private results: PerformanceTestResult[] = [];

  constructor(durationSeconds: number = 60) {
    this.testDuration = durationSeconds * 1000;
  }

  /**
   * Start performance test
   */
  async start(): Promise<PerformanceTestResult> {
    console.log(`Starting performance test (${this.testDuration / 1000}s)...`);
    
    this.startTime = performance.now();
    performanceMonitor.reset();
    
    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, this.testDuration));
    
    // Collect results
    const metrics = performanceMonitor.getMetrics();
    const requirements = performanceMonitor.meetsRequirements();
    
    const result: PerformanceTestResult = {
      passed: requirements.overall,
      metrics,
      requirements: {
        fps: {
          required: 20,
          actual: metrics.fps,
          passed: requirements.fps,
        },
        cursorLatency: {
          required: 100,
          actual: metrics.cursorLatency,
          passed: requirements.cursorLatency,
        },
        stateTransition: {
          required: 1000,
          actual: metrics.stateTransitionDuration,
          passed: requirements.stateTransition,
        },
      },
      duration: this.testDuration,
      timestamp: Date.now(),
    };
    
    this.results.push(result);
    this.logResult(result);
    
    return result;
  }

  /**
   * Run extended stability test
   */
  async runStabilityTest(durationMinutes: number = 30): Promise<PerformanceTestResult[]> {
    console.log(`Starting extended stability test (${durationMinutes} minutes)...`);
    
    const _testIntervalMs = 60000; // Test every minute
    const numTests = durationMinutes;
    const results: PerformanceTestResult[] = [];
    
    for (let i = 0; i < numTests; i++) {
      console.log(`Stability test ${i + 1}/${numTests}...`);
      
      const result = await this.start();
      results.push(result);
      
      // Brief pause between tests
      if (i < numTests - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    this.logStabilityReport(results);
    
    return results;
  }

  /**
   * Test FPS under load
   */
  async testFpsUnderLoad(): Promise<boolean> {
    console.log('Testing FPS under load...');
    
    performanceMonitor.reset();
    
    // Simulate load for 10 seconds
    const testDuration = 10000;
    const startTime = performance.now();
    
    while (performance.now() - startTime < testDuration) {
      performanceMonitor.recordFrame();
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    const fps = performanceMonitor.getFps();
    const passed = fps >= 20;
    
    console.log(`FPS under load: ${fps.toFixed(2)} (${passed ? 'PASS' : 'FAIL'})`);
    
    return passed;
  }

  /**
   * Test cursor latency
   */
  async testCursorLatency(samples: number = 100): Promise<boolean> {
    console.log('Testing cursor latency...');
    
    performanceMonitor.reset();
    
    // Simulate cursor updates
    for (let i = 0; i < samples; i++) {
      const updateStart = performance.now();
      
      // Simulate cursor position update
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      const latency = performance.now() - updateStart;
      performanceMonitor.recordCursorLatency(latency);
    }
    
    const avgLatency = performanceMonitor.getAverageCursorLatency();
    const passed = avgLatency <= 100;
    
    console.log(`Average cursor latency: ${avgLatency.toFixed(2)}ms (${passed ? 'PASS' : 'FAIL'})`);
    
    return passed;
  }

  /**
   * Test state transition timing
   */
  testStateTransition(duration: number): boolean {
    performanceMonitor.recordStateTransition(duration);
    
    const passed = duration <= 1000;
    
    if (!passed) {
      console.warn(`State transition took ${duration.toFixed(2)}ms (FAIL - should be ≤1000ms)`);
    }
    
    return passed;
  }

  /**
   * Get all test results
   */
  getResults(): PerformanceTestResult[] {
    return [...this.results];
  }

  /**
   * Log test result
   */
  private logResult(result: PerformanceTestResult): void {
    console.group('Performance Test Result');
    console.log(`Status: ${result.passed ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Duration: ${result.duration / 1000}s`);
    console.log('');
    console.log('Requirements:');
    console.log(`  FPS: ${result.requirements.fps.actual.toFixed(2)} / ${result.requirements.fps.required} (${result.requirements.fps.passed ? '✓' : '✗'})`);
    console.log(`  Cursor Latency: ${result.requirements.cursorLatency.actual.toFixed(2)}ms / ${result.requirements.cursorLatency.required}ms (${result.requirements.cursorLatency.passed ? '✓' : '✗'})`);
    console.log(`  State Transition: ${result.requirements.stateTransition.actual.toFixed(2)}ms / ${result.requirements.stateTransition.required}ms (${result.requirements.stateTransition.passed ? '✓' : '✗'})`);
    console.log('');
    console.log('Additional Metrics:');
    console.log(`  Detection Callback: ${result.metrics.detectionCallbackDuration.toFixed(2)}ms`);
    console.log(`  Frame Drops: ${result.metrics.frameDrops}`);
    console.groupEnd();
  }

  /**
   * Log stability report
   */
  private logStabilityReport(results: PerformanceTestResult[]): void {
    const passCount = results.filter(r => r.passed).length;
    const passRate = (passCount / results.length) * 100;
    
    const avgFps = results.reduce((sum, r) => sum + r.metrics.fps, 0) / results.length;
    const avgLatency = results.reduce((sum, r) => sum + r.metrics.cursorLatency, 0) / results.length;
    const avgTransition = results.reduce((sum, r) => sum + r.metrics.stateTransitionDuration, 0) / results.length;
    const totalFrameDrops = results.reduce((sum, r) => sum + r.metrics.frameDrops, 0);
    
    console.group('Stability Test Report');
    console.log(`Tests Run: ${results.length}`);
    console.log(`Pass Rate: ${passRate.toFixed(1)}%`);
    console.log('');
    console.log('Average Metrics:');
    console.log(`  FPS: ${avgFps.toFixed(2)}`);
    console.log(`  Cursor Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`  State Transition: ${avgTransition.toFixed(2)}ms`);
    console.log(`  Total Frame Drops: ${totalFrameDrops}`);
    console.groupEnd();
  }
}

// Export singleton instance for easy access
export const performanceTest = new PerformanceTest();
