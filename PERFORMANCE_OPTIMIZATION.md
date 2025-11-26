# Performance Optimization Guide

## Overview

This document describes the performance optimizations implemented in the Shadow Puppet Interactive System to meet the strict performance requirements outlined in the specification.

## Performance Requirements

The system must meet the following performance targets:

1. **Camera Detection**: ≥20 FPS (Requirements 1.3, 2.5, 5.5, 12.1, 17.3)
2. **State Transitions**: ≤1 second (Requirement 12.2)
3. **Cursor Latency**: ≤100ms (Requirement 12.3)
4. **Continuous Operation**: Multiple hours without crashes (Requirement 17.1)

## Implemented Optimizations

### 1. MediaPipe Detection Throttling

**Location**: `frontend/src/services/camera-detection.ts`

**Optimization**: Throttled detection callbacks using `requestAnimationFrame` to maintain ~30 FPS callback rate.

**Implementation**:
- Added `callbackThrottleMs` parameter (33ms = ~30 FPS)
- Implemented `scheduleCallbackProcessing()` method using RAF
- Prevents callback flooding when MediaPipe processes faster than needed

**Benefits**:
- Reduces CPU usage by limiting callback frequency
- Maintains smooth 20+ FPS detection rate
- Prevents UI blocking from excessive callbacks

### 2. Smooth Cursor Updates

**Location**: `frontend/src/services/gesture-cursor.ts`

**Optimization**: Implemented smooth cursor interpolation using `requestAnimationFrame`.

**Implementation**:
- Added `targetPosition` and `smoothingFactor` properties
- Implemented `startSmoothUpdate()` method with RAF loop
- Smooth interpolation towards target position

**Benefits**:
- Eliminates jittery cursor movement
- Maintains <100ms latency while providing smooth visual feedback
- Reduces perceived lag through motion smoothing

### 3. Non-Blocking State Transitions

**Location**: `frontend/src/state/state-machine.ts`

**Optimization**: Wrapped listener notifications in `requestAnimationFrame` to avoid blocking.

**Implementation**:
- Moved `notifyListeners()` call inside RAF callback
- Ensures transitions complete quickly without waiting for listeners
- Added transition timing measurement

**Benefits**:
- State transitions complete in <1 second
- UI remains responsive during transitions
- Better performance tracking

### 4. Performance Monitoring System

**Location**: `frontend/src/utils/performance-monitor.ts`

**Features**:
- Real-time FPS tracking
- Cursor latency measurement
- State transition duration tracking
- Detection callback duration tracking
- Frame drop detection
- Automatic requirement validation

**Usage**:
```typescript
import { performanceMonitor } from './utils/performance-monitor';

// Record metrics
performanceMonitor.recordFrame();
performanceMonitor.recordCursorLatency(latency);
performanceMonitor.recordStateTransition(duration);

// Check requirements
const requirements = performanceMonitor.meetsRequirements();
console.log('FPS OK:', requirements.fps);
console.log('Latency OK:', requirements.cursorLatency);
console.log('Transitions OK:', requirements.stateTransition);

// Get detailed report
performanceMonitor.logReport();
```

### 5. Performance Testing Utilities

**Location**: `frontend/src/utils/performance-test.ts`

**Features**:
- Automated performance testing
- Extended stability testing (30+ minutes)
- FPS under load testing
- Cursor latency testing
- State transition timing validation

**Usage**:
```typescript
import { performanceTest } from './utils/performance-test';

// Run 60-second performance test
const result = await performanceTest.start();
console.log('Test passed:', result.passed);

// Run extended stability test
const results = await performanceTest.runStabilityTest(30); // 30 minutes

// Test specific metrics
const fpsOk = await performanceTest.testFpsUnderLoad();
const latencyOk = await performanceTest.testCursorLatency(100);
```

### 6. Integrated Performance Monitoring in App

**Location**: `frontend/src/App.tsx`

**Implementation**:
- RAF loop for continuous frame tracking
- Automatic performance reports every 30 seconds
- Detection callback duration tracking
- State transition duration tracking

**Benefits**:
- Real-time performance visibility
- Early detection of performance degradation
- Continuous validation of requirements

## Performance Testing

### Running Tests

```bash
# Run all tests including performance tests
npm test

# Run only performance tests
npm test performance.test.ts

# Run tests with coverage
npm test -- --coverage
```

### Manual Performance Testing

Open the browser console and use the global performance utilities:

```javascript
// Check current metrics
performanceMonitor.getMetrics();

// Check if requirements are met
performanceMonitor.meetsRequirements();

// Get detailed report
performanceMonitor.logReport();

// Run automated test
performanceTest.start();
```

## Performance Benchmarks

### Expected Performance

Under normal operation, the system should achieve:

- **FPS**: 25-30 FPS (exceeds 20 FPS requirement)
- **Cursor Latency**: 50-80ms (well under 100ms requirement)
- **State Transitions**: 200-500ms (well under 1000ms requirement)
- **Detection Callbacks**: 15-25ms per callback
- **Frame Drops**: <5 per minute

### Performance Under Load

During extended operation (multiple hours):

- **FPS**: Should remain ≥20 FPS
- **Memory**: Should remain stable (no leaks)
- **Frame Drops**: Should remain minimal (<10 per hour)
- **Responsiveness**: Should maintain <100ms cursor latency

## Troubleshooting Performance Issues

### Low FPS (<20 FPS)

**Possible Causes**:
- Heavy CPU load from other applications
- Insufficient hardware (GPU/CPU)
- Browser throttling (background tab)
- MediaPipe model complexity too high

**Solutions**:
1. Close other applications
2. Ensure browser tab is active
3. Reduce MediaPipe model complexity in `camera-detection.ts`
4. Check browser console for errors

### High Cursor Latency (>100ms)

**Possible Causes**:
- Detection callback taking too long
- Excessive smoothing factor
- RAF loop not running

**Solutions**:
1. Check detection callback duration in performance report
2. Reduce `smoothingFactor` in `gesture-cursor.ts`
3. Verify RAF loop is active in browser DevTools

### Slow State Transitions (>1 second)

**Possible Causes**:
- Heavy listener operations
- Synchronous API calls in listeners
- Large state context updates

**Solutions**:
1. Move heavy operations to async callbacks
2. Use RAF for non-critical updates
3. Minimize state context size

### Frame Drops

**Possible Causes**:
- Garbage collection pauses
- Heavy rendering operations
- Memory leaks

**Solutions**:
1. Check memory usage in browser DevTools
2. Reduce object allocations in hot paths
3. Verify cleanup in component unmount

## Best Practices

### For Developers

1. **Always use RAF for animations**: Never use `setInterval` or `setTimeout` for animations
2. **Throttle expensive operations**: Use throttling for detection callbacks and cursor updates
3. **Monitor performance**: Check performance reports regularly during development
4. **Test on target hardware**: Test on the actual deployment hardware
5. **Profile before optimizing**: Use browser DevTools to identify bottlenecks

### For Deployment

1. **Run performance tests**: Execute full test suite before deployment
2. **Monitor in production**: Keep performance monitoring enabled
3. **Set up alerts**: Alert on performance degradation
4. **Regular maintenance**: Restart system periodically to clear memory
5. **Hardware requirements**: Ensure deployment hardware meets minimum specs

## Hardware Requirements

### Minimum Requirements

- **CPU**: Intel i5 or equivalent (4 cores)
- **RAM**: 8GB
- **GPU**: Integrated graphics with WebGL support
- **Camera**: 720p webcam at 30 FPS
- **Browser**: Chrome 90+ or Firefox 88+

### Recommended Requirements

- **CPU**: Intel i7 or equivalent (6+ cores)
- **RAM**: 16GB
- **GPU**: Dedicated GPU with WebGL 2.0 support
- **Camera**: 1080p webcam at 60 FPS
- **Browser**: Latest Chrome or Edge

## Future Optimizations

### Potential Improvements

1. **Web Workers**: Move MediaPipe processing to Web Worker
2. **WebAssembly**: Use WASM for performance-critical code
3. **GPU Acceleration**: Leverage WebGL for rendering
4. **Adaptive Quality**: Reduce quality under load
5. **Predictive Cursor**: Predict cursor position to reduce latency

### Monitoring Enhancements

1. **Remote Monitoring**: Send metrics to monitoring service
2. **Historical Analysis**: Store and analyze performance trends
3. **Automated Alerts**: Alert on performance degradation
4. **A/B Testing**: Test optimization impact

## References

- [MediaPipe Performance Guide](https://google.github.io/mediapipe/getting_started/performance.html)
- [Web Performance Best Practices](https://web.dev/performance/)
- [requestAnimationFrame Guide](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
