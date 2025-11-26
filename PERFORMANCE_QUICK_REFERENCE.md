# Performance Optimization Quick Reference

## Quick Start

### Check Current Performance

```javascript
// In browser console
performanceMonitor.getMetrics();
// Returns: { fps: 28.5, cursorLatency: 65, stateTransitionDuration: 450, ... }

performanceMonitor.meetsRequirements();
// Returns: { fps: true, cursorLatency: true, stateTransition: true, overall: true }

performanceMonitor.logReport();
// Prints detailed performance report
```

### Run Performance Test

```javascript
// 60-second test
await performanceTest.start();

// Extended stability test (30 minutes)
await performanceTest.runStabilityTest(30);
```

## Performance Requirements

| Metric | Requirement | Typical Performance |
|--------|-------------|---------------------|
| FPS | ≥20 FPS | 25-30 FPS |
| Cursor Latency | ≤100ms | 50-80ms |
| State Transitions | ≤1000ms | 200-500ms |

## Key Optimizations

### 1. Use requestAnimationFrame for Animations

```typescript
// ❌ Bad
setInterval(() => {
  updateCursor();
}, 16);

// ✅ Good
const animate = () => {
  updateCursor();
  requestAnimationFrame(animate);
};
requestAnimationFrame(animate);
```

### 2. Throttle Expensive Operations

```typescript
// ❌ Bad
onDetection((result) => {
  processImmediately(result);
});

// ✅ Good
let rafId: number | null = null;
onDetection((result) => {
  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      processImmediately(result);
      rafId = null;
    });
  }
});
```

### 3. Smooth Interpolation for Cursor

```typescript
// ❌ Bad
cursor.x = hand.x;
cursor.y = hand.y;

// ✅ Good
cursor.x += (hand.x - cursor.x) * smoothingFactor;
cursor.y += (hand.y - cursor.y) * smoothingFactor;
```

### 4. Non-Blocking State Transitions

```typescript
// ❌ Bad
setState(newState);
notifyListeners();

// ✅ Good
setState(newState);
requestAnimationFrame(() => {
  notifyListeners();
});
```

## Troubleshooting

### Low FPS (<20 FPS)

1. Check browser console for errors
2. Verify tab is active (not background)
3. Close other applications
4. Check `performanceMonitor.getMetrics().detectionCallbackDuration`
5. If >30ms, detection is too slow

### High Cursor Latency (>100ms)

1. Check `performanceMonitor.getCursorLatency()`
2. Reduce smoothing factor in `gesture-cursor.ts`
3. Verify RAF loop is running
4. Check for blocking operations in detection callback

### Slow State Transitions (>1s)

1. Check `performanceMonitor.getAverageTransitionDuration()`
2. Profile listener operations
3. Move heavy operations to async callbacks
4. Reduce state context size

## Performance Monitoring API

### PerformanceMonitor

```typescript
import { performanceMonitor } from './utils/performance-monitor';

// Record metrics
performanceMonitor.recordFrame();
performanceMonitor.recordCursorLatency(latency);
performanceMonitor.recordStateTransition(duration);
performanceMonitor.recordDetectionCallback(duration);

// Get metrics
const metrics = performanceMonitor.getMetrics();
const fps = performanceMonitor.getFps();
const latency = performanceMonitor.getAverageCursorLatency();

// Check requirements
const requirements = performanceMonitor.meetsRequirements();
if (!requirements.overall) {
  console.warn('Performance requirements not met!');
}

// Add listener
performanceMonitor.addListener((metrics) => {
  console.log('FPS:', metrics.fps);
});

// Reset
performanceMonitor.reset();
```

### PerformanceTest

```typescript
import { performanceTest } from './utils/performance-test';

// Run test
const result = await performanceTest.start();
console.log('Passed:', result.passed);

// Test specific metrics
const fpsOk = await performanceTest.testFpsUnderLoad();
const latencyOk = await performanceTest.testCursorLatency(100);
const transitionOk = performanceTest.testStateTransition(500);

// Extended stability test
const results = await performanceTest.runStabilityTest(30);
console.log('Pass rate:', results.filter(r => r.passed).length / results.length);
```

## Testing Commands

```bash
# Run all tests
npm test

# Run performance tests only
npm test -- performance.test.ts

# Run with extended timeout
npm test -- performance.test.ts --testTimeout=20000

# Run with coverage
npm test -- --coverage
```

## Performance Checklist

Before deployment:

- [ ] Run full test suite: `npm test`
- [ ] Run performance tests: `npm test -- performance.test.ts`
- [ ] Verify FPS ≥20 in browser console
- [ ] Verify cursor latency ≤100ms
- [ ] Verify state transitions ≤1s
- [ ] Test on target hardware
- [ ] Run 30-minute stability test
- [ ] Check for memory leaks in DevTools
- [ ] Verify no console errors
- [ ] Test with multiple users

## Common Patterns

### Pattern 1: Throttled Callback

```typescript
private lastCallbackTime = 0;
private throttleMs = 33; // ~30 FPS

handleUpdate(data: any) {
  const now = performance.now();
  if (now - this.lastCallbackTime >= this.throttleMs) {
    this.lastCallbackTime = now;
    this.processUpdate(data);
  }
}
```

### Pattern 2: RAF Animation Loop

```typescript
private rafId: number | null = null;

startAnimation() {
  const animate = () => {
    this.update();
    this.rafId = requestAnimationFrame(animate);
  };
  this.rafId = requestAnimationFrame(animate);
}

stopAnimation() {
  if (this.rafId !== null) {
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
```

### Pattern 3: Smooth Interpolation

```typescript
private current = 0;
private target = 0;
private smoothing = 0.3;

updateTarget(newTarget: number) {
  this.target = newTarget;
  if (this.rafId === null) {
    this.startSmoothing();
  }
}

private startSmoothing() {
  const animate = () => {
    const delta = this.target - this.current;
    if (Math.abs(delta) > 0.001) {
      this.current += delta * this.smoothing;
      this.rafId = requestAnimationFrame(animate);
    } else {
      this.current = this.target;
      this.rafId = null;
    }
  };
  this.rafId = requestAnimationFrame(animate);
}
```

## Resources

- [Performance Optimization Guide](./PERFORMANCE_OPTIMIZATION.md)
- [Implementation Summary](./PERFORMANCE_IMPLEMENTATION_SUMMARY.md)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
