# Implementation Plan

- [x] 1. Extend Backend Data Models and Database Schema





  - [x] 1.1 Update Storyline SQLAlchemy model with new fields (synopsis, status, display_order, video resolution, cover paths)


    - Add synopsis, synopsis_en, status, display_order columns
    - Add video_width, video_height columns
    - Add cover_original, cover_thumbnail, cover_medium, cover_large columns
    - _Requirements: 1.1, 1.2, 9.3_
  - [x] 1.2 Create Transition SQLAlchemy model and table


    - Define TransitionDB with id, storyline_id, from_segment_index, to_segment_index, type, duration
    - Add foreign key relationship to storylines
    - _Requirements: 6.2, 6.3_
  - [x] 1.3 Create StorylineCharacter SQLAlchemy model and table


    - Define StorylineCharacterDB with storyline_id, character_id, is_default, display_order
    - Add foreign key relationships
    - _Requirements: 7.2, 7.3, 7.4_
  - [x] 1.4 Update Segment model with animation fields


    - Add start_time, entry_type, entry_duration, entry_delay
    - Add exit_type, exit_duration, exit_delay
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 1.5 Create Pydantic models for API validation


    - AnimationConfig, AnimationType enum
    - TransitionType enum, Transition model
    - StorylineCharacterConfig model
    - CoverImage model
    - StorylineExtended model
    - _Requirements: 1.1, 5.1, 6.2, 7.2_
  - [x] 1.6 Write property tests for data model validation


    - **Property 1: Storyline Required Fields Validation**
    - **Property 12: Animation Type Validation**
    - **Property 14: Transition Type Validation**
    - **Validates: Requirements 1.1, 5.1, 5.3, 6.2, 8.2**

- [x] 2. Implement Storyline Service Extensions





  - [x] 2.1 Implement storyline CRUD with new fields


    - Create storyline with synopsis, status defaults to draft
    - Update storyline metadata
    - Delete storyline with cascade file cleanup
    - _Requirements: 1.1, 1.4, 1.5_
  - [x] 2.2 Write property test for cascade deletion


    - **Property 4: Cascade Deletion**
    - **Validates: Requirements 1.4**
  - [x] 2.3 Implement publish/unpublish functionality


    - Validate video exists before publishing
    - Update status field
    - _Requirements: 1.2, 10.1, 10.2_
  - [x] 2.4 Write property test for draft status without video


    - **Property 2: Draft Status Without Video**
    - **Validates: Requirements 1.2**
  - [x] 2.5 Implement storyline ordering


    - Update display_order field
    - Return storylines sorted by display_order
    - _Requirements: 10.3_
  - [x] 2.6 Write property test for storyline order persistence


    - **Property 25: Storyline Order Persistence**
    - **Validates: Requirements 10.3**

- [x] 3. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [-] 4. Implement Video Processing Service



  - [x] 4.1 Create video processor service


    - Validate MP4/H.264 format using ffprobe
    - Extract duration and resolution
    - Generate thumbnail at specified time
    - _Requirements: 2.1, 2.3_
  - [x] 4.2 Write property test for video format validation


    - **Property 6: Video Format Validation**
    - **Validates: Requirements 2.1**
  - [x] 4.3 Implement frame extraction endpoint


    - Extract frame at specific timestamp
    - Return as base64 or file URL
    - _Requirements: 9.2, 12.2_
  - [x] 4.4 Implement video upload endpoint with progress


    - Handle large file uploads
    - Process video after upload
    - Update storyline with video metadata
    - _Requirements: 2.1, 2.2_

- [x] 5. Implement Image Processing Service





  - [x] 5.1 Create image processor service


    - Validate image format (PNG, JPG, WebP)
    - Resize to multiple sizes (thumbnail, medium, large)
    - _Requirements: 9.1, 9.3_

  - [x] 5.2 Write property test for image upload validation

    - **Property 22: Image Upload Validation**
    - **Validates: Requirements 9.1, 12.1**
  - [x] 5.3 Write property test for cover image size generation

    - **Property 23: Cover Image Size Generation**
    - **Validates: Requirements 9.3**
  - [x] 5.4 Implement cover image endpoints


    - Upload cover image
    - Capture video frame as cover
    - Delete cover (revert to default)
    - _Requirements: 9.1, 9.2, 9.4_

- [x] 6. Implement Segment Management API





  - [x] 6.1 Update segment service with timeline fields


    - Handle start_time, duration, animation configs
    - Validate segment non-overlap
    - Validate total duration <= video duration
    - _Requirements: 4.1, 4.2, 4.6_
  - [x] 6.2 Write property test for segment non-overlap


    - **Property 8: Segment Non-Overlap**
    - **Validates: Requirements 4.2**
  - [x] 6.3 Write property test for total duration validation


    - **Property 11: Total Duration Validation**
    - **Validates: Requirements 4.6**
  - [x] 6.4 Implement segment re-indexing on deletion


    - Remove segment and update indices
    - Ensure sequential indices from 0
    - _Requirements: 4.5_
  - [x] 6.5 Write property test for segment index continuity


    - **Property 10: Segment Index Continuity**
    - **Validates: Requirements 4.5**
  - [x] 6.6 Implement guidance image endpoints


    - Upload guidance image for segment
    - Capture video frame as guidance
    - _Requirements: 12.1, 12.2_

- [x] 7. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Transition Management API






  - [x] 8.1 Create transition service

    - CRUD operations for transitions
    - Validate transition type enum
    - _Requirements: 6.2, 6.3_
  - [x] 8.2 Write property test for transition storage round-trip


    - **Property 15: Transition Storage Round-Trip**
    - **Validates: Requirements 6.3**
  - [x] 8.3 Implement transition endpoints


    - GET /storylines/{id}/transitions
    - PUT /storylines/{id}/transitions (batch update)
    - _Requirements: 6.2, 6.3_

- [x] 9. Implement Character Configuration API





  - [x] 9.1 Create storyline character service


    - Manage character associations
    - Handle default character selection
    - Maintain display order
    - _Requirements: 7.2, 7.3, 7.4_
  - [x] 9.2 Write property test for character count validation


    - **Property 16: Character Count Validation**
    - **Validates: Requirements 7.2**

  - [x] 9.3 Write property test for default character uniqueness

    - **Property 17: Default Character Uniqueness**
    - **Validates: Requirements 7.3**

  - [x] 9.4 Implement character cascade on deletion

    - Remove character from storyline configs when deleted
    - Update default if deleted character was default
    - _Requirements: 7.5_

  - [x] 9.5 Write property test for character deletion cascade

    - **Property 19: Character Deletion Cascade**
    - **Validates: Requirements 7.5**

  - [x] 9.6 Implement character configuration endpoints

    - GET /storylines/{id}/characters
    - PUT /storylines/{id}/characters
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 10. Implement Frontend Integration API



  - [x] 10.1 Create public storyline endpoint


    - Return only published storylines
    - Include cover images, synopsis, character options
    - Sort by display_order
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 10.2 Write property test for status-based visibility


    - **Property 24: Status-Based Visibility**
    - **Validates: Requirements 10.1, 10.2**

- [x] 11. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Create Timeline Editor Frontend - Core Components






  - [x] 12.1 Create TimelineEditorContext for state management

    - Manage playhead, zoom, selection, playback state
    - Provide actions for state updates
    - _Requirements: 3.1, 3.2_

  - [x] 12.2 Create VideoPreview component

    - Display video with HTML5 video element
    - Sync with playhead position
    - Support playback controls
    - _Requirements: 3.2, 3.5, 11.1, 11.2_

  - [x] 12.3 Create TimelineTrack component

    - Render timeline with time markers
    - Display playhead indicator
    - Support zoom levels
    - _Requirements: 3.1, 3.3, 3.4_

  - [x] 12.4 Create SegmentBlock component

    - Render segment as draggable block
    - Support resize handles for duration
    - Show entry/exit animation indicators
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 13. Create Timeline Editor Frontend - Interaction





  - [x] 13.1 Implement playhead dragging


    - Update video preview on drag
    - Snap to segment boundaries (optional)
    - _Requirements: 3.2, 3.3_
  - [x] 13.2 Implement segment dragging and resizing


    - Prevent overlap with other segments
    - Validate bounds within video duration
    - _Requirements: 4.2, 4.3_
  - [x] 13.3 Implement segment selection and deletion


    - Highlight selected segment
    - Delete with keyboard shortcut
    - Re-index remaining segments
    - _Requirements: 4.4, 4.5_
  - [x] 13.4 Implement keyboard shortcuts


    - Space: play/pause
    - Left/Right: frame step
    - Home/End: jump to start/end
    - Delete: remove selected segment
    - _Requirements: 11.3_

- [x] 14. Create Property Panel Component





  - [x] 14.1 Create PropertyPanel container


    - Show segment properties when selected
    - Show transition properties when selected
    - _Requirements: 4.4_
  - [x] 14.2 Create AnimationConfigEditor


    - Entry/exit type dropdown
    - Duration slider (0.5-5s)
    - Delay input
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 14.3 Create TransitionEditor

    - Transition type dropdown
    - Duration slider
    - _Requirements: 6.2, 6.3_

  - [x] 14.4 Create GuidanceEditor

    - Text inputs for Chinese/English
    - Image upload button
    - Frame capture button
    - _Requirements: 8.4, 12.1, 12.2_

- [x] 15. Create Character Selector Component





  - [x] 15.1 Create CharacterSelector with multi-select


    - Display all characters with thumbnails
    - Checkbox selection (1-10 limit)
    - _Requirements: 7.1, 7.2_
  - [x] 15.2 Implement default character selection







    - Radio button for default
    - Validate default is in selected list
    - _Requirements: 7.3_
  - [x] 15.3 Implement drag-to-reorder




    - Drag handles for reordering
    - Update display_order on drop
    - _Requirements: 7.4_

- [x] 16. Create Cover Image Manager Component





  - [x] 16.1 Create CoverImageManager


    - Display current cover or placeholder
    - Upload button with format validation


    - _Requirements: 9.1, 9.5_
  - [x] 16.2 Implement frame capture for cover





    - Button to capture current video frame
    - Preview before confirming
    - _Requirements: 9.2_

- [x] 17. Create Storyline Edit Page







  - [x] 17.1 Create StorylineTimelineEditor page


    - Integrate all components
    - Layout: video preview, timeline, property panel
    - _Requirements: 3.1_
  - [x] 17.2 Implement basic info form


    - Name (Chinese/English)
    - Synopsis (Chinese/English) with character limits
    - Icon selection
    - _Requirements: 1.1, 8.1, 8.2_
  - [x] 17.3 Implement video upload section


    - Upload with progress
    - Display video info after upload
    - Warning on replace
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 17.4 Implement save and publish workflow


    - Save draft button
    - Publish button (validate video exists)
    - _Requirements: 1.2, 10.1_

- [x] 18. Update Storyline List Page





  - [x] 18.1 Update StorylineListPage with new fields

    - Display cover images
    - Show status badges (draft/published)
    - Show synopsis preview
    - _Requirements: 1.3_

  - [x] 18.2 Implement storyline ordering

    - Drag-to-reorder functionality
    - Save order to backend
    - _Requirements: 10.3_

- [x] 19. Update Frontend Scene Selection





  - [x] 19.1 Update SceneSelectionPage to use new API


    - Fetch from /api/storylines (published only)
    - Display cover images
    - Show synopsis
    - _Requirements: 10.1, 10.2_

  - [x] 19.2 Add character selection step

    - Show available characters for selected storyline
    - Allow user to choose character
    - _Requirements: 7.1, 7.2_

- [x] 20. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Final Integration and Polish





  - [x] 21.1 Add playback speed control


    - Speed selector (0.25x, 0.5x, 1x, 1.5x, 2x)
    - Update video playback rate
    - _Requirements: 11.4_
  - [x] 21.2 Add loop mode toggle


    - Loop within segment or full video
    - _Requirements: 11.5_
  - [x] 21.3 Add timeline zoom controls


    - Zoom in/out buttons
    - Zoom slider
    - _Requirements: 3.4_

  - [x] 21.4 Add transition zone visualization

    - Display transition indicators between segments
    - Click to edit transition
    - _Requirements: 6.1_

  - [x] 21.5 Write integration tests for complete workflow

    - Test storyline creation to publish flow
    - Test segment configuration
    - Test character configuration
    - _Requirements: All_
-

- [x] 22. Final Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.

