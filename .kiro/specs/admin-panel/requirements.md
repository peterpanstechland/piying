# Requirements Document

## Introduction

本文档定义了皮影互动系统后台管理面板的需求。该后台系统允许管理员配置人物素材、设置骨骼绑定、管理故事线、配置存储服务，并提供摄像头测试功能。系统使用 SQLite 进行用户认证，支持本地存储和 AWS S3 云存储两种视频存储方式。

## Glossary

- **Admin Panel**: 后台管理系统，用于配置皮影互动系统的各项参数
- **Character**: 人物素材，由多个 PNG 部件组成的皮影角色
- **Part**: 部件，组成人物的单个 PNG 图片（如 head, body, left-arm 等）
- **Pivot Point**: 枢轴点/旋转中心点，部件旋转和连接的基准点
- **Connection Point**: 连接点，部件之间相互连接的位置
- **Storyline**: 故事线/场景，包含背景视频和录制段落配置
- **Segment**: 录制段落，故事线中的一个动作录制片段
- **Skeleton Binding**: 骨骼绑定，将 MediaPipe 检测的关键点映射到人物部件

## Requirements

### Requirement 1: User Authentication

**User Story:** As an administrator, I want to log in to the admin panel securely, so that only authorized users can modify system configurations.

#### Acceptance Criteria

1. WHEN a user visits the admin panel URL THEN the Admin Panel SHALL display a login form requesting username and password
2. WHEN a user submits valid credentials THEN the Admin Panel SHALL create a session and redirect to the dashboard
3. WHEN a user submits invalid credentials THEN the Admin Panel SHALL display an error message and remain on the login page
4. WHEN an authenticated session expires after 24 hours of inactivity THEN the Admin Panel SHALL require re-authentication
5. WHEN an admin user creates a new user account THEN the Admin Panel SHALL store the credentials securely using password hashing in SQLite

### Requirement 2: Character Management

**User Story:** As an administrator, I want to upload and manage character assets, so that I can create new shadow puppet characters for the interactive system.

#### Acceptance Criteria

1. WHEN an admin uploads a set of PNG files for a new character THEN the Admin Panel SHALL validate that all required parts exist (head, body, left-arm, right-arm, left-hand, right-hand, left-foot, right-foot, upper-leg)
2. WHEN an admin creates a new character THEN the Admin Panel SHALL generate a unique identifier and store the character metadata in the database
3. WHEN an admin views the character list THEN the Admin Panel SHALL display all characters with preview thumbnails
4. WHEN an admin deletes a character THEN the Admin Panel SHALL remove the character only if it is not bound to any active storyline
5. WHEN PNG files are uploaded THEN the Admin Panel SHALL validate that files have transparent backgrounds and meet minimum resolution requirements (256x256 pixels)

### Requirement 3: Interactive Pivot Point Editor

**User Story:** As an administrator, I want to visually configure pivot points and connections for character parts, so that the skeleton binding works correctly during rendering.

#### Acceptance Criteria

1. WHEN an admin opens the pivot editor for a character THEN the Admin Panel SHALL display all parts on a canvas where parts can be dragged and positioned
2. WHEN an admin clicks on a part THEN the Admin Panel SHALL allow setting the pivot point by clicking on the desired location within the part
3. WHEN an admin drags a connection handle from one part to another THEN the Admin Panel SHALL create a connection relationship between the two parts
4. WHEN an admin adjusts the z-index slider for a part THEN the Admin Panel SHALL update the rendering order and display a live preview
5. WHEN an admin saves the pivot configuration THEN the Admin Panel SHALL persist all pivot points, connections, and z-index values to the character metadata
6. WHEN the pivot editor loads THEN the Admin Panel SHALL display the current configuration with all existing pivot points and connections visible

### Requirement 4: Skeleton Binding Configuration

**User Story:** As an administrator, I want to configure how MediaPipe landmarks map to character parts, so that the puppet movements match the user's body movements.

#### Acceptance Criteria

1. WHEN an admin opens the skeleton binding editor THEN the Admin Panel SHALL display a diagram of MediaPipe's 33 pose landmarks alongside the character parts
2. WHEN an admin assigns landmarks to a part THEN the Admin Panel SHALL store the mapping (e.g., landmarks 11-13-15 control left-arm rotation)
3. WHEN an admin saves the binding configuration THEN the Admin Panel SHALL validate that all movable parts have at least one landmark assigned
4. WHEN the binding configuration is incomplete THEN the Admin Panel SHALL display warnings indicating which parts lack landmark assignments

### Requirement 5: Camera Testing

**User Story:** As an administrator, I want to test the camera and skeleton binding in real-time, so that I can verify the configuration works correctly before deployment.

#### Acceptance Criteria

1. WHEN an admin opens the camera test page THEN the Admin Panel SHALL request camera access and display the live video feed
2. WHEN a person is detected in the camera feed THEN the Admin Panel SHALL overlay the selected character's parts according to the skeleton binding configuration
3. WHEN an admin selects a different character from the dropdown THEN the Admin Panel SHALL switch the overlay to the newly selected character within 1 second
4. WHEN an admin clicks "Set as Default Camera" THEN the Admin Panel SHALL save the selected camera device ID to system settings
5. WHEN multiple cameras are available THEN the Admin Panel SHALL display a camera selection dropdown listing all available devices

### Requirement 6: Storyline Management

**User Story:** As an administrator, I want to create and configure storylines with background videos and recording segments, so that users can experience different interactive scenarios.

#### Acceptance Criteria

1. WHEN an admin creates a new storyline THEN the Admin Panel SHALL require a name, description, and background video upload
2. WHEN an admin uploads a background video THEN the Admin Panel SHALL validate the video format (MP4, H.264) and extract duration information
3. WHEN an admin configures segments for a storyline THEN the Admin Panel SHALL allow setting segment count (2-4), duration per segment, and movement path for each segment
4. WHEN an admin binds a character to a storyline THEN the Admin Panel SHALL associate the selected character with the storyline configuration
5. WHEN an admin saves a storyline THEN the Admin Panel SHALL validate that total segment duration does not exceed background video duration
6. WHEN an admin views the storyline list THEN the Admin Panel SHALL display all storylines with their bound character and segment count

### Requirement 7: Storage Configuration

**User Story:** As an administrator, I want to configure video storage options, so that generated videos can be stored locally or uploaded to AWS S3.

#### Acceptance Criteria

1. WHEN an admin selects "Local Storage" mode THEN the Admin Panel SHALL configure the system to save videos to the local data directory
2. WHEN an admin selects "AWS S3" mode THEN the Admin Panel SHALL require S3 bucket name, region, access key, and secret key configuration
3. WHEN an admin saves S3 credentials THEN the Admin Panel SHALL test the connection and display success or failure status
4. WHEN S3 connection test fails THEN the Admin Panel SHALL display the specific error message from AWS
5. WHEN storage mode is changed THEN the Admin Panel SHALL update the system configuration without requiring a restart

### Requirement 8: Local Download QR Code Configuration

**User Story:** As an administrator, I want to configure how QR codes are generated for local video downloads, so that users can easily download their videos on mobile devices.

#### Acceptance Criteria

1. WHEN local storage mode is active THEN the Admin Panel SHALL display the current LAN IP address used for QR codes
2. WHEN an admin enables "Auto-detect IP" THEN the Admin Panel SHALL automatically determine the machine's LAN IP address
3. WHEN an admin manually sets an IP address THEN the Admin Panel SHALL use the specified IP for QR code generation
4. WHEN the LAN IP changes THEN the Admin Panel SHALL detect the change and update the QR code base URL accordingly
5. WHEN an admin tests the QR code THEN the Admin Panel SHALL generate a sample QR code and display the encoded URL

### Requirement 9: System Settings

**User Story:** As an administrator, I want to configure general system settings, so that I can customize the interactive experience.

#### Acceptance Criteria

1. WHEN an admin changes the default language setting THEN the Admin Panel SHALL update the frontend display language without requiring a restart
2. WHEN an admin modifies timeout values THEN the Admin Panel SHALL validate that values are within acceptable ranges (1-300 seconds)
3. WHEN an admin changes rendering quality settings THEN the Admin Panel SHALL update the video output resolution and bitrate configuration
4. WHEN settings are saved THEN the Admin Panel SHALL write changes to the configuration file and apply them immediately

### Requirement 10: Dashboard and Statistics

**User Story:** As an administrator, I want to view system statistics and logs, so that I can monitor system health and usage.

#### Acceptance Criteria

1. WHEN an admin views the dashboard THEN the Admin Panel SHALL display today's session count, video generation success rate, and storage usage
2. WHEN an admin views the activity log THEN the Admin Panel SHALL display recent system events with timestamps and details
3. WHEN storage usage exceeds 80% of available space THEN the Admin Panel SHALL display a warning notification
4. WHEN an admin clicks on a log entry THEN the Admin Panel SHALL display the full details including any error stack traces

### Requirement 11: Data Export and Backup

**User Story:** As an administrator, I want to export system configurations and assets, so that I can backup or migrate the system to another machine.

#### Acceptance Criteria

1. WHEN an admin initiates a configuration export THEN the Admin Panel SHALL create a ZIP file containing all character data, storyline configurations, and system settings
2. WHEN an admin imports a configuration backup THEN the Admin Panel SHALL validate the backup format and restore all configurations
3. WHEN importing would overwrite existing data THEN the Admin Panel SHALL display a confirmation dialog listing affected items
4. WHEN export completes THEN the Admin Panel SHALL provide a download link for the backup file
