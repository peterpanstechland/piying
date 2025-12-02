# Requirements Document

## Introduction

本文档定义了皮影互动系统中"角色专属背景视频"功能的需求。该功能允许每个故事线为不同的动捕角色配置独立的背景视频。例如，在"时间迷途"故事中，用户选择嫦娥角色时播放嫦娥专用背景视频（该视频中嫦娥的戏份被移除），选择宇航员角色时播放宇航员专用背景视频。这样可以实现多角色故事的动捕录制，而无需在后期处理中进行复杂的视频蒙版操作。

## Glossary

- **Storyline**: 故事线，包含背景视频、角色配置、段落时间轴和故事介绍的完整互动场景
- **Motion Capture Character**: 动捕角色，用户在前端选择并进行动作捕捉录制的皮影角色
- **Character-Specific Video**: 角色专属视频，针对特定动捕角色准备的背景视频，该视频中移除了该角色的原始戏份
- **Video Variant**: 视频变体，同一故事线下针对不同角色的多个背景视频版本
- **Default Video**: 默认视频，当角色没有专属视频时使用的通用背景视频
- **Character Selection**: 角色选择，用户在前端选择要进行动捕的角色的交互流程

## Requirements

### Requirement 1: Character-Video Association Management

**User Story:** As an administrator, I want to upload and manage separate background videos for each motion capture character in a storyline, so that users can perform motion capture with character-appropriate backgrounds.

#### Acceptance Criteria

1. WHEN an admin configures a storyline with multiple characters THEN the Character_Video_Manager SHALL allow uploading a separate background video for each character
2. WHEN an admin uploads a character-specific video THEN the Character_Video_Manager SHALL validate that the video duration matches the storyline's base video duration (within 1 second tolerance)
3. WHEN an admin views character video configuration THEN the Character_Video_Manager SHALL display each character with its associated video status (uploaded/missing)
4. WHEN an admin removes a character from a storyline THEN the Character_Video_Manager SHALL delete the associated character-specific video file
5. WHEN an admin updates a character-specific video THEN the Character_Video_Manager SHALL replace the existing video and preserve segment configurations

### Requirement 2: Video Upload and Validation

**User Story:** As an administrator, I want the system to validate character-specific videos, so that all video variants are compatible with the storyline configuration.

#### Acceptance Criteria

1. WHEN an admin uploads a character-specific video THEN the Character_Video_Manager SHALL validate format (MP4, H.264) and extract video metadata
2. WHEN video resolution differs from the base video THEN the Character_Video_Manager SHALL display a warning but allow the upload
3. WHEN video duration differs by more than 1 second from base video THEN the Character_Video_Manager SHALL reject the upload with an error message
4. WHEN upload completes THEN the Character_Video_Manager SHALL generate a thumbnail for the character-video association
5. WHEN an admin uploads a video for a character without an existing video THEN the Character_Video_Manager SHALL create the association and store the video path

### Requirement 3: Frontend Character Selection Integration

**User Story:** As a user, I want to select a character for motion capture and have the system use the appropriate background video, so that my recording appears natural in the final video.

#### Acceptance Criteria

1. WHEN a user selects a storyline with multiple characters THEN the Frontend SHALL display a character selection page showing available characters
2. WHEN a user selects a character THEN the Frontend SHALL retrieve the character-specific video path for that character
3. WHEN a character has no specific video THEN the Frontend SHALL use the storyline's default base video
4. WHEN the session is created THEN the Session_Manager SHALL store the selected character ID and corresponding video path
5. WHEN video rendering occurs THEN the Video_Renderer SHALL use the character-specific video as the background

### Requirement 4: Admin UI for Character-Video Configuration

**User Story:** As an administrator, I want a clear interface to manage character-video associations, so that I can easily configure multi-character storylines.

#### Acceptance Criteria

1. WHEN an admin opens the storyline timeline editor THEN the Character_Video_Manager SHALL display a "Character Videos" section in the property panel
2. WHEN an admin views the character videos section THEN the Character_Video_Manager SHALL show a list of assigned characters with video upload status
3. WHEN an admin clicks upload for a character THEN the Character_Video_Manager SHALL open a file picker for video selection
4. WHEN an admin hovers over a character video entry THEN the Character_Video_Manager SHALL display a preview thumbnail and video duration
5. WHEN an admin deletes a character video THEN the Character_Video_Manager SHALL remove the video file and reset to default video usage

### Requirement 5: Data Model and Storage

**User Story:** As a system architect, I want character-video associations stored efficiently, so that the system can quickly retrieve the correct video for any character selection.

#### Acceptance Criteria

1. WHEN a character-video association is created THEN the Database SHALL store the storyline_id, character_id, and video_path in a dedicated table
2. WHEN querying for a character's video THEN the API SHALL return the specific video path or null if no specific video exists
3. WHEN a storyline is deleted THEN the Database SHALL cascade delete all character-video associations and their video files
4. WHEN a character is deleted THEN the Database SHALL remove all video associations for that character across all storylines
5. WHEN listing storyline details THEN the API SHALL include character-video associations with video metadata

### Requirement 6: Video File Organization

**User Story:** As a system administrator, I want character-specific videos organized in a clear directory structure, so that file management and backup are straightforward.

#### Acceptance Criteria

1. WHEN a character-specific video is uploaded THEN the Storage_Manager SHALL save it to `data/storylines/{storyline_id}/videos/{character_id}.mp4`
2. WHEN multiple videos exist for a storyline THEN the Storage_Manager SHALL maintain separate files for each character
3. WHEN a storyline is exported THEN the Export_Service SHALL include all character-specific videos in the export package
4. WHEN a storyline is imported THEN the Import_Service SHALL restore all character-video associations and video files
5. WHEN disk space is low THEN the Storage_Manager SHALL report which storylines have the most video storage usage

