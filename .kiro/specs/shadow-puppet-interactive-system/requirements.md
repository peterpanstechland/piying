# Requirements Document

## Introduction

本系统是一个基于摄像头动作捕捉、手势UI交互、分段动作录制、自动视频渲染与下载的完整互动体验系统。系统在本地部署运行，用户无需任何键鼠或触摸输入，仅通过身体和手势与界面交互。最终用户可在现场完成动作演绎，并获得一个30秒的皮影风格短片，通过二维码扫码下载。

## Glossary

- **System**: 皮影互动短片生成系统
- **User**: 在摄像头前进行互动的体验者
- **Session**: 一次完整的用户体验流程，包含场景选择、动作录制和视频生成
- **Segment**: 动作录制的一个分段，每个场景包含2-4个分段
- **Pose Data**: 人体关键点数据，用于记录用户的动作
- **Cursor**: 由用户手部位置控制的屏幕光标
- **Base Video**: 场景底片视频，30秒固定背景
- **Shadow Puppet**: 皮影效果，将用户动作渲染为皮影风格的角色
- **MediaPipe**: 用于人体和手部检测的机器学习库
- **Backend**: 后端服务，负责Session管理和视频渲染
- **Frontend**: 前端界面，负责用户交互和状态管理

## Requirements

### Requirement 1

**User Story:** 作为用户，我希望系统能自动检测我的出现，这样我可以无需手动操作就开始体验

#### Acceptance Criteria

1. WHEN the System detects no person in camera view THEN the System SHALL display the idle waiting interface
2. WHEN the System continuously detects a person for at least 1 second THEN the System SHALL automatically transition from idle interface to scene selection interface
3. WHILE in idle state, the System SHALL continuously monitor camera feed at a minimum rate of 20 frames per second
4. WHEN the System transitions to scene selection THEN the System SHALL maintain the detected person tracking without interruption

### Requirement 2

**User Story:** 作为用户，我希望通过手势控制光标选择场景，这样我可以无接触地与系统交互

#### Acceptance Criteria

1. WHEN the System detects User hand position THEN the System SHALL map the hand position to a cursor coordinate on the UI layer
2. WHILE in scene selection interface, the System SHALL update cursor position in real-time based on User right hand wrist or index finger position
3. WHEN the cursor moves into a scene card area and remains there continuously for at least 5 seconds THEN the System SHALL select that scene
4. WHEN a scene is selected THEN the System SHALL create a new session via Backend API and transition to motion capture flow
5. WHILE tracking hand position, the System SHALL maintain a frame rate of at least 20 frames per second

### Requirement 3

**User Story:** 作为用户，我希望看到清晰的场景选项，这样我可以选择我喜欢的故事主题

#### Acceptance Criteria

1. WHEN the scene selection interface is displayed THEN the System SHALL show three selectable scenes labeled Scene A, Scene B, and Scene C
2. WHEN displaying each scene THEN the System SHALL include scene name, scene description, and theme icon or element
3. WHEN the cursor hovers over a scene card THEN the System SHALL provide visual feedback indicating the hover state
4. WHEN a scene is being selected THEN the System SHALL display a progress indicator showing the remaining hover time

### Requirement 4

**User Story:** 作为用户，我希望在录制每段动作前看到清晰的指引，这样我知道该做什么动作

#### Acceptance Criteria

1. WHEN entering a motion capture segment THEN the System SHALL display a guidance page with action description for that segment
2. WHEN displaying guidance page THEN the System SHALL include example pose images or text prompts
3. WHEN guidance page is displayed THEN the System SHALL automatically start a 5-second countdown after showing the guidance
4. WHEN countdown reaches zero THEN the System SHALL automatically begin recording without requiring User manual operation

### Requirement 5

**User Story:** 作为用户，我希望系统自动录制我的动作，这样我可以专注于表演而不用操心技术操作

#### Acceptance Criteria

1. WHEN recording begins THEN the System SHALL capture pose landmarks at each frame for a fixed duration of 6 to 10 seconds per segment
2. WHEN capturing each frame THEN the System SHALL save timestamp relative to segment start time and human body pose landmarks
3. WHEN recording completes THEN the System SHALL provide options to re-record current segment or proceed to next segment
4. WHEN all segments are recorded THEN the System SHALL transition to video generation phase
5. WHILE recording, the System SHALL maintain camera tracking at a minimum rate of 20 frames per second

### Requirement 6

**User Story:** 作为用户，我希望能重录不满意的动作段，这样我可以获得更好的最终效果

#### Acceptance Criteria

1. WHEN a segment recording completes THEN the System SHALL display a review interface with re-record and continue options
2. WHEN User selects re-record option THEN the System SHALL discard current segment data and return to guidance page for that segment
3. WHEN User selects continue option THEN the System SHALL save current segment data and proceed to next segment or video generation
4. WHEN re-recording a segment THEN the System SHALL maintain the same segment index and duration settings

### Requirement 7

**User Story:** 作为系统管理员，我希望后端能管理用户会话数据，这样系统可以追踪每个用户的完整体验流程

#### Acceptance Criteria

1. WHEN a scene is selected THEN the Backend SHALL create a new session with unique session ID and scene ID
2. WHEN Frontend uploads segment pose data THEN the Backend SHALL store the data associated with the correct session and segment index
3. WHEN all segments for a session are uploaded THEN the Backend SHALL update session status to processing
4. WHEN querying session status THEN the Backend SHALL return current status including pending, processing, or done
5. WHEN session is created THEN the Backend SHALL initialize session data structure with session ID, scene ID, empty segments array, and pending status

### Requirement 8

**User Story:** 作为用户，我希望系统能将我的动作转换成皮影效果，这样我可以获得独特的艺术化视频

#### Acceptance Criteria

1. WHEN Backend receives all segment pose data for a session THEN the Backend SHALL begin rendering the shadow puppet video
2. WHEN rendering video THEN the Backend SHALL overlay pose data onto the base scene video at corresponding time windows
3. WHEN rendering each frame THEN the Backend SHALL draw shadow puppet skeleton based on pose landmarks at the calculated position
4. WHEN rendering completes THEN the Backend SHALL save the final video as final_{sessionId}.mp4 and update session status to done
5. WHEN rendering video THEN the Backend SHALL complete the process within 10 to 20 seconds

### Requirement 9

**User Story:** 作为用户，我希望看到生成进度并最终观看我的皮影短片，这样我知道系统正在工作并能欣赏成果

#### Acceptance Criteria

1. WHEN all segments are uploaded THEN the Frontend SHALL display a processing interface and poll Backend status
2. WHEN Backend status returns done THEN the Frontend SHALL transition to final result page
3. WHEN final result page is displayed THEN the Frontend SHALL show a video player with the generated video
4. WHEN video player is displayed THEN the Frontend SHALL load video from endpoint /videos/{sessionId}
5. WHILE waiting for video generation, the Frontend SHALL poll Backend status at regular intervals not exceeding 2 seconds

### Requirement 10

**User Story:** 作为用户，我希望通过扫描二维码下载我的视频，这样我可以在手机上保存和分享

#### Acceptance Criteria

1. WHEN final result page is displayed THEN the System SHALL generate a QR code containing the video download URL
2. WHEN generating QR code THEN the System SHALL use the local server LAN address in format http://<local-ip>:8000/videos/<sessionId>
3. WHEN User scans QR code THEN the System SHALL serve the video file for download
4. WHEN final result page is displayed for more than 30 seconds without interaction THEN the System SHALL automatically reset to idle interface
5. WHEN serving video file THEN the Backend SHALL allow access from LAN IP addresses

### Requirement 11

**User Story:** 作为用户，我希望在不想继续体验时能够退出，这样我可以自由控制参与程度

#### Acceptance Criteria

1. WHEN in scene selection interface and no person is detected continuously for 10 seconds THEN the System SHALL automatically return to idle state
2. WHEN in motion capture flow and no person is detected continuously for 15 seconds THEN the System SHALL cancel current session and return to idle state
3. WHEN User leaves during any interactive phase THEN the System SHALL discard incomplete session data
4. WHEN detecting User absence THEN the System SHALL display a countdown warning for the last 5 seconds before timeout
5. WHEN User returns within timeout period THEN the System SHALL cancel the timeout and resume current state

### Requirement 16

**User Story:** 作为用户，我希望能在任何阶段通过特定手势退出，这样我有明确的方式表达不想继续

#### Acceptance Criteria

1. WHEN User raises both hands above head continuously for 3 seconds THEN the System SHALL interpret this as exit gesture
2. WHEN exit gesture is detected THEN the System SHALL display confirmation prompt asking User to confirm exit
3. WHEN User confirms exit by maintaining gesture for additional 2 seconds THEN the System SHALL cancel current session and return to idle state
4. WHEN User lowers hands before confirmation timeout THEN the System SHALL cancel exit action and resume current state
5. WHILE in any interactive state, the System SHALL continuously monitor for exit gesture

### Requirement 17

**User Story:** 作为系统管理员，我希望系统能稳定运行并自动重置，这样可以连续服务多个用户而无需人工干预

#### Acceptance Criteria

1. WHEN the System is deployed THEN the System SHALL run continuously for multiple hours without crashes
2. WHEN resetting to idle state THEN the System SHALL clear current session data from Frontend state and notify Backend to mark session as abandoned
3. WHEN the System runs THEN the System SHALL maintain camera detection and UI responsiveness at minimum 20 frames per second
4. WHERE temporary storage is used, the System SHALL implement a daily cleanup mechanism for old session data
5. WHEN session is abandoned THEN the Backend SHALL mark session status as cancelled and free associated resources

### Requirement 12

**User Story:** 作为用户，我希望整个体验过程流畅无卡顿，这样我可以享受沉浸式的互动体验

#### Acceptance Criteria

1. WHILE the System is running, the System SHALL maintain camera feed processing at a minimum rate of 20 frames per second
2. WHEN transitioning between interface states THEN the System SHALL complete the transition within 1 second
3. WHEN updating cursor position THEN the System SHALL reflect hand movement with latency not exceeding 100 milliseconds
4. WHEN displaying countdown THEN the System SHALL update countdown numbers at 1-second intervals without skipping
5. WHEN playing generated video THEN the System SHALL play at 30 frames per second without frame drops

### Requirement 13

**User Story:** 作为开发者，我希望系统模块化清晰，这样可以方便维护和扩展功能

#### Acceptance Criteria

1. WHEN implementing camera input THEN the System SHALL isolate camera and detection logic in a dedicated module
2. WHEN implementing scene selection THEN the System SHALL separate gesture cursor logic from other UI components
3. WHEN implementing motion capture THEN the System SHALL encapsulate segment recording logic in a reusable module
4. WHEN implementing Backend THEN the System SHALL separate session management API from video rendering logic
5. WHEN implementing Frontend THEN the System SHALL use a state machine pattern to manage interface transitions

### Requirement 14

**User Story:** 作为用户，我希望系统能准确捕捉我的动作数据，这样生成的皮影能真实反映我的表演

#### Acceptance Criteria

1. WHEN capturing pose data THEN the System SHALL use MediaPipe Pose to detect human body landmarks
2. WHEN capturing hand position THEN the System SHALL use MediaPipe Hands to detect hand landmarks
3. WHEN saving pose frame data THEN the System SHALL include all major body joint coordinates in normalized format
4. WHEN uploading pose data to Backend THEN the System SHALL preserve timestamp precision to milliseconds
5. WHEN detecting pose landmarks THEN the System SHALL handle cases where User is partially out of frame without crashing

### Requirement 15

**User Story:** 作为用户，我希望生成的视频质量清晰，这样我可以获得满意的最终作品

#### Acceptance Criteria

1. WHEN rendering final video THEN the Backend SHALL output video at resolution matching the base scene video
2. WHEN rendering final video THEN the Backend SHALL maintain frame rate of 30 frames per second
3. WHEN drawing shadow puppet overlay THEN the Backend SHALL use sufficient line thickness and contrast for visibility
4. WHEN encoding final video THEN the Backend SHALL use H.264 codec for broad device compatibility
5. WHEN serving video file THEN the Backend SHALL set appropriate content-type headers for video playback

### Requirement 18

**User Story:** 作为用户，我希望系统能妥善处理错误情况，这样即使出现问题我也能得到清晰的反馈

#### Acceptance Criteria

1. WHEN camera access is denied or fails THEN the System SHALL display an error message with troubleshooting instructions
2. WHEN Backend API request fails THEN the Frontend SHALL retry the request up to 3 times with exponential backoff
3. WHEN video rendering fails THEN the Backend SHALL log the error and return a failure status to Frontend
4. WHEN rendering failure is detected THEN the Frontend SHALL display an error message and offer option to retry or return to idle
5. WHEN network connection is lost during segment upload THEN the System SHALL cache data locally and retry upload when connection is restored

### Requirement 19

**User Story:** 作为用户，我希望系统能正确处理多人同时出现的情况，这样不会产生混乱的交互

#### Acceptance Criteria

1. WHEN multiple persons are detected in scene selection interface THEN the System SHALL track the person closest to camera center
2. WHEN the tracked person leaves and another person remains THEN the System SHALL switch tracking to the remaining person
3. WHEN multiple persons are detected during motion capture THEN the System SHALL continue tracking the originally selected person
4. WHEN the originally tracked person leaves during recording THEN the System SHALL pause recording and display a warning message
5. WHEN displaying multiple person warning THEN the System SHALL show visual indicator highlighting which person is being tracked

### Requirement 20

**User Story:** 作为系统管理员，我希望能配置场景参数，这样可以灵活调整不同场景的体验

#### Acceptance Criteria

1. WHEN Backend initializes THEN the System SHALL load scene configuration from a JSON configuration file
2. WHEN loading scene configuration THEN the System SHALL read segment count, duration, and character path parameters for each scene
3. WHEN scene configuration is invalid THEN the Backend SHALL log validation errors and use default fallback configuration
4. WHEN rendering video THEN the Backend SHALL apply scene-specific parameters from configuration
5. WHERE scene configuration is updated, the System SHALL reload configuration without requiring full system restart

### Requirement 21

**User Story:** 作为系统管理员，我希望系统能自动管理视频存储，这样不会因为磁盘空间耗尽而导致系统故障

#### Acceptance Criteria

1. WHEN Backend starts THEN the System SHALL check available disk space and log a warning if space is below 5GB
2. WHEN daily cleanup runs THEN the System SHALL delete video files older than 7 days
3. WHEN available disk space falls below 2GB THEN the System SHALL delete oldest videos until space exceeds 3GB
4. WHEN deleting old videos THEN the System SHALL also remove associated session metadata from storage
5. WHEN cleanup process runs THEN the System SHALL log the number of files deleted and space freed

### Requirement 22

**User Story:** 作为系统管理员，我希望系统能记录运行日志和关键指标，这样我可以监控系统健康状态和排查问题

#### Acceptance Criteria

1. WHEN System performs key operations THEN the System SHALL write structured log entries with timestamp, level, and context
2. WHEN errors occur THEN the System SHALL log error details including stack trace and relevant state information
3. WHEN session is created, completed, or cancelled THEN the Backend SHALL log session lifecycle events
4. WHEN video rendering completes THEN the Backend SHALL log rendering duration and output file size
5. WHEN System runs THEN the Backend SHALL expose a health check endpoint returning system status and key metrics

### Requirement 23

**User Story:** 作为用户，我希望界面能显示我熟悉的语言，这样我可以更好地理解指引和提示

#### Acceptance Criteria

1. WHEN System initializes THEN the Frontend SHALL load language configuration from settings
2. WHEN displaying UI text THEN the System SHALL use translations from language resource files
3. WHEN language setting is changed THEN the Frontend SHALL update all displayed text without requiring page reload
4. WHEN translation key is missing THEN the System SHALL fall back to English text and log the missing key
5. WHERE Chinese language is selected, the System SHALL display all interface text, guidance, and prompts in Simplified Chinese
