# Implementation Plan

- [x] 1. Set up project structure and dependencies






  - Create frontend project with Vite + React + TypeScript
  - Create backend project with FastAPI + Python
  - Install core dependencies (MediaPipe, OpenCV, Axios, etc.)
  - Set up directory structure for both frontend and backend
  - Create configuration files (tsconfig, vite.config, requirements.txt)
  - _Requirements: 13.1, 13.4_

- [x] 2. Implement backend session management and API foundation









  - Create Pydantic models for Session, Segment, and PoseFrame
  - Implement SessionManager class with CRUD operations
  - Create FastAPI app with basic endpoint structure
  - Implement POST /api/sessions endpoint
  - Implement GET /api/sessions/{session_id} endpoint
  - Implement POST /api/sessions/{session_id}/segments/{segment_index} endpoint
  - Set up file-based storage for session data
  - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [x] 2.1 Write property test for session creation


  - **Property 10: New sessions have correct initial state**
  - **Validates: Requirements 7.5**

- [x] 2.2 Write property test for segment data round-trip

  - **Property 8: Segment data round-trip preservation**
  - **Validates: Requirements 7.2**

- [x] 2.3 Write property test for status transition

  - **Property 9: Complete segments trigger processing status**
  - **Validates: Requirements 7.3**

- [x] 3. Implement storage manager and configuration loader





  - Create StorageManager class for file operations
  - Implement session save/load/delete methods
  - Create ConfigLoader class for scene configuration
  - Implement scene configuration JSON schema and validation
  - Create sample scenes.json with 3 scenes (A, B, C)
  - Add configuration validation and fallback logic
  - _Requirements: 20.1, 20.2, 20.3_

- [x] 3.1 Write property test for scene configuration


  - **Property 36: Scene configuration contains required parameters**
  - **Validates: Requirements 20.2**

- [x] 4. Implement frontend camera detection service





  - Create CameraDetectionService class
  - Implement camera access with getUserMedia
  - Integrate MediaPipe Pose for person detection
  - Integrate MediaPipe Hands for hand tracking
  - Implement detection callback system
  - Add error handling for camera access failures
  - _Requirements: 1.1, 1.3, 2.1, 14.1, 14.2, 18.1_

- [x] 4.1 Write property test for hand position mapping


  - **Property 2: Hand position maps to valid cursor coordinates**
  - **Validates: Requirements 2.1**

- [x] 5. Implement frontend state machine





  - Create StateMachine class with all states (IDLE, SCENE_SELECT, etc.)
  - Implement state transition logic
  - Create StateContext interface and management
  - Add state validation and error handling
  - Implement reset functionality
  - _Requirements: 13.5, 1.2, 1.4_

- [x] 5.1 Write property test for person detection transition


  - **Property 1: Person detection triggers state transition**
  - **Validates: Requirements 1.2**

- [x] 5.2 Write property test for state transition timing


  - **Property 21: State transitions complete within time limit**
  - **Validates: Requirements 12.2**

- [x] 6. Implement idle and scene selection UI





  - Create IdlePage component with waiting interface
  - Create SceneSelectionPage component
  - Implement scene card rendering with name, description, and icon
  - Add video feed display with camera overlay
  - Integrate state machine for page transitions
  - _Requirements: 1.1, 3.1, 3.2_

- [x] 6.1 Write property test for scene display elements


  - **Property 4: All scenes contain required display elements**
  - **Validates: Requirements 3.2**

- [x] 7. Implement gesture cursor controller





  - Create GestureCursorController class
  - Implement cursor position mapping from hand coordinates
  - Add cursor rendering on canvas
  - Implement scene card collision detection
  - Create hover timer with progress indicator
  - Add visual feedback for hover state
  - _Requirements: 2.1, 2.2, 2.3, 3.3, 3.4_

- [x] 7.1 Write property test for hover selection

  - **Property 3: Hover selection requires continuous presence**
  - **Validates: Requirements 2.3, 2.4**

- [x] 7.2 Write property test for cursor latency

  - **Property 22: Cursor latency within acceptable range**
  - **Validates: Requirements 12.3**

- [x] 8. Implement API client for frontend





  - Create APIClient class with axios
  - Implement createSession method
  - Implement uploadSegment method
  - Implement getSessionStatus method
  - Implement getVideoUrl method
  - Add retry logic with exponential backoff
  - Add local caching for failed uploads
  - _Requirements: 2.4, 18.2, 18.5_

- [x] 8.1 Write property test for API retry logic


  - **Property 29: Failed requests trigger retry with backoff**
  - **Validates: Requirements 18.2**



- [x] 8.2 Write property test for network interruption caching
  - **Property 31: Network interruption triggers local caching**
  - **Validates: Requirements 18.5**

- [x] 9. Implement motion capture recorder





  - Create MotionCaptureRecorder class
  - Implement startRecording and stopRecording methods
  - Add frame capture with timestamp recording
  - Implement pose data storage in memory
  - Add recording state management
  - _Requirements: 5.1, 5.2, 5.5_

- [x] 9.1 Write property test for recording duration

  - **Property 6: Recording captures frames for configured duration**
  - **Validates: Requirements 5.1**

- [x] 9.2 Write property test for frame data completeness

  - **Property 7: All captured frames contain required data**
  - **Validates: Requirements 5.2**

- [x] 9.3 Write property test for coordinate normalization

  - **Property 23: Saved frames contain normalized coordinates**
  - **Validates: Requirements 14.3**

- [x] 10. Implement motion capture UI flow




  - Create SegmentGuidancePage component
  - Create CountdownPage component with 5-second timer
  - Create RecordingPage component with recording indicator
  - Create SegmentReviewPage component with re-record and continue buttons
  - Integrate MotionCaptureRecorder with UI
  - Add automatic transitions between guidance, countdown, and recording
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.3, 6.1_

- [x] 10.1 Write property test for countdown trigger


  - **Property 5: Countdown triggers automatic recording**
  - **Validates: Requirements 4.4**

- [x] 10.2 Write property test for re-record behavior





  - **Property 6.2: Re-record discards data and resets**
  - **Validates: Requirements 6.2**

- [x] 11. Implement segment upload and progress tracking







  - Add segment upload after recording completion
  - Implement upload progress indicator
  - Add error handling for upload failures
  - Implement automatic progression to next segment
  - Add logic to transition to render wait after all segments
  - _Requirements: 5.4, 7.2_

- [x] 11.1 Write property test for timestamp precision




  - **Property 24: Timestamp precision preserved in upload**
  - **Validates: Requirements 14.4**

- [x] 12. Checkpoint - Ensure all tests pass











  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement backend video rendering engine





  - Create VideoRenderer class
  - Implement render_video method with OpenCV pipeline
  - Add base video loading and frame iteration
  - Implement _map_pose_to_frame for time window mapping
  - Create _draw_puppet method for skeleton drawing
  - Implement CharacterPath class for movement offsets
  - Add video encoding with H.264 codec
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 15.1, 15.2, 15.4_

- [x] 13.1 Write property test for time window mapping


  - **Property 11: Rendered video uses correct time windows**
  - **Validates: Requirements 8.2**

- [x] 13.2 Write property test for rendering completion


  - **Property 12: Rendering completion updates status and creates file**
  - **Validates: Requirements 8.4**

- [x] 13.3 Write property test for video resolution

  - **Property 25: Rendered video matches base video resolution**
  - **Validates: Requirements 15.1**

- [x] 13.4 Write property test for video frame rate

  - **Property 26: Rendered video maintains target frame rate**
  - **Validates: Requirements 15.2**

- [x] 13.5 Write property test for video codec

  - **Property 27: Rendered video uses H.264 codec**
  - **Validates: Requirements 15.4**

- [x] 13.6 Write property test for scene parameters

  - **Property 37: Rendering applies scene-specific parameters**
  - **Validates: Requirements 20.4**

- [x] 14. Implement render trigger and async processing








  - Add POST /api/sessions/{session_id}/render endpoint
  - Implement async video rendering with background task
  - Add status updates during rendering (processing -> done/failed)
  - Implement error handling and logging for render failures
  - Add GET /api/videos/{session_id} endpoint for video serving
  - Set correct content-type headers for video responses
  - _Requirements: 8.1, 8.4, 8.5, 15.5, 18.3_

- [x] 14.1 Write property test for rendering failure handling



  - **Property 30: Rendering failures update status and log**
  - **Validates: Requirements 18.3**

- [x] 14.2 Write property test for video content-type

  - **Property 28: Video responses include correct content-type**
  - **Validates: Requirements 15.5**

- [x] 15. Implement frontend render wait and result pages





  - Create RenderWaitPage component with loading animation
  - Implement status polling with 2-second intervals
  - Create FinalResultPage component
  - Add video player with controls
  - Implement QR code generation with video URL
  - Add automatic reset timer (30 seconds)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.4_

- [x] 15.1 Write property test for video URL format


  - **Property 13: Video URL follows naming convention**
  - **Validates: Requirements 9.4**

- [x] 15.2 Write property test for QR code URL format


  - **Property 14: QR code contains correct URL format**
  - **Validates: Requirements 10.2**

- [x] 15.3 Write property test for polling interval


  - **Property 9.5: Polling interval not exceeding 2 seconds**
  - **Validates: Requirements 9.5**

- [x] 15.4 Write property test for inactivity timeout


  - **Property 10.4: Inactivity timeout triggers reset**
  - **Validates: Requirements 10.4**

- [-] 16. Implement timeout and exit gesture handling



  - Add person absence detection with configurable timeouts
  - Implement timeout countdown warning UI
  - Add timeout cancellation on person return
  - Implement exit gesture detection (both hands above head)
  - Add exit confirmation prompt and timer
  - Implement session cancellation on exit
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 16.1 Write property test for timeout logic


  - **Property 15: Inactivity timeout triggers reset**
  - **Validates: Requirements 11.1, 11.2**

- [x] 16.2 Write property test for timeout cancellation





  - **Property 16: Timeout cancellation on user return**
  - **Validates: Requirements 11.5**

- [x] 16.3 Write property test for exit gesture detection








  - **Property 17: Exit gesture requires sustained pose**
  - **Validates: Requirements 16.1**

- [x] 16.4 Write property test for exit confirmation





  - **Property 18: Exit confirmation requires additional duration**
  - **Validates: Requirements 16.3**

- [x] 17. Implement session cleanup and reset logic





  - Add frontend state cleanup on reset
  - Implement backend session cancellation endpoint
  - Add session status update to "cancelled"
  - Implement resource cleanup for abandoned sessions
  - _Requirements: 11.3, 17.2, 17.5_

- [x] 17.1 Write property test for reset cleanup


  - **Property 19: Reset clears frontend state and notifies backend**
  - **Validates: Requirements 17.2**

- [x] 17.2 Write property test for abandoned session status


  - **Property 20: Abandoned sessions marked as cancelled**
  - **Validates: Requirements 17.5**

- [x] 18. Implement multi-person tracking logic





  - Add multi-person detection in CameraDetectionService
  - Implement center-person selection algorithm
  - Add tracking persistence during recording
  - Implement tracking switch when person leaves
  - Add warning UI for multi-person scenarios
  - Add visual indicator for tracked person
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 18.1 Write property test for center person tracking


  - **Property 32: Multi-person detection tracks center person**
  - **Validates: Requirements 19.1**

- [x] 18.2 Write property test for tracking switch


  - **Property 33: Tracking switches when tracked person leaves**
  - **Validates: Requirements 19.2**

- [x] 18.3 Write property test for recording persistence


  - **Property 34: Recording persists original person tracking**
  - **Validates: Requirements 19.3**

- [x] 18.4 Write property test for departure pause


  - **Property 35: Tracked person departure pauses recording**
  - **Validates: Requirements 19.4**

- [x] 19. Implement storage cleanup and disk management








  - Create cleanup scheduler with APScheduler
  - Implement daily cleanup for files older than 7 days
  - Add disk space monitoring on backend startup
  - Implement emergency cleanup when space < 2GB
  - Add cleanup logging with metrics
  - Ensure metadata deletion with video files
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 19.1 Write property test for age-based cleanup


  - **Property 38: Cleanup deletes files older than threshold**
  - **Validates: Requirements 21.2**

- [x] 19.2 Write property test for emergency cleanup


  - **Property 39: Emergency cleanup frees space to threshold**
  - **Validates: Requirements 21.3**

- [x] 19.3 Write property test for metadata deletion


  - **Property 40: Video deletion removes associated metadata**
  - **Validates: Requirements 21.4**

- [x] 19.4 Write property test for cleanup logging


  - **Property 41: Cleanup logs metrics**
  - **Validates: Requirements 21.5**

- [x] 20. Implement logging and monitoring







  - Set up structured logging with Python logging module
  - Add log entries for all key operations
  - Implement error logging with stack traces
  - Add session lifecycle event logging
  - Add rendering performance logging
  - Create GET /api/health endpoint with system metrics
  - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

- [x] 20.1 Write property test for log entry structure


  - **Property 42: Log entries contain required fields**
  - **Validates: Requirements 22.1**

- [x] 20.2 Write property test for error log completeness




  - **Property 43: Error logs include stack traces**
  - **Validates: Requirements 22.2**

- [x] 20.3 Write property test for lifecycle logging


  - **Property 44: Session lifecycle events are logged**
  - **Validates: Requirements 22.3**

- [x] 20.4 Write property test for render logging


  - **Property 45: Render completion logs performance metrics**
  - **Validates: Requirements 22.4**

- [x] 21. Implement internationalization (i18n)





  - Set up i18next in frontend
  - Create language resource files (en.json, zh.json)
  - Implement language loading from settings
  - Add translation keys for all UI text
  - Implement language switching without reload
  - Add fallback to English for missing translations
  - Add logging for missing translation keys
  - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

- [x] 21.1 Write property test for translation source


  - **Property 46: UI text comes from translation files**
  - **Validates: Requirements 23.2**

- [x] 21.2 Write property test for language switching


  - **Property 47: Language change updates UI without reload**
  - **Validates: Requirements 23.3**

- [x] 21.3 Write property test for translation fallback


  - **Property 48: Missing translations fall back to English**
  - **Validates: Requirements 23.4**

- [x] 22. Create sample assets and test data





  - Create 3 sample base videos (30 seconds each) for scenes A, B, C
  - Design scene icons and theme elements
  - Create example pose images for segment guidance
  - Write scene descriptions in Chinese and English
  - Set up complete scenes.json configuration
  - _Requirements: 3.1, 3.2, 4.2_

- [x] 23. Implement error handling and user feedback





  - Add error boundary components in React
  - Create error message components with retry options
  - Implement toast notifications for transient errors
  - Add error logging on frontend
  - Ensure all API errors display user-friendly messages
  - Test camera access denial scenario
  - Test network failure scenarios
  - _Requirements: 18.1, 18.2, 18.4_

- [x] 24. Performance optimization and testing




  - Optimize MediaPipe detection to maintain 20+ FPS
  - Add requestAnimationFrame for smooth cursor updates
  - Implement throttling for detection callbacks
  - Test and optimize video rendering performance
  - Verify state transitions complete within 1 second
  - Measure and optimize cursor latency
  - Test system stability over extended periods
  - _Requirements: 1.3, 2.5, 5.5, 12.1, 12.2, 12.3, 17.1, 17.3_
-

- [x] 25. Final integration and deployment setup




  - Create production build scripts for frontend
  - Set up backend startup script with uvicorn
  - Create systemd service file for auto-start
  - Write deployment documentation
  - Configure CORS for LAN access
  - Set up environment variables and configuration
  - Test complete end-to-end flow
  - Verify QR code download works from mobile devices
  - _Requirements: 10.3, 10.5_

- [x] 26. Run and verify backend tests




  - Run pytest for all backend tests
  - Verify all property-based tests pass
  - Verify all unit tests pass
  - Check test coverage report
  - Fix any failing backend tests
  - _Requirements: All backend requirements_

- [x] 27. Run and verify frontend tests







  - Run npm test for all frontend tests
  - Verify all property-based tests pass
  - Verify all unit tests pass
  - Check test coverage report
  - Fix any failing frontend tests
  - _Requirements: All frontend requirements_

- [x] 28. End-to-end integration verification




  - Test complete user flow from idle to video download
  - Verify camera detection and gesture controls work
  - Test scene selection and motion capture
  - Verify video rendering and QR code generation
  - Test timeout and exit gesture handling
  - Verify multi-person tracking scenarios
  - Test error handling and recovery
  - _Requirements: 1.1-23.5_
