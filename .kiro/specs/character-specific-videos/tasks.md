# Implementation Plan

- [x] 1. Extend database model for character-specific videos






  - [x] 1.1 Add video fields to StorylineCharacterDB model

    - Add `video_path`, `video_duration`, `video_thumbnail`, `video_uploaded_at` columns
    - Update Pydantic models for API validation
    - _Requirements: 5.1_
  - [x] 1.2 Create database migration script


    - Add new columns to `storyline_characters` table
    - Handle existing data (set video fields to NULL)
    - _Requirements: 5.1_
  - [ ]* 1.3 Write property test for database association integrity
    - **Property 6: Database Association Integrity**
    - **Validates: Requirements 5.1, 5.2**

- [-] 2. Implement CharacterVideoService



  - [x] 2.1 Create CharacterVideoService class with core methods



    - Implement `upload_character_video` method
    - Implement `validate_video_duration` method
    - Implement `get_character_video_path` method
    - Implement `delete_character_video` method
    - Implement `get_video_status_for_storyline` method
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [ ]* 2.2 Write property test for video duration validation
    - **Property 1: Video Duration Validation**
    - **Validates: Requirements 1.2, 2.3**
  - [ ]* 2.3 Write property test for video path resolution
    - **Property 4: Video Path Resolution**
    - **Validates: Requirements 3.2, 3.3**
  - [ ]* 2.4 Write property test for file path convention
    - **Property 9: File Path Convention**
    - **Validates: Requirements 6.1, 6.2**

- [x] 3. Implement character video API endpoints





  - [x] 3.1 Create upload endpoint for character-specific video


    - POST `/api/admin/storylines/{storyline_id}/characters/{character_id}/video`
    - Validate video format and duration
    - Store video and update database
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 3.2 Create get and delete endpoints for character video

    - GET `/api/admin/storylines/{storyline_id}/characters/{character_id}/video`
    - DELETE `/api/admin/storylines/{storyline_id}/characters/{character_id}/video`
    - _Requirements: 1.4, 4.5_

  - [x] 3.3 Create list endpoint for character video statuses

    - GET `/api/admin/storylines/{storyline_id}/character-videos`
    - Return all character video statuses for a storyline
    - _Requirements: 1.3, 4.2_
  - [x] 3.4 Create public API endpoint for video path resolution


    - GET `/api/storylines/{storyline_id}/video?character_id={character_id}`
    - Return character-specific video path or fallback to base video
    - _Requirements: 3.2, 3.3_
  - [ ]* 3.5 Write unit tests for API endpoints
    - Test upload, get, delete, and list endpoints
    - Test error handling for invalid inputs
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Checkpoint - Ensure all backend tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement cascade delete behavior





  - [x] 5.1 Update storyline deletion to cascade delete character videos


    - Delete video files when storyline is deleted
    - Update StorylineService to handle video cleanup
    - _Requirements: 5.3_

  - [x] 5.2 Update character deletion to remove video associations

    - Remove video associations when character is deleted
    - Update CharacterService to handle video cleanup
    - _Requirements: 5.4_

  - [x] 5.3 Update character removal from storyline to delete video

    - Delete video file when character is removed from storyline
    - _Requirements: 1.4_
  - [ ]* 5.4 Write property test for cascade delete on character removal
    - **Property 3: Cascade Delete on Character Removal**
    - **Validates: Requirements 1.4**
  - [ ]* 5.5 Write property test for storyline cascade delete
    - **Property 7: Storyline Cascade Delete**
    - **Validates: Requirements 5.3**
  - [ ]* 5.6 Write property test for character cascade delete
    - **Property 8: Character Cascade Delete**
    - **Validates: Requirements 5.4**

- [x] 6. Implement admin frontend CharacterVideoPanel component




  - [x] 6.1 Create CharacterVideoPanel component

    - Display list of characters with video upload status
    - Show video thumbnail and duration for uploaded videos
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 6.2 Implement video upload functionality
    - Add file picker for video selection
    - Show upload progress
    - Display validation errors
    - _Requirements: 4.3, 2.2_

  - [x] 6.3 Implement video delete functionality
    - Add delete button for each character video
    - Confirm before deletion
    - _Requirements: 4.5_
  - [x] 6.4 Integrate CharacterVideoPanel into StorylineTimelineEditorPage



    - Add "Character Videos" section to property panel
    - Connect to API endpoints
    - _Requirements: 4.1_

- [x] 7. Update user frontend for character video selection






  - [x] 7.1 Update CharacterSelectionPage to fetch video paths

    - Query character-specific video path when character is selected
    - Fall back to base video if no specific video exists
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 7.2 Update session creation to store video path

    - Include selected character ID and resolved video path in session
    - _Requirements: 3.4_
  - [ ]* 7.3 Write property test for session video path storage
    - **Property 5: Session Video Path Storage**
    - **Validates: Requirements 3.4**

- [x] 8. Checkpoint - Ensure all tests pass
  - [x] 8.1 Run backend unit tests





    - Execute `pytest` in backend directory
    - Verify all existing unit tests pass
    - Fix any test failures related to character-specific videos feature
  - [x] 8.2 Run backend property-based tests





    - Execute `pytest -m property` in backend directory
    - Verify all property tests pass
    - Document any failing property tests for review
  - [x] 8.3 Run backend integration tests





    - Execute integration tests for storyline, character, and video functionality
    - Verify API endpoints work correctly
    - Test cascade delete behavior
  - [x] 8.4 Run frontend tests
    - [x] 8.4.1 Run user frontend tests
      - Execute `npm test` in frontend directory
      - Verify CharacterSelectionPage tests pass
      - Fix any test failures related to character video path fetching
      - All 164 tests pass (excluding property tests)
    - [x] 8.4.2 Run admin frontend tests
      - Execute `npm test` in admin-frontend directory
      - Verify CharacterVideoPanel component tests pass
      - Fix any test failures related to video upload/delete functionality
    - [x] 8.4.3 Fix any failing tests
      - Fixed ErrorBoundary.tsx missing React import
      - All tests now pass
  - [x] 8.5 Verify test coverage





    - Run `pytest --cov=. --cov-report=html` in backend
    - Review coverage for new character video service code
    - Ensure critical paths are covered

- [x] 9. Update export/import functionality





  - [x] 9.1 Update export to include character-specific videos


    - Include video files in export package
    - Include video metadata in export JSON
    - _Requirements: 6.3_


  - [x] 9.2 Update import to restore character-specific videos
    - Restore video files from import package
    - Restore video associations in database
    - _Requirements: 6.4_
  - [ ]* 9.3 Write property test for export-import round trip
    - **Property 10: Export-Import Round Trip**
    - **Validates: Requirements 6.3, 6.4**

- [x] 10. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

