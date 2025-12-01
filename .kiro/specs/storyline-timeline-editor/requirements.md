# Requirements Document

## Introduction

本文档定义了皮影互动系统故事线时间轴编辑器的需求。该功能为管理员提供一个类似视频剪辑软件的交互界面，用于创建和编辑故事线。管理员可以上传原始故事视频、配置动捕角色的进入/退出时间和方式、设置转场效果、编写故事情节介绍，并上传封面截图。系统需要与前端的故事选择页面保持同步。

## Glossary

- **Storyline**: 故事线，包含背景视频、角色配置、段落时间轴和故事介绍的完整互动场景
- **Timeline Editor**: 时间轴编辑器，类似视频剪辑软件的可视化编辑界面
- **Segment**: 段落/片段，故事线中的一个动作录制时间段
- **Character Entry**: 角色进入，动捕角色出现在画面中的方式和时间点
- **Character Exit**: 角色退出，动捕角色离开画面的方式和时间点
- **Transition**: 转场效果，段落之间的视觉过渡效果
- **Cover Image**: 封面截图，用于在前端故事选择页面显示的预览图片
- **Available Characters**: 可选角色，该故事线允许用户选择的皮影角色列表
- **Playhead**: 播放头，时间轴上表示当前播放位置的指示器
- **Scrubbing**: 拖动播放，通过拖动播放头快速预览视频内容

## Requirements

### Requirement 1: Storyline CRUD Operations

**User Story:** As an administrator, I want to create, read, update, and delete storylines, so that I can manage the interactive scenarios available to users.

#### Acceptance Criteria

1. WHEN an admin creates a new storyline THEN the Storyline_Editor SHALL require a name (Chinese), story synopsis (Chinese), and allow optional English translations
2. WHEN an admin saves a storyline without a background video THEN the Storyline_Editor SHALL save the storyline in draft status and display a warning
3. WHEN an admin views the storyline list THEN the Storyline_Editor SHALL display all storylines with cover images, names, and status indicators
4. WHEN an admin deletes a storyline THEN the Storyline_Editor SHALL remove all associated video files, cover images, and segment configurations
5. WHEN an admin updates storyline basic information THEN the Storyline_Editor SHALL persist changes and update the frontend scene selection data

### Requirement 2: Background Video Upload and Management

**User Story:** As an administrator, I want to upload and manage background videos for storylines, so that I can provide the base content for interactive experiences.

#### Acceptance Criteria

1. WHEN an admin uploads a background video THEN the Storyline_Editor SHALL validate the format (MP4, H.264) and extract video duration and resolution
2. WHEN an admin uploads a video larger than 500MB THEN the Storyline_Editor SHALL display upload progress with percentage and estimated time remaining
3. WHEN video upload completes THEN the Storyline_Editor SHALL generate a video thumbnail and enable the timeline editor
4. WHEN an admin replaces an existing video THEN the Storyline_Editor SHALL warn about segment configuration reset and require confirmation
5. WHEN video processing fails THEN the Storyline_Editor SHALL display the specific error message and allow retry

### Requirement 3: Timeline Editor Interface

**User Story:** As an administrator, I want a visual timeline editor similar to video editing software, so that I can intuitively configure segment timing and character animations.

#### Acceptance Criteria

1. WHEN an admin opens the timeline editor THEN the Storyline_Editor SHALL display a video preview area, timeline track, and property panel
2. WHEN an admin drags the playhead on the timeline THEN the Storyline_Editor SHALL update the video preview to show the corresponding frame within 100ms
3. WHEN an admin clicks on the timeline THEN the Storyline_Editor SHALL move the playhead to the clicked position and update the video preview
4. WHEN an admin zooms the timeline THEN the Storyline_Editor SHALL adjust the time scale while maintaining the playhead position
5. WHEN an admin plays the video THEN the Storyline_Editor SHALL animate the playhead along the timeline in sync with video playback

### Requirement 4: Segment Configuration on Timeline

**User Story:** As an administrator, I want to create and configure segments directly on the timeline, so that I can visually define when motion capture recording occurs.

#### Acceptance Criteria

1. WHEN an admin adds a segment THEN the Storyline_Editor SHALL create a visual block on the timeline at the playhead position with default 10-second duration
2. WHEN an admin drags segment edges THEN the Storyline_Editor SHALL adjust segment start time or duration while preventing overlap with other segments
3. WHEN an admin drags a segment block THEN the Storyline_Editor SHALL move the entire segment to a new time position
4. WHEN an admin selects a segment THEN the Storyline_Editor SHALL highlight the segment and display its properties in the property panel
5. WHEN an admin deletes a segment THEN the Storyline_Editor SHALL remove the segment and re-index remaining segments
6. WHEN total segment duration exceeds video duration THEN the Storyline_Editor SHALL display a validation error and prevent saving

### Requirement 5: Character Entry and Exit Configuration

**User Story:** As an administrator, I want to configure how and when the motion capture character enters and exits each segment, so that I can create smooth character animations.

#### Acceptance Criteria

1. WHEN an admin configures character entry THEN the Storyline_Editor SHALL provide entry type options (fade_in, slide_left, slide_right, slide_up, slide_down, instant)
2. WHEN an admin sets entry timing THEN the Storyline_Editor SHALL allow specifying entry duration (0.5-5 seconds) and delay from segment start
3. WHEN an admin configures character exit THEN the Storyline_Editor SHALL provide exit type options (fade_out, slide_left, slide_right, slide_up, slide_down, instant)
4. WHEN an admin sets exit timing THEN the Storyline_Editor SHALL allow specifying exit duration and time before segment end
5. WHEN an admin previews a segment THEN the Storyline_Editor SHALL animate the character entry and exit according to the configured settings

### Requirement 6: Transition Effects Between Segments

**User Story:** As an administrator, I want to configure transition effects between segments, so that the video flows smoothly between recording sections.

#### Acceptance Criteria

1. WHEN an admin views the timeline with multiple segments THEN the Storyline_Editor SHALL display transition zones between adjacent segments
2. WHEN an admin clicks a transition zone THEN the Storyline_Editor SHALL display transition type options (cut, crossfade, fade_to_black, wipe_left, wipe_right)
3. WHEN an admin selects a transition type THEN the Storyline_Editor SHALL store the transition configuration and display a visual indicator on the timeline
4. WHEN the original video contains built-in transitions THEN the Storyline_Editor SHALL detect and suggest matching transition timing
5. WHEN an admin previews transitions THEN the Storyline_Editor SHALL render a preview of the transition effect between segments

### Requirement 7: Available Characters Configuration

**User Story:** As an administrator, I want to configure which characters are available for each storyline, so that users can choose appropriate characters for different stories.

#### Acceptance Criteria

1. WHEN an admin opens character configuration THEN the Storyline_Editor SHALL display all available characters with preview thumbnails
2. WHEN an admin selects characters for a storyline THEN the Storyline_Editor SHALL allow selecting multiple characters (minimum 1, maximum 10)
3. WHEN an admin sets a default character THEN the Storyline_Editor SHALL mark one character as the default selection for the storyline
4. WHEN an admin reorders characters THEN the Storyline_Editor SHALL update the display order in the frontend character selection
5. WHEN a character is deleted from the system THEN the Storyline_Editor SHALL remove the character from all storyline configurations and notify the admin

### Requirement 8: Story Synopsis and Introduction

**User Story:** As an administrator, I want to write story synopses and introductions, so that users understand the storyline before selecting it.

#### Acceptance Criteria

1. WHEN an admin edits story synopsis THEN the Storyline_Editor SHALL provide a rich text editor with character limit (500 characters Chinese, 1000 characters English)
2. WHEN an admin saves synopsis THEN the Storyline_Editor SHALL validate that Chinese synopsis is provided and English is optional
3. WHEN synopsis is displayed in frontend THEN the Frontend SHALL show the synopsis on the scene selection page below the storyline name
4. WHEN an admin adds segment guidance text THEN the Storyline_Editor SHALL allow per-segment instructions displayed during recording

### Requirement 9: Cover Image Management

**User Story:** As an administrator, I want to upload and manage cover images for storylines, so that users can visually identify storylines in the selection interface.

#### Acceptance Criteria

1. WHEN an admin uploads a cover image THEN the Storyline_Editor SHALL validate format (PNG, JPG, WebP) and minimum resolution (400x300 pixels)
2. WHEN an admin captures a frame from video THEN the Storyline_Editor SHALL allow selecting any frame as the cover image
3. WHEN cover image is uploaded THEN the Storyline_Editor SHALL generate multiple sizes (thumbnail 200x150, medium 400x300, large 800x600)
4. WHEN no cover image is set THEN the Storyline_Editor SHALL use the first frame of the background video as default cover
5. WHEN cover image is updated THEN the Frontend SHALL display the new cover image on the scene selection page within 5 seconds of refresh

### Requirement 10: Frontend Integration

**User Story:** As an administrator, I want storyline changes to reflect in the frontend immediately, so that users always see the latest content.

#### Acceptance Criteria

1. WHEN a storyline is published THEN the Frontend SHALL include the storyline in the scene selection page
2. WHEN a storyline is set to draft THEN the Frontend SHALL hide the storyline from the scene selection page
3. WHEN storyline order is changed THEN the Frontend SHALL display storylines in the configured order
4. WHEN an admin previews frontend THEN the Storyline_Editor SHALL open a preview window showing how the storyline appears in scene selection

### Requirement 11: Timeline Playback Controls

**User Story:** As an administrator, I want standard video playback controls in the timeline editor, so that I can efficiently review and edit storyline content.

#### Acceptance Criteria

1. WHEN an admin clicks play THEN the Storyline_Editor SHALL play the video from the current playhead position
2. WHEN an admin clicks pause THEN the Storyline_Editor SHALL pause playback and keep the playhead at the current position
3. WHEN an admin uses keyboard shortcuts THEN the Storyline_Editor SHALL support Space (play/pause), Left/Right arrows (frame step), Home/End (jump to start/end)
4. WHEN an admin adjusts playback speed THEN the Storyline_Editor SHALL support 0.25x, 0.5x, 1x, 1.5x, and 2x speeds
5. WHEN an admin enables loop mode THEN the Storyline_Editor SHALL loop playback within the selected segment or full video

### Requirement 12: Segment Guidance Images

**User Story:** As an administrator, I want to upload guidance images for each segment, so that users have visual references during motion capture recording.

#### Acceptance Criteria

1. WHEN an admin uploads a guidance image THEN the Storyline_Editor SHALL validate format (PNG, JPG) and display a preview
2. WHEN an admin captures a frame for guidance THEN the Storyline_Editor SHALL allow selecting any video frame as the guidance image
3. WHEN guidance image is set THEN the Frontend SHALL display the image during the corresponding segment recording
4. WHEN no guidance image is set THEN the Frontend SHALL display only the text guidance for that segment

