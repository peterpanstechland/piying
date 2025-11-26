/**
 * Performance Monitor - Tracks and logs performance metrics
 * Validates Requirements: 12.1, 12.2, 12.3, 17.1, 17.3
 */

export interface PerformanceMetrics {
  fps: number;
  cursorLatency: number;
  stateTransitionDuration: number;
  detectionCallbackDuration: number;
  frameDrops: number;
}

export class PerformanceMonitor {
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 0;
  private frameTimestamps: number[] = [];
  private maxFrameTimestamps: number = 60; // Track last 60 frames
  
  private cursorLatencies: number[] = [];
  private maxLatencySamples: number = 30;
  
  private stateTransitionDurations: number[] = [];
  private maxTransitionSamples: number = 20;
  
  private detectionCallbackDurations: number[] = [];
  private maxCallbackSamples: number = 30;
  
  private frameDropCount: number = 0;
  private lastFrameTime: number = 0;
  private expectedFrameInterval: number = 1000 / 30; // 30 FPS target
  
  private metricsListeners: Array<(metrics: PerformanceMetrics) => void> = [];

  constructor() {
    this.lastFpsUpdate = performance.now();
    this.lastFrameTime = performance.now();
  }

  /**
   * Record a frame for FPS calculation
   */
  recordFrame(): void {
    const now = performance.now();
    this.frameCount++;
    this.frameTimestamps.push(now);
    
    // Keep only recent frames
    if (this.frameTimestamps.length > this.maxFrameTimestamps) {
      this.frameTimestamps.shift();
    }
    
    // Check for frame drops (gap > 2x expected interval)
    if (this.lastFrameTime > 0) {
      const frameDelta = now - this.lastFrameTime;
      if (frameDelta > this.expectedFrameInterval * 2) {
        this.frameDropCount++;
      }
    }
    this.lastFrameTime = now;
    
    // Update FPS every second OR calculate from recent frames if enough time has passed
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= 1000) {
      this.currentFps = (this.frameCount / elapsed) * 1000;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      
      // Notify listeners
      this.notifyListeners();
    } else if (this.frameTimestamps.length >= 2) {
      // Calculate instantaneous FPS from recent frames
      const recentWindow = Math.min(30, this.frameTimestamps.length);
      const oldestTimestamp = this.frameTimestamps[this.frameTimestamps.length - recentWindow];
      const newestTimestamp = this.frameTimestamps[this.frameTimestamps.length - 1];
      const windowDuration = newestTimestamp - oldestTimestamp;
      
      if (windowDuration > 0) {
        this.currentFps = ((recentWindow - 1) / windowDuration) * 1000;
      }
    }
  }

  /**
   * Record cursor latency measurement
   */
  recordCursorLatency(latency: number): void {
    this.cursorLatencies.push(latency);
    if (this.cursorLatencies.length > this.maxLatencySamples) {
      this.cursorLatencies.shift();
    }
  }

  /**
   * Record state transition duration
   */
  recordStateTransition(duration: number): void {
    this.stateTransitionDurations.push(duration);
    if (this.stateTransitionDurations.length > this.maxTransitionSamples) {
      this.stateTransitionDurations.shift();
    }
    
    // Log warning if transition exceeds 1 second
    if (duration > 1000) {
      console.warn(`State transition exceeded 1 second: ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Record detection callback duration
   */
  recordDetectionCallback(duration: number): void {
    this.detectionCallbackDurations.push(duration);
    if (this.detectionCallbackDurations.length > this.maxCallbackSamples) {
      this.detectionCallbackDurations.shift();
    }
  }

  /**
   * Get current FPS
   */
  getFps(): number {
    return this.currentFps;
  }

  /**
   * Get average cursor latency
   */
  getAverageCursorLatency(): number {
    if (this.cursorLatencies.length === 0) return 0;
    const sum = this.cursorLatencies.reduce((a, b) => a + b, 0);
    return sum / this.cursorLatencies.length;
  }

  /**
   * Get average state transition duration
   */
  getAverageTransitionDuration(): number {
    if (this.stateTransitionDurations.length === 0) return 0;
    const sum = this.stateTransitionDurations.reduce((a, b) => a + b, 0);
    return sum / this.stateTransitionDurations.length;
  }

  /**
   * Get average detection callback duration
   */
  getAverageCallbackDuration(): number {
    if (this.detectionCallbackDurations.length === 0) return 0;
    const sum = this.detectionCallbackDurations.reduce((a, b) => a + b, 0);
    return sum / this.detectionCallbackDurations.length;
  }

  /**
   * Get frame drop count
   */
  getFrameDrops(): number {
    return this.frameDropCount;
  }

  /**
   * Get all current metrics
   */
  getMetrics(): PerformanceMetrics {
    return {
      fps: this.currentFps,
      cursorLatency: this.getAverageCursorLatency(),
      stateTransitionDuration: this.getAverageTransitionDuration(),
      detectionCallbackDuration: this.getAverageCallbackDuration(),
      frameDrops: this.frameDropCount,
    };
  }

  /**
   * Check if performance meets requirements
   */
  meetsRequirements(): {
    fps: boolean;
    cursorLatency: boolean;
    stateTransition: boolean;
    overall: boolean;
  } {
    const metrics = this.getMetrics();
    
    const fpsOk = metrics.fps >= 20; // Requirement: ≥20 FPS
    const latencyOk = metrics.cursorLatency <= 100; // Requirement: ≤100ms
    const transitionOk = metrics.stateTransitionDuration <= 1000; // Requirement: ≤1s
    
    return {
      fps: fpsOk,
      cursorLatency: latencyOk,
      stateTransition: transitionOk,
      overall: fpsOk && latencyOk && transitionOk,
    };
  }

  /**
   * Log performance report
   */
  logReport(): void {
    const metrics = this.getMetrics();
    const requirements = this.meetsRequirements();
    
    console.group('Performance Report');
    console.log(`FPS: ${metrics.fps.toFixed(2)} (${requirements.fps ? '✓' : '✗'} ≥20 required)`);
    console.log(`Cursor Latency: ${metrics.cursorLatency.toFixed(2)}ms (${requirements.cursorLatency ? '✓' : '✗'} ≤100ms required)`);
    console.log(`State Transition: ${metrics.stateTransitionDuration.toFixed(2)}ms (${requirements.stateTransition ? '✓' : '✗'} ≤1000ms required)`);
    console.log(`Detection Callback: ${metrics.detectionCallbackDuration.toFixed(2)}ms`);
    console.log(`Frame Drops: ${metrics.frameDrops}`);
    console.log(`Overall: ${requirements.overall ? '✓ PASS' : '✗ FAIL'}`);
    console.groupEnd();
  }

  /**
   * Add metrics listener
   */
  addListener(listener: (metrics: PerformanceMetrics) => void): void {
    this.metricsListeners.push(listener);
  }

  /**
   * Remove metrics listener
   */
  removeListener(listener: (metrics: PerformanceMetrics) => void): void {
    this.metricsListeners = this.metricsListeners.filter(l => l !== listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const metrics = this.getMetrics();
    this.metricsListeners.forEach(listener => {
      try {
        listener(metrics);
      } catch (error) {
        console.error('Error in performance metrics listener:', error);
      }
    });
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 0;
    this.frameTimestamps = [];
    this.cursorLatencies = [];
    this.stateTransitionDurations = [];
    this.detectionCallbackDurations = [];
    this.frameDropCount = 0;
    this.lastFrameTime = performance.now();
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();
