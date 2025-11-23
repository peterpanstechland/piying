# Design Document

## Overview

皮影互动短片生成系统是一个创新的无接触交互体验系统，通过计算机视觉技术实现用户与系统的自然交互。系统采用前后端分离架构，前端使用React + Vite构建，负责用户界面和实时动作捕捉；后端使用Python + FastAPI构建，负责会话管理和视频渲染。

整个系统的核心流程包括：
1. **人体检测与自动唤醒** - 使用MediaPipe Pose检测用户出现
2. **手势交互选择场景** - 使用MediaPipe Hands实现无接触光标控制
3. **分段动作捕捉** - 录制2-4段用户动作的关键点数据
4. **皮影视频渲染** - 使用OpenCV将动作数据叠加到场景底片上
5. **结果展示与下载** - 生成二维码供用户扫码下载视频

系统设计遵循模块化原则，各模块职责清晰，便于维护和扩展。

## Architecture

### System Architecture

系统采用三层架构：

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Browser)                      │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  UI State      │  │  MediaPipe   │  │  Camera Input   │ │
│  │  Machine       │  │  Detection   │  │  Module         │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
│           │                  │                   │           │
│           └──────────────────┴───────────────────┘           │
│                              │                                │
│                         HTTP/REST API                         │
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│                      Backend (FastAPI)                        │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Session       │  │  Video       │  │  Storage        │ │
│  │  Manager       │  │  Renderer    │  │  Manager        │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
│           │                  │                   │           │
│           └──────────────────┴───────────────────┘           │
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   File System       │
                    │  - Videos           │
                    │  - Sessions         │
                    │  - Configurations   │
                    └─────────────────────┘
```

### Technology Stack

**Frontend:**
- React 18+ - UI框架
- Vite - 构建工具
- MediaPipe (Pose + Hands) - 人体和手部检测
- Canvas API - 视频渲染和光标绘制
- Axios - HTTP客户端
- QRCode.react - 二维码生成
- i18next - 国际化支持

**Backend:**
- Python 3.10+
- FastAPI - Web框架
- OpenCV (cv2) - 视频处理和渲染
- Pydantic - 数据验证
- uvicorn - ASGI服务器
- APScheduler - 定时任务调度

### Module Breakdown

系统分为7个主要模块：

1. **Camera + Detection Module** (Frontend)
   - 摄像头访问和视频流管理
   - MediaPipe Pose和Hands集成
   - 人体检测和手部关键点提取

2. **Scene Selection Interaction Module** (Frontend)
   - 手势光标映射和渲染
   - 场景卡片碰撞检测
   - 悬停计时器和选择逻辑

3. **Multi-Segment Motion Capture Module** (Frontend)
   - 分段录制流程控制
   - Pose数据采集和时间戳记录
   - 本地缓存和上传重试

4. **Session Management Module** (Backend)
   - RESTful API端点
   - 会话生命周期管理
   - 数据持久化

5. **Video Rendering Module** (Backend)
   - OpenCV视频处理管线
   - 皮影骨架绘制
   - 时间窗口映射和路径控制

6. **Frontend UI State Machine Module** (Frontend)
   - 状态机实现
   - 页面组件管理
   - 超时和退出逻辑

7. **QR Code & Video Delivery Module** (Frontend + Backend)
   - 二维码生成
   - 视频文件服务
   - 自动重置逻辑

## Components and Interfaces

### Frontend Components

#### 1. CameraDetectionService

负责摄像头访问和MediaPipe检测。

```typescript
interface DetectionResult {
  presence: boolean;
  rightHand?: { x: number; y: number };
  pose?: PoseLandmark[];
  exitGesture: boolean;
}

class CameraDetectionService {
  async initialize(): Promise<void>
  startDetection(callback: (result: DetectionResult) => void): void
  stopDetection(): void
  getVideoElement(): HTMLVideoElement
}
```

#### 2. StateMachine

管理整个应用的状态转换。

```typescript
enum AppState {
  IDLE = 'IDLE',
  SCENE_SELECT = 'SCENE_SELECT',
  SEGMENT_GUIDE = 'SEGMENT_GUIDE',
  SEGMENT_COUNTDOWN = 'SEGMENT_COUNTDOWN',
  SEGMENT_RECORD = 'SEGMENT_RECORD',
  SEGMENT_REVIEW = 'SEGMENT_REVIEW',
  RENDER_WAIT = 'RENDER_WAIT',
  FINAL_RESULT = 'FINAL_RESULT',
}

interface StateContext {
  sessionId?: string;
  sceneId?: string;
  currentSegment: number;
  totalSegments: number;
  recordedSegments: SegmentData[];
}

class StateMachine {
  transition(newState: AppState, context?: Partial<StateContext>): void
  getCurrentState(): AppState
  getContext(): StateContext
  reset(): void
}
```

#### 3. GestureCursorController

处理手势光标的映射和碰撞检测。

```typescript
interface SceneCard {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
}

class GestureCursorController {
  updateCursorPosition(handPos: { x: number; y: number }): void
  checkHover(cards: SceneCard[]): string | null
  startHoverTimer(cardId: string, duration: number, callback: () => void): void
  cancelHoverTimer(): void
  getCursorPosition(): { x: number; y: number }
}
```

#### 4. MotionCaptureRecorder

录制和管理Pose数据。

```typescript
interface PoseFrame {
  timestamp: number;
  landmarks: PoseLandmark[];
}

interface SegmentData {
  index: number;
  duration: number;
  frames: PoseFrame[];
}

class MotionCaptureRecorder {
  startRecording(segmentIndex: number, duration: number): void
  stopRecording(): SegmentData
  addFrame(landmarks: PoseLandmark[]): void
  isRecording(): boolean
}
```

#### 5. APIClient

与后端通信的客户端。

```typescript
class APIClient {
  async createSession(sceneId: string): Promise<{ sessionId: string }>
  async uploadSegment(sessionId: string, segmentIndex: number, data: SegmentData): Promise<void>
  async getSessionStatus(sessionId: string): Promise<SessionStatus>
  async triggerRender(sessionId: string): Promise<void>
  getVideoUrl(sessionId: string): string
}
```

### Backend Components

#### 1. Session Manager

管理会话的CRUD操作。

```python
from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class SessionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    CANCELLED = "cancelled"
    FAILED = "failed"

class PoseFrame(BaseModel):
    timestamp: float
    landmarks: List[List[float]]

class Segment(BaseModel):
    index: int
    duration: float
    frames: List[PoseFrame]

class Session(BaseModel):
    id: str
    scene_id: str
    status: SessionStatus
    segments: List[Segment]
    output_path: Optional[str]
    created_at: float
    updated_at: float

class SessionManager:
    def create_session(self, scene_id: str) -> Session
    def get_session(self, session_id: str) -> Optional[Session]
    def update_segment(self, session_id: str, segment: Segment) -> None
    def update_status(self, session_id: str, status: SessionStatus) -> None
    def mark_cancelled(self, session_id: str) -> None
    def list_sessions(self, status: Optional[SessionStatus] = None) -> List[Session]
```

#### 2. Video Renderer

使用OpenCV渲染皮影视频。

```python
import cv2
import numpy as np

class CharacterPath:
    """定义角色在场景中的移动路径"""
    def get_offset(self, time: float, segment_index: int) -> tuple[int, int]

class VideoRenderer:
    def __init__(self, scene_config: dict):
        self.scene_config = scene_config
        
    def render_video(self, session: Session) -> str:
        """渲染最终视频，返回输出文件路径"""
        pass
    
    def _draw_puppet(self, frame: np.ndarray, landmarks: List[List[float]], 
                     offset: tuple[int, int]) -> np.ndarray:
        """在帧上绘制皮影骨架"""
        pass
    
    def _map_pose_to_frame(self, global_time: float, segments: List[Segment]) -> Optional[PoseFrame]:
        """根据全局时间找到对应的pose数据"""
        pass
```

#### 3. Storage Manager

管理文件存储和清理。

```python
class StorageManager:
    def __init__(self, base_path: str, max_age_days: int = 7):
        self.base_path = base_path
        self.max_age_days = max_age_days
    
    def save_session(self, session: Session) -> None
    def load_session(self, session_id: str) -> Optional[Session]
    def delete_session(self, session_id: str) -> None
    def cleanup_old_files(self) -> dict[str, int]
    def check_disk_space(self) -> int
    def ensure_space(self, required_gb: int = 3) -> None
```

#### 4. Scene Configuration Loader

加载和验证场景配置。

```python
class SceneConfig(BaseModel):
    id: str
    name: str
    description: str
    base_video_path: str
    segments: List[dict]  # [{duration: 8, path_type: "enter_left"}, ...]
    
class ConfigLoader:
    def load_scenes(self, config_path: str) -> dict[str, SceneConfig]
    def validate_config(self, config: dict) -> bool
    def reload(self) -> None
```

### API Endpoints

```
POST   /api/sessions
       Body: { "scene_id": "sceneA" }
       Response: { "session_id": "uuid", "scene_id": "sceneA", "status": "pending" }

POST   /api/sessions/{session_id}/segments/{segment_index}
       Body: { "index": 0, "duration": 8.0, "frames": [...] }
       Response: { "success": true }

GET    /api/sessions/{session_id}
       Response: { "id": "uuid", "status": "done", "output_path": "..." }

POST   /api/sessions/{session_id}/render
       Response: { "success": true, "status": "processing" }

GET    /api/videos/{session_id}
       Response: video/mp4 file stream

GET    /api/health
       Response: { "status": "healthy", "disk_space_gb": 50, "active_sessions": 2 }

DELETE /api/sessions/{session_id}
       Response: { "success": true }
```

## Data Models

### Frontend Data Models

```typescript
// Pose Landmark (MediaPipe格式)
interface PoseLandmark {
  x: number;        // 归一化坐标 [0, 1]
  y: number;        // 归一化坐标 [0, 1]
  z: number;        // 深度
  visibility: number; // 可见度 [0, 1]
}

// 录制的帧数据
interface PoseFrame {
  timestamp: number;  // 毫秒，相对于segment开始时间
  landmarks: PoseLandmark[];
}

// 分段数据
interface SegmentData {
  index: number;
  duration: number;  // 秒
  frames: PoseFrame[];
}

// 场景信息
interface Scene {
  id: string;
  name: string;
  description: string;
  icon: string;
  segmentCount: number;
}

// 会话状态
interface SessionStatus {
  id: string;
  sceneId: string;
  status: 'pending' | 'processing' | 'done' | 'cancelled' | 'failed';
  outputPath?: string;
}
```

### Backend Data Models

```python
# 存储在文件系统的Session JSON格式
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "scene_id": "sceneA",
  "status": "done",
  "segments": [
    {
      "index": 0,
      "duration": 8.0,
      "frames": [
        {
          "timestamp": 0.033,
          "landmarks": [[0.5, 0.3, -0.1, 0.99], ...]
        },
        ...
      ]
    },
    ...
  ],
  "output_path": "outputs/final_550e8400.mp4",
  "created_at": 1700000000.0,
  "updated_at": 1700000020.0
}

# 场景配置JSON格式
{
  "scenes": {
    "sceneA": {
      "id": "sceneA",
      "name": "武术表演",
      "description": "展示你的武术动作",
      "base_video_path": "assets/scenes/sceneA_base.mp4",
      "segments": [
        {
          "duration": 8,
          "path_type": "enter_left",
          "offset_start": [-200, 0],
          "offset_end": [0, 0]
        },
        {
          "duration": 10,
          "path_type": "static",
          "offset_start": [0, 0],
          "offset_end": [0, 0]
        },
        {
          "duration": 12,
          "path_type": "exit_right",
          "offset_start": [0, 0],
          "offset_end": [200, -100]
        }
      ]
    },
    "sceneB": { ... },
    "sceneC": { ... }
  }
}
```

### Database Schema

系统使用文件系统存储，不需要传统数据库。文件组织结构：

```
data/
├── sessions/
│   ├── {session_id}.json      # 会话元数据和pose数据
│   └── ...
├── outputs/
│   ├── final_{session_id}.mp4 # 生成的视频
│   └── ...
├── config/
│   ├── scenes.json            # 场景配置
│   └── settings.json          # 系统设置
└── logs/
    └── app.log                # 应用日志
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Person detection triggers state transition

*For any* detection sequence where a person is continuously detected for at least 1 second, the system should automatically transition from IDLE state to SCENE_SELECT state.

**Validates: Requirements 1.2**

### Property 2: Hand position maps to valid cursor coordinates

*For any* hand position detected by MediaPipe (normalized coordinates in [0, 1]), the system should map it to a valid cursor coordinate within the UI canvas bounds.

**Validates: Requirements 2.1**

### Property 3: Hover selection requires continuous presence

*For any* scene card, if the cursor remains within the card bounds continuously for at least 5 seconds, the system should trigger scene selection and create a session.

**Validates: Requirements 2.3, 2.4**

### Property 4: All scenes contain required display elements

*For any* scene in the scene selection interface, the rendered output should contain scene name, description, and icon element.

**Validates: Requirements 3.2**

### Property 5: Countdown triggers automatic recording

*For any* motion capture segment, when the 5-second countdown completes, the system should automatically begin recording without user action.

**Validates: Requirements 4.4**

### Property 6: Recording captures frames for configured duration

*For any* segment with configured duration D seconds, recording should capture pose frames for exactly D seconds (±100ms tolerance).

**Validates: Requirements 5.1**

### Property 7: All captured frames contain required data

*For any* captured pose frame, it should contain a timestamp (relative to segment start) and an array of pose landmarks.

**Validates: Requirements 5.2**

### Property 8: Segment data round-trip preservation

*For any* segment data uploaded to the backend, retrieving the session should return the same segment data with matching index, duration, and frame count.

**Validates: Requirements 7.2**

### Property 9: Complete segments trigger processing status

*For any* session, when the number of uploaded segments equals the configured segment count for that scene, the session status should transition to "processing".

**Validates: Requirements 7.3**

### Property 10: New sessions have correct initial state

*For any* newly created session, it should have a unique session ID, the selected scene ID, an empty segments array, and status set to "pending".

**Validates: Requirements 7.5**

### Property 11: Rendered video uses correct time windows

*For any* frame at global time T in the rendered video, the pose data should come from the segment whose time window contains T.

**Validates: Requirements 8.2**

### Property 12: Rendering completion updates status and creates file

*For any* session that completes rendering, the output file should exist at path `final_{sessionId}.mp4` and the session status should be "done".

**Validates: Requirements 8.4**

### Property 13: Video URL follows naming convention

*For any* session ID, the video URL should match the pattern `/videos/{sessionId}`.

**Validates: Requirements 9.4**

### Property 14: QR code contains correct URL format

*For any* generated QR code, the embedded URL should match the format `http://<local-ip>:8000/videos/<sessionId>`.

**Validates: Requirements 10.2**

### Property 15: Inactivity timeout triggers reset

*For any* state with configured timeout duration T, if no person is detected continuously for T seconds, the system should reset to IDLE state.

**Validates: Requirements 11.1, 11.2**

### Property 16: Timeout cancellation on user return

*For any* active timeout countdown, if a person is detected again before the timeout completes, the timeout should be cancelled and the current state should be maintained.

**Validates: Requirements 11.5**

### Property 17: Exit gesture requires sustained pose

*For any* pose sequence where both hands are raised above head continuously for 3 seconds, the system should detect this as an exit gesture.

**Validates: Requirements 16.1**

### Property 18: Exit confirmation requires additional duration

*For any* detected exit gesture, if the gesture is maintained for an additional 2 seconds (5 seconds total), the system should cancel the session and return to IDLE.

**Validates: Requirements 16.3**

### Property 19: Reset clears frontend state and notifies backend

*For any* reset to IDLE state, the frontend should clear all session data from local state and send a cancellation notification to the backend.

**Validates: Requirements 17.2**

### Property 20: Abandoned sessions marked as cancelled

*For any* session that is abandoned (user leaves or exits), the backend should mark the session status as "cancelled".

**Validates: Requirements 17.5**

### Property 21: State transitions complete within time limit

*For any* state transition, the transition should complete within 1 second.

**Validates: Requirements 12.2**

### Property 22: Cursor latency within acceptable range

*For any* hand position update, the cursor position should update within 100 milliseconds.

**Validates: Requirements 12.3**

### Property 23: Saved frames contain normalized coordinates

*For any* saved pose frame, all landmark coordinates should be in normalized format (values between 0 and 1).

**Validates: Requirements 14.3**

### Property 24: Timestamp precision preserved in upload

*For any* pose data uploaded to backend, timestamps should preserve millisecond precision (no loss of precision beyond 1ms).

**Validates: Requirements 14.4**

### Property 25: Rendered video matches base video resolution

*For any* rendered video, the output resolution should exactly match the base scene video resolution.

**Validates: Requirements 15.1**

### Property 26: Rendered video maintains target frame rate

*For any* rendered video, the frame rate should be 30 FPS (±1 FPS tolerance).

**Validates: Requirements 15.2**

### Property 27: Rendered video uses H.264 codec

*For any* rendered video file, the video codec should be H.264.

**Validates: Requirements 15.4**

### Property 28: Video responses include correct content-type

*For any* video file request, the HTTP response should include `Content-Type: video/mp4` header.

**Validates: Requirements 15.5**

### Property 29: Failed requests trigger retry with backoff

*For any* failed backend API request, the frontend should retry up to 3 times with exponential backoff delays.

**Validates: Requirements 18.2**

### Property 30: Rendering failures update status and log

*For any* video rendering failure, the backend should log the error details and set the session status to "failed".

**Validates: Requirements 18.3**

### Property 31: Network interruption triggers local caching

*For any* segment upload that fails due to network error, the system should cache the data locally and retry when connection is restored.

**Validates: Requirements 18.5**

### Property 32: Multi-person detection tracks center person

*For any* scenario where multiple persons are detected, the system should track the person whose center point is closest to the camera center.

**Validates: Requirements 19.1**

### Property 33: Tracking switches when tracked person leaves

*For any* scenario where the tracked person leaves the frame and another person remains, the system should switch tracking to the remaining person.

**Validates: Requirements 19.2**

### Property 34: Recording persists original person tracking

*For any* recording session, if multiple persons appear after recording starts, the system should continue tracking the originally selected person.

**Validates: Requirements 19.3**

### Property 35: Tracked person departure pauses recording

*For any* active recording, if the originally tracked person leaves the frame, the system should pause recording and display a warning.

**Validates: Requirements 19.4**

### Property 36: Scene configuration contains required parameters

*For any* scene in the configuration file, it should contain segment count, duration, and character path parameters.

**Validates: Requirements 20.2**

### Property 37: Rendering applies scene-specific parameters

*For any* video rendering, the system should use the segment durations and character paths defined in that scene's configuration.

**Validates: Requirements 20.4**

### Property 38: Cleanup deletes files older than threshold

*For any* file with creation date older than 7 days, the daily cleanup process should delete the file.

**Validates: Requirements 21.2**

### Property 39: Emergency cleanup frees space to threshold

*For any* emergency cleanup triggered by low disk space (<2GB), the process should delete oldest files until available space exceeds 3GB.

**Validates: Requirements 21.3**

### Property 40: Video deletion removes associated metadata

*For any* video file deleted by cleanup, the associated session metadata file should also be deleted.

**Validates: Requirements 21.4**

### Property 41: Cleanup logs metrics

*For any* cleanup process execution, the system should log the number of files deleted and the amount of space freed.

**Validates: Requirements 21.5**

### Property 42: Log entries contain required fields

*For any* key operation, the log entry should contain timestamp, log level, and context information.

**Validates: Requirements 22.1**

### Property 43: Error logs include stack traces

*For any* error that occurs, the log entry should include error details, stack trace, and relevant state information.

**Validates: Requirements 22.2**

### Property 44: Session lifecycle events are logged

*For any* session creation, completion, or cancellation, the backend should create a log entry for that lifecycle event.

**Validates: Requirements 22.3**

### Property 45: Render completion logs performance metrics

*For any* completed video rendering, the log should include rendering duration and output file size.

**Validates: Requirements 22.4**

### Property 46: UI text comes from translation files

*For any* displayed UI text, the content should be loaded from language resource files, not hardcoded in components.

**Validates: Requirements 23.2**

### Property 47: Language change updates UI without reload

*For any* language setting change, all displayed text should update to the new language without requiring a page reload.

**Validates: Requirements 23.3**

### Property 48: Missing translations fall back to English

*For any* translation key that is missing in the selected language, the system should display the English text and log the missing key.

**Validates: Requirements 23.4**

## Error Handling

### Frontend Error Handling

1. **Camera Access Errors**
   - Catch `getUserMedia` failures
   - Display user-friendly error message with troubleshooting steps
   - Provide retry button
   - Log error details for debugging

2. **MediaPipe Initialization Errors**
   - Handle model loading failures
   - Fall back to simplified detection if possible
   - Display error message if detection is unavailable

3. **API Request Errors**
   - Implement retry logic with exponential backoff (3 attempts)
   - Cache data locally if upload fails
   - Display error toast with retry option
   - Maintain request queue for offline resilience

4. **State Machine Errors**
   - Validate state transitions
   - Log invalid transition attempts
   - Provide safe fallback to IDLE state
   - Prevent infinite loops with transition counters

5. **Timeout Handling**
   - Clear all timers on state transitions
   - Prevent timer leaks with cleanup
   - Handle edge cases (user returns just before timeout)

### Backend Error Handling

1. **Session Not Found**
   - Return 404 with clear error message
   - Log session ID for debugging
   - Suggest checking session expiration

2. **Video Rendering Errors**
   - Catch OpenCV exceptions
   - Log full error details and stack trace
   - Update session status to "failed"
   - Clean up partial output files
   - Return error response to frontend

3. **File System Errors**
   - Handle disk full scenarios
   - Trigger emergency cleanup if space is low
   - Log all file operations
   - Validate file paths to prevent directory traversal

4. **Configuration Errors**
   - Validate JSON schema on load
   - Use default fallback configuration if invalid
   - Log validation errors with details
   - Continue operation with defaults

5. **Concurrent Access**
   - Use file locking for session updates
   - Handle race conditions in status updates
   - Implement atomic operations where possible

### Error Recovery Strategies

1. **Graceful Degradation**
   - Continue operation with reduced functionality if possible
   - Example: If hand detection fails, allow timeout-based selection

2. **Automatic Retry**
   - Network requests: 3 retries with exponential backoff
   - File operations: 2 retries with short delay
   - Video rendering: 1 retry after cleanup

3. **User Notification**
   - Display clear, actionable error messages
   - Provide options: Retry, Return to Start, Exit
   - Show progress during retry attempts

4. **Logging and Monitoring**
   - Log all errors with context
   - Include session ID, state, and user actions
   - Monitor error rates for system health

## Testing Strategy

### Unit Testing

The system will use unit tests to verify specific examples, edge cases, and component behavior:

**Frontend Unit Tests (Jest + React Testing Library):**
- Component rendering and props handling
- State machine transition logic
- Cursor collision detection with specific coordinates
- Timer and countdown logic
- API client request formatting
- Error boundary behavior

**Backend Unit Tests (pytest):**
- Session CRUD operations
- Configuration loading and validation
- File path generation and validation
- Storage manager operations
- API endpoint request/response handling
- Error handling for specific scenarios

**Key Unit Test Examples:**
- Test that IDLE state displays waiting interface
- Test that scene selection with 3 scenes renders correctly
- Test that camera access denial shows error message
- Test that invalid configuration triggers fallback
- Test that health endpoint returns expected format

### Property-Based Testing

The system will use property-based testing to verify universal properties across all inputs:

**Property Testing Library:**
- Frontend: fast-check (JavaScript/TypeScript property testing)
- Backend: Hypothesis (Python property testing)

**Configuration:**
- Each property test should run a minimum of 100 iterations
- Use appropriate generators for domain-specific data (coordinates, timestamps, session IDs)
- Configure shrinking to find minimal failing examples

**Property Test Tagging:**
Each property-based test must include a comment tag in this exact format:
```
// Feature: shadow-puppet-interactive-system, Property 1: Person detection triggers state transition
```

**Key Property Tests:**

1. **Coordinate Mapping (Property 2)**
   - Generate random hand positions in [0, 1]
   - Verify all map to valid cursor coordinates within canvas bounds

2. **Hover Selection (Property 3)**
   - Generate random cursor paths and timing
   - Verify selection only triggers after continuous 5-second hover

3. **Segment Data Round-Trip (Property 8)**
   - Generate random segment data
   - Upload to backend, retrieve session
   - Verify data matches exactly

4. **Time Window Mapping (Property 11)**
   - Generate random global times within video duration
   - Verify pose data comes from correct segment

5. **Timeout Logic (Property 15)**
   - Generate random detection sequences with gaps
   - Verify timeout triggers only after continuous absence

6. **Coordinate Normalization (Property 23)**
   - Generate random pose data
   - Verify all saved coordinates are in [0, 1] range

7. **Retry Backoff (Property 29)**
   - Generate random API failures
   - Verify retry count and exponential delay timing

8. **Multi-Person Tracking (Property 32)**
   - Generate random multi-person detection results
   - Verify system tracks person closest to center

9. **Cleanup Threshold (Property 38)**
   - Generate random file sets with various ages
   - Verify only files older than 7 days are deleted

10. **Translation Fallback (Property 48)**
    - Generate random translation keys
    - Verify missing keys fall back to English and log

### Integration Testing

Integration tests verify end-to-end workflows:

1. **Complete User Flow**
   - Simulate full journey from idle to video download
   - Verify all state transitions occur correctly
   - Check that video file is created and accessible

2. **API Integration**
   - Test all API endpoints with real backend
   - Verify request/response formats
   - Test error scenarios (404, 500, timeout)

3. **Video Rendering Pipeline**
   - Test with real pose data and base videos
   - Verify output video quality and format
   - Check rendering performance

4. **Storage and Cleanup**
   - Test file creation, retrieval, and deletion
   - Verify cleanup runs correctly
   - Test disk space monitoring

### Performance Testing

Performance tests verify system meets timing requirements:

1. **Frame Rate Testing**
   - Measure camera feed processing FPS
   - Verify maintains ≥20 FPS during all states
   - Test with various hardware configurations

2. **Latency Testing**
   - Measure cursor update latency
   - Verify ≤100ms from hand movement to cursor update
   - Test state transition timing (≤1 second)

3. **Rendering Performance**
   - Measure video rendering duration
   - Verify completes within 10-20 seconds
   - Test with various segment counts and durations

4. **Load Testing**
   - Test multiple concurrent sessions
   - Verify system stability over extended periods
   - Monitor resource usage (CPU, memory, disk)

### Test Environment Setup

**Frontend Testing:**
```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom fast-check
```

**Backend Testing:**
```bash
pip install pytest pytest-asyncio hypothesis pytest-cov
```

**Test Data:**
- Mock MediaPipe detection results
- Sample pose data files
- Test base videos (short duration for speed)
- Sample scene configurations

### Continuous Testing

- Run unit tests on every commit
- Run property tests nightly (due to longer duration)
- Run integration tests before releases
- Monitor test coverage (target: >80% for critical paths)

## Implementation Notes

### Frontend Implementation Priorities

1. **Phase 1: Core Detection and State Machine**
   - Camera access and MediaPipe integration
   - Basic state machine with IDLE and SCENE_SELECT states
   - Person detection triggering state transitions

2. **Phase 2: Scene Selection**
   - Hand tracking and cursor rendering
   - Scene card UI and hover detection
   - Selection timer and API integration

3. **Phase 3: Motion Capture**
   - Segment guidance and countdown UI
   - Pose data recording and storage
   - Review interface with re-record option

4. **Phase 4: Result and Polish**
   - Processing UI with status polling
   - Video player and QR code generation
   - Timeout and exit gesture handling
   - Error handling and retry logic

### Backend Implementation Priorities

1. **Phase 1: API and Session Management**
   - FastAPI setup and endpoint structure
   - Session CRUD operations
   - File-based storage implementation

2. **Phase 2: Video Rendering**
   - OpenCV video processing pipeline
   - Pose data to skeleton drawing
   - Time window mapping logic

3. **Phase 3: Configuration and Storage**
   - Scene configuration loader
   - Storage manager with cleanup
   - Disk space monitoring

4. **Phase 4: Monitoring and Optimization**
   - Structured logging
   - Health check endpoint
   - Performance optimization
   - Error handling refinement

### Key Technical Decisions

1. **Why File-Based Storage?**
   - Simplicity for local deployment
   - No database setup required
   - Easy to inspect and debug
   - Sufficient for single-machine deployment

2. **Why MediaPipe?**
   - High accuracy for pose and hand detection
   - Runs efficiently in browser
   - Well-documented and maintained
   - Free and open source

3. **Why React State Machine?**
   - Clear state transitions
   - Easier to debug and test
   - Prevents invalid state combinations
   - Scales well with complexity

4. **Why OpenCV for Rendering?**
   - Powerful video processing capabilities
   - Precise frame-by-frame control
   - Efficient performance
   - Python integration

### Performance Optimization Strategies

1. **Frontend Optimizations**
   - Use requestAnimationFrame for smooth cursor updates
   - Throttle detection callbacks to 20 FPS minimum
   - Lazy load MediaPipe models
   - Use Web Workers for heavy processing if needed

2. **Backend Optimizations**
   - Cache scene configurations in memory
   - Use efficient video codecs (H.264)
   - Implement video rendering as async task
   - Batch file operations in cleanup

3. **Network Optimizations**
   - Compress pose data before upload
   - Use chunked transfer for large uploads
   - Implement request queuing
   - Cache static assets

### Security Considerations

1. **Input Validation**
   - Validate all API inputs with Pydantic
   - Sanitize file paths to prevent traversal
   - Limit upload sizes
   - Validate session IDs format

2. **Resource Limits**
   - Limit concurrent sessions
   - Implement rate limiting on API endpoints
   - Set maximum video file sizes
   - Monitor and limit disk usage

3. **Network Security**
   - Use CORS appropriately for LAN access
   - Validate origin for sensitive operations
   - Implement request timeouts
   - Log all access attempts

### Deployment Considerations

1. **System Requirements**
   - Python 3.10+ with OpenCV
   - Node.js 18+ for frontend build
   - Minimum 8GB RAM
   - Minimum 50GB free disk space
   - Webcam with 720p+ resolution

2. **Installation Steps**
   - Install Python dependencies
   - Build frontend production bundle
   - Configure scene files and base videos
   - Set up systemd service for auto-start
   - Configure firewall for LAN access

3. **Configuration Files**
   - `config/scenes.json` - Scene definitions
   - `config/settings.json` - System settings
   - `.env` - Environment variables (ports, paths)

4. **Monitoring**
   - Check logs daily for errors
   - Monitor disk space usage
   - Verify cleanup runs successfully
   - Test camera and detection periodically
