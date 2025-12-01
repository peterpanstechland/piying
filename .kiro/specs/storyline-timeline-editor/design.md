# Design Document: Storyline Timeline Editor

## Overview

The Storyline Timeline Editor is an advanced visual editing interface for creating and managing interactive storylines in the Shadow Puppet Interactive System. It provides a video editing-like experience where administrators can upload background videos, configure motion capture segments on a visual timeline, set character entry/exit animations, configure transitions, and manage story metadata. The editor integrates with the existing admin panel and syncs with the frontend scene selection page.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Storyline Timeline Editor (React)                        │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                   │
│  │  Video Preview │ │ Timeline Track │ │ Property Panel │                   │
│  │    Component   │ │   Component    │ │   Component    │                   │
│  └───────┬────────┘ └───────┬────────┘ └───────┬────────┘                   │
│          │                  │                  │                             │
│  ┌───────┴──────────────────┴──────────────────┴───────┐                    │
│  │              Timeline Editor Context                 │                    │
│  │  (playhead, segments, zoom, selection state)         │                    │
│  └──────────────────────────┬───────────────────────────┘                    │
│                             │                                                │
│  ┌──────────────────────────┴───────────────────────────┐                    │
│  │              Storyline API Client                     │                    │
│  └──────────────────────────┬───────────────────────────┘                    │
└─────────────────────────────┼────────────────────────────────────────────────┘
                              │ HTTP/REST
┌─────────────────────────────┼────────────────────────────────────────────────┐
│                        FastAPI Backend                                        │
│  ┌──────────────────────────┴───────────────────────────┐                    │
│  │           Storyline API Router (/api/admin/storylines)│                    │
│  └──────────┬───────────────┬───────────────┬───────────┘                    │
│             │               │               │                                │
│  ┌──────────┴──┐ ┌──────────┴──┐ ┌──────────┴──┐                            │
│  │  Storyline  │ │   Video     │ │   Image     │                            │
│  │   Service   │ │  Processor  │ │  Processor  │                            │
│  └─────────────┘ └─────────────┘ └─────────────┘                            │
│             │               │               │                                │
│  ┌──────────┴───────────────┴───────────────┴───────────┐                    │
│  │              SQLite Database + File Storage           │                    │
│  └───────────────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Frontend Components

#### 1. Timeline Editor Page (`StorylineTimelineEditor.tsx`)
Main container component that orchestrates the timeline editing experience.

```typescript
interface TimelineEditorState {
  storyline: Storyline | null;
  playhead: number;           // Current time in seconds
  zoom: number;               // Timeline zoom level (1-10)
  selectedSegmentId: string | null;
  isPlaying: boolean;
  playbackSpeed: number;      // 0.25, 0.5, 1, 1.5, 2
}
```

#### 2. Video Preview Component (`VideoPreview.tsx`)
Displays the background video with playback controls and frame capture capability.

```typescript
interface VideoPreviewProps {
  videoUrl: string;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onTimeUpdate: (time: number) => void;
  onFrameCapture: (imageData: string) => void;
}
```

#### 3. Timeline Track Component (`TimelineTrack.tsx`)
Visual timeline with draggable segments, playhead, and transition zones.

```typescript
interface TimelineTrackProps {
  duration: number;           // Video duration in seconds
  segments: TimelineSegment[];
  transitions: Transition[];
  playhead: number;
  zoom: number;
  selectedSegmentId: string | null;
  onPlayheadChange: (time: number) => void;
  onSegmentChange: (segment: TimelineSegment) => void;
  onSegmentSelect: (segmentId: string | null) => void;
  onTransitionChange: (transition: Transition) => void;
}

interface TimelineSegment {
  id: string;
  index: number;
  startTime: number;
  duration: number;
  entryAnimation: AnimationConfig;
  exitAnimation: AnimationConfig;
  guidanceText: string;
  guidanceTextEn: string;
  guidanceImage: string | null;
}

interface AnimationConfig {
  type: 'fade_in' | 'fade_out' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'instant';
  duration: number;           // 0.5-5 seconds
  delay: number;              // Delay from segment start/end
}

interface Transition {
  id: string;
  fromSegmentId: string;
  toSegmentId: string;
  type: 'cut' | 'crossfade' | 'fade_to_black' | 'wipe_left' | 'wipe_right';
  duration: number;
}
```

#### 4. Property Panel Component (`PropertyPanel.tsx`)
Context-sensitive panel showing properties of selected segment or transition.

```typescript
interface PropertyPanelProps {
  selectedSegment: TimelineSegment | null;
  selectedTransition: Transition | null;
  onSegmentUpdate: (segment: TimelineSegment) => void;
  onTransitionUpdate: (transition: Transition) => void;
  onGuidanceImageUpload: (file: File) => void;
  onGuidanceImageCapture: () => void;
}
```

#### 5. Character Selector Component (`CharacterSelector.tsx`)
Multi-select interface for configuring available characters.

```typescript
interface CharacterSelectorProps {
  allCharacters: Character[];
  selectedCharacterIds: string[];
  defaultCharacterId: string | null;
  onSelectionChange: (characterIds: string[]) => void;
  onDefaultChange: (characterId: string) => void;
  onReorder: (characterIds: string[]) => void;
}
```

#### 6. Cover Image Manager Component (`CoverImageManager.tsx`)
Upload and frame capture interface for cover images.

```typescript
interface CoverImageManagerProps {
  currentCoverUrl: string | null;
  videoUrl: string | null;
  onUpload: (file: File) => void;
  onFrameCapture: (time: number) => void;
}
```

### Backend API Endpoints

#### Storyline Management
```
GET    /api/admin/storylines                    - List all storylines with status
POST   /api/admin/storylines                    - Create new storyline
GET    /api/admin/storylines/{id}               - Get storyline details
PUT    /api/admin/storylines/{id}               - Update storyline metadata
DELETE /api/admin/storylines/{id}               - Delete storyline and all assets
PUT    /api/admin/storylines/{id}/publish       - Publish storyline
PUT    /api/admin/storylines/{id}/unpublish     - Set storyline to draft
PUT    /api/admin/storylines/{id}/order         - Update storyline display order
```

#### Video Management
```
POST   /api/admin/storylines/{id}/video         - Upload background video
DELETE /api/admin/storylines/{id}/video         - Remove background video
GET    /api/admin/storylines/{id}/video/frame   - Get frame at specific time
POST   /api/admin/storylines/{id}/video/thumbnail - Generate thumbnail at time
```

#### Segment Management
```
GET    /api/admin/storylines/{id}/segments      - Get all segments
PUT    /api/admin/storylines/{id}/segments      - Update all segments (batch)
POST   /api/admin/storylines/{id}/segments/{segId}/guidance-image - Upload guidance image
POST   /api/admin/storylines/{id}/segments/{segId}/capture-guidance - Capture frame as guidance
```

#### Transition Management
```
GET    /api/admin/storylines/{id}/transitions   - Get all transitions
PUT    /api/admin/storylines/{id}/transitions   - Update transitions (batch)
```

#### Character Configuration
```
GET    /api/admin/storylines/{id}/characters    - Get available characters for storyline
PUT    /api/admin/storylines/{id}/characters    - Update character configuration
```

#### Cover Image Management
```
POST   /api/admin/storylines/{id}/cover         - Upload cover image
POST   /api/admin/storylines/{id}/cover/capture - Capture video frame as cover
DELETE /api/admin/storylines/{id}/cover         - Remove cover image (use default)
```

#### Frontend Integration
```
GET    /api/storylines                          - Get published storylines for frontend
GET    /api/storylines/{id}                     - Get storyline details for frontend
```

## Data Models

### Extended Storyline Model
```python
class StorylineStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"

class AnimationType(str, Enum):
    FADE_IN = "fade_in"
    FADE_OUT = "fade_out"
    SLIDE_LEFT = "slide_left"
    SLIDE_RIGHT = "slide_right"
    SLIDE_UP = "slide_up"
    SLIDE_DOWN = "slide_down"
    INSTANT = "instant"

class TransitionType(str, Enum):
    CUT = "cut"
    CROSSFADE = "crossfade"
    FADE_TO_BLACK = "fade_to_black"
    WIPE_LEFT = "wipe_left"
    WIPE_RIGHT = "wipe_right"

class AnimationConfig(BaseModel):
    type: AnimationType = AnimationType.INSTANT
    duration: float = Field(default=1.0, ge=0.5, le=5.0)
    delay: float = Field(default=0.0, ge=0.0)

class TimelineSegment(BaseModel):
    id: str
    index: int
    start_time: float = Field(..., ge=0)
    duration: float = Field(..., gt=0)
    entry_animation: AnimationConfig
    exit_animation: AnimationConfig
    guidance_text: str = ""
    guidance_text_en: str = ""
    guidance_image: Optional[str] = None

class Transition(BaseModel):
    id: str
    from_segment_index: int
    to_segment_index: int
    type: TransitionType = TransitionType.CUT
    duration: float = Field(default=0.5, ge=0.1, le=3.0)

class StorylineCharacterConfig(BaseModel):
    character_ids: List[str] = Field(..., min_length=1, max_length=10)
    default_character_id: str
    display_order: List[str]  # Ordered list of character IDs

class CoverImage(BaseModel):
    original_path: str
    thumbnail_path: str      # 200x150
    medium_path: str         # 400x300
    large_path: str          # 800x600

class StorylineExtended(BaseModel):
    id: str
    name: str
    name_en: str = ""
    synopsis: str                    # Story synopsis (Chinese)
    synopsis_en: str = ""            # Story synopsis (English)
    description: str = ""            # Short description
    description_en: str = ""
    icon: str = "📖"
    status: StorylineStatus = StorylineStatus.DRAFT
    display_order: int = 0
    
    # Video
    base_video_path: Optional[str] = None
    video_duration: float = 0.0
    video_resolution: Optional[Tuple[int, int]] = None
    
    # Cover
    cover_image: Optional[CoverImage] = None
    
    # Timeline
    segments: List[TimelineSegment] = []
    transitions: List[Transition] = []
    
    # Characters
    character_config: Optional[StorylineCharacterConfig] = None
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
```

### Database Schema Updates
```sql
-- Add new columns to storylines table
ALTER TABLE storylines ADD COLUMN synopsis TEXT DEFAULT '';
ALTER TABLE storylines ADD COLUMN synopsis_en TEXT DEFAULT '';
ALTER TABLE storylines ADD COLUMN status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE storylines ADD COLUMN display_order INTEGER DEFAULT 0;
ALTER TABLE storylines ADD COLUMN video_width INTEGER;
ALTER TABLE storylines ADD COLUMN video_height INTEGER;
ALTER TABLE storylines ADD COLUMN cover_original VARCHAR(255);
ALTER TABLE storylines ADD COLUMN cover_thumbnail VARCHAR(255);
ALTER TABLE storylines ADD COLUMN cover_medium VARCHAR(255);
ALTER TABLE storylines ADD COLUMN cover_large VARCHAR(255);

-- Update segments table
ALTER TABLE segments ADD COLUMN start_time FLOAT DEFAULT 0;
ALTER TABLE segments ADD COLUMN entry_type VARCHAR(20) DEFAULT 'instant';
ALTER TABLE segments ADD COLUMN entry_duration FLOAT DEFAULT 1.0;
ALTER TABLE segments ADD COLUMN entry_delay FLOAT DEFAULT 0;
ALTER TABLE segments ADD COLUMN exit_type VARCHAR(20) DEFAULT 'instant';
ALTER TABLE segments ADD COLUMN exit_duration FLOAT DEFAULT 1.0;
ALTER TABLE segments ADD COLUMN exit_delay FLOAT DEFAULT 0;

-- New transitions table
CREATE TABLE transitions (
    id VARCHAR(36) PRIMARY KEY,
    storyline_id VARCHAR(36) NOT NULL,
    from_segment_index INTEGER NOT NULL,
    to_segment_index INTEGER NOT NULL,
    type VARCHAR(20) DEFAULT 'cut',
    duration FLOAT DEFAULT 0.5,
    FOREIGN KEY (storyline_id) REFERENCES storylines(id) ON DELETE CASCADE
);

-- New storyline_characters table
CREATE TABLE storyline_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyline_id VARCHAR(36) NOT NULL,
    character_id VARCHAR(36) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (storyline_id) REFERENCES storylines(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Storyline Required Fields Validation
*For any* storyline creation or update request, if the Chinese name or Chinese synopsis is empty or missing, the system SHALL reject the request with a validation error.
**Validates: Requirements 1.1, 8.2**

### Property 2: Draft Status Without Video
*For any* storyline without a background video, the status SHALL be "draft" and cannot be changed to "published".
**Validates: Requirements 1.2**

### Property 3: Storyline List Completeness
*For any* storyline list response, each item SHALL contain id, name, status, cover image URL (or null), and segment count.
**Validates: Requirements 1.3**

### Property 4: Cascade Deletion
*For any* storyline deletion, all associated files (video, cover images, guidance images) SHALL be removed from storage.
**Validates: Requirements 1.4**

### Property 5: Storyline Data Round-Trip
*For any* storyline saved to the database, reading the storyline SHALL return identical values for all fields.
**Validates: Requirements 1.5**

### Property 6: Video Format Validation
*For any* uploaded video file, the system SHALL accept only MP4 format with H.264 codec and SHALL extract duration and resolution metadata.
**Validates: Requirements 2.1**

### Property 7: Segment Default Values
*For any* newly created segment, the duration SHALL default to 10 seconds and entry/exit animations SHALL default to "instant".
**Validates: Requirements 4.1**

### Property 8: Segment Non-Overlap
*For any* set of segments in a storyline, no two segments SHALL have overlapping time ranges (start_time to start_time + duration).
**Validates: Requirements 4.2**

### Property 9: Segment Position Bounds
*For any* segment position update, the segment start_time SHALL be >= 0 and start_time + duration SHALL be <= video_duration.
**Validates: Requirements 4.3**

### Property 10: Segment Index Continuity
*For any* set of segments after deletion, the indices SHALL be sequential starting from 0 with no gaps.
**Validates: Requirements 4.5**

### Property 11: Total Duration Validation
*For any* storyline save attempt, if the sum of all segment durations exceeds video_duration, the system SHALL reject with a validation error.
**Validates: Requirements 4.6**

### Property 12: Animation Type Validation
*For any* animation configuration, the type SHALL be one of: fade_in, fade_out, slide_left, slide_right, slide_up, slide_down, instant.
**Validates: Requirements 5.1, 5.3**

### Property 13: Animation Timing Validation
*For any* animation configuration, the duration SHALL be between 0.5 and 5.0 seconds, and delay SHALL be >= 0.
**Validates: Requirements 5.2, 5.4**

### Property 14: Transition Type Validation
*For any* transition configuration, the type SHALL be one of: cut, crossfade, fade_to_black, wipe_left, wipe_right.
**Validates: Requirements 6.2**

### Property 15: Transition Storage Round-Trip
*For any* transition saved, reading the transition SHALL return identical type and duration values.
**Validates: Requirements 6.3**

### Property 16: Character Count Validation
*For any* storyline character configuration, the number of selected characters SHALL be between 1 and 10 inclusive.
**Validates: Requirements 7.2**

### Property 17: Default Character Uniqueness
*For any* storyline with character configuration, exactly one character SHALL be marked as default, and that character SHALL be in the selected characters list.
**Validates: Requirements 7.3**

### Property 18: Character Order Persistence
*For any* character order update, reading the character configuration SHALL return characters in the same order.
**Validates: Requirements 7.4**

### Property 19: Character Deletion Cascade
*For any* character deleted from the system, that character SHALL be removed from all storyline character configurations.
**Validates: Requirements 7.5**

### Property 20: Synopsis Character Limit
*For any* synopsis text, Chinese synopsis SHALL be <= 500 characters and English synopsis SHALL be <= 1000 characters.
**Validates: Requirements 8.1**

### Property 21: Guidance Text Round-Trip
*For any* segment guidance text saved, reading the segment SHALL return identical guidance_text and guidance_text_en values.
**Validates: Requirements 8.4**

### Property 22: Image Upload Validation
*For any* uploaded image (cover or guidance), the system SHALL accept only PNG, JPG, or WebP formats.
**Validates: Requirements 9.1, 12.1**

### Property 23: Cover Image Size Generation
*For any* cover image upload, the system SHALL generate three sizes: thumbnail (200x150), medium (400x300), and large (800x600).
**Validates: Requirements 9.3**

### Property 24: Status-Based Visibility
*For any* frontend storyline list request, only storylines with status "published" SHALL be included in the response.
**Validates: Requirements 10.1, 10.2**

### Property 25: Storyline Order Persistence
*For any* storyline order update, the frontend list SHALL return storylines sorted by display_order ascending.
**Validates: Requirements 10.3**

### Property 26: Playback Speed Validation
*For any* playback speed setting, the value SHALL be one of: 0.25, 0.5, 1.0, 1.5, 2.0.
**Validates: Requirements 11.4**

## Error Handling

### Validation Errors
- Missing required fields: Return 400 with list of missing fields
- Invalid animation/transition type: Return 400 with valid options
- Duration exceeds video: Return 400 with current total and video duration
- Segment overlap: Return 400 with conflicting segment details
- Character count out of range: Return 400 with valid range

### File Processing Errors
- Invalid video format: Return 400 with supported formats
- Video processing failure: Return 500 with specific error message
- Image processing failure: Return 500 with specific error message
- Storage full: Return 507 with available space info

### State Errors
- Publish without video: Return 400 with "Video required for publishing"
- Delete published storyline: Return 400 with "Unpublish before deleting"
- Character not found: Return 404 with character ID

## Testing Strategy

### Unit Testing
- Test validation logic for all data models
- Test animation and transition type enums
- Test duration and timing calculations
- Test character configuration logic

### Property-Based Testing
- Use Hypothesis (Python) for backend property tests
- Focus on:
  - Data validation (required fields, ranges, enums)
  - Round-trip consistency (save/load)
  - Constraint enforcement (overlaps, limits)
  - Cascade behaviors (deletion)

### Integration Testing
- Test API endpoints with test database
- Test file upload and processing
- Test video frame extraction
- Test image resizing

### E2E Testing
- Test complete storyline creation flow
- Test timeline segment manipulation
- Test character configuration
- Test publish/unpublish workflow

