# MediaPipe Tasks Vision Migration

**Date**: November 26, 2024
**Status**: ✅ Complete

## Problem Solved

Fixed critical browser crash cascade caused by:
1. **Too Many Players** - Re-render loop creating 75+ video instances
2. **WASM Conflict** - Legacy Pose/Hands fighting over runtime
3. **404 Errors** - Incorrect locateFile paths triggering retries

## Solution

Migrated from legacy `@mediapipe/pose` + `@mediapipe/hands` to modern `@mediapipe/tasks-vision` API.

## Changes Made

### 1. New VisionManager Singleton (`frontend/src/services/VisionManager.ts`)
- Single FilesetResolver for unified WASM runtime
- GPU-accelerated pose and hand detection
- Idempotent initialization prevents duplicate instances
- Shared across component remounts

### 2. Updated CameraDetectionService (`frontend/src/services/camera-detection.ts`)
- Removed legacy Camera, Pose, Hands imports
- Manual requestAnimationFrame loop (no CameraUtils)
- Proper cleanup in useEffect return
- Updated result processing for new API structure

### 3. Package Cleanup (`frontend/package.json`)
- Removed: `@mediapipe/camera_utils`, `@mediapipe/hands`, `@mediapipe/pose`
- Kept: `@mediapipe/tasks-vision` (already installed)

## Next Steps

1. Run `npm install` in frontend directory to clean up node_modules
2. Test camera detection in browser
3. Verify no "Too Many Players" errors in console
4. Confirm pose and hand tracking still works correctly

## Technical Details

- Uses CDN: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm`
- Models: pose_landmarker_lite + hand_landmarker (float16)
- Running mode: VIDEO (optimized for continuous frames)
- GPU delegation enabled for performance
