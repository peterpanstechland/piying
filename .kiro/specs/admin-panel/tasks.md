# Implementation Plan: Admin Panel

## Overview
This implementation plan covers the development of a web-based admin panel for the Shadow Puppet Interactive System. The admin panel will be built as a separate React application with dedicated FastAPI backend endpoints.

---

- [x] 1. Set up project structure and database foundation





  - [x] 1.1 Create admin panel directory structure


    - Create `admin-frontend/` directory with React + Vite + TypeScript setup
    - Create `backend/app/api/admin/` directory for admin API endpoints
    - Create `backend/app/models/admin/` directory for admin data models
    - Create `backend/app/services/admin/` directory for admin services
    - _Requirements: All_


  - [x] 1.2 Set up SQLite database and connection

    - Install SQLAlchemy and aiosqlite dependencies
    - Create database initialization module at `backend/app/database.py`
    - Configure SQLite database file location at `data/admin.db`
    - Implement database session management
    - _Requirements: 1.5_


  - [x] 1.3 Implement User model and authentication service

    - Create User model with id, username, password_hash, role, created_at, last_login fields
    - Implement bcrypt password hashing for secure storage
    - Create AuthService with login, logout, and session management methods
    - Implement JWT token generation and validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.4 Write property test for password storage security






    - **Property 1: Password Storage Security**
    - **Validates: Requirements 1.5**

  - [x] 1.5 Write property test for invalid credentials rejection






    - **Property 2: Invalid Credentials Rejection**
    - **Validates: Requirements 1.3**

- [x] 2. Implement Authentication API endpoints






  - [x] 2.1 Create authentication router

    - Implement POST `/api/admin/auth/login` endpoint
    - Implement POST `/api/admin/auth/logout` endpoint
    - Implement GET `/api/admin/auth/me` endpoint
    - Add session expiration after 24 hours of inactivity
    - _Requirements: 1.1, 1.2, 1.3, 1.4_


  - [x] 2.2 Create user management endpoints

    - Implement POST `/api/admin/users` for creating new users (admin only)
    - Implement GET `/api/admin/users` for listing all users
    - Implement DELETE `/api/admin/users/{id}` for deleting users
    - Add role-based access control middleware
    - _Requirements: 1.5_

  - [ ]* 2.3 Write unit tests for authentication endpoints
    - Test login with valid credentials
    - Test login with invalid credentials
    - Test session expiration
    - Test user CRUD operations
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Character data models and service






  - [x] 4.1 Create Character and CharacterPart models

    - Define CharacterPart model with name, file_path, pivot_x, pivot_y, z_index, connections
    - Define SkeletonBinding model with part_name, landmarks, rotation_landmark, scale_landmarks
    - Define Character model with id, name, description, parts, bindings, thumbnail_path, timestamps
    - Create database tables for characters
    - _Requirements: 2.1, 2.2, 3.5, 4.2_


  - [x] 4.2 Implement CharacterService

    - Implement character CRUD operations
    - Implement PNG file validation (transparent background, 256x256 minimum)
    - Implement required parts validation (head, body, left-arm, right-arm, left-hand, right-hand, left-foot, right-foot, upper-leg)
    - Implement character deletion constraint (check storyline bindings)
    - Generate unique identifiers for characters
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.3 Write property test for character part validation
    - **Property 3: Character Part Validation**
    - **Validates: Requirements 2.1**

  - [ ]* 4.4 Write property test for character ID uniqueness
    - **Property 4: Character ID Uniqueness**
    - **Validates: Requirements 2.2**

  - [ ]* 4.5 Write property test for character deletion constraint
    - **Property 5: Character Deletion Constraint**
    - **Validates: Requirements 2.4**

  - [ ]* 4.6 Write property test for PNG validation
    - **Property 6: PNG Validation**
    - **Validates: Requirements 2.5**

- [x] 5. Implement Character API endpoints






  - [x] 5.1 Create character management router

    - Implement GET `/api/admin/characters` for listing characters
    - Implement POST `/api/admin/characters` for creating characters
    - Implement GET `/api/admin/characters/{id}` for character details
    - Implement PUT `/api/admin/characters/{id}` for updating characters
    - Implement DELETE `/api/admin/characters/{id}` for deleting characters
    - _Requirements: 2.2, 2.3, 2.4_


  - [x] 5.2 Create character parts upload endpoint

    - Implement POST `/api/admin/characters/{id}/parts` for uploading PNG files
    - Validate file formats and dimensions
    - Store files in organized directory structure
    - Generate preview thumbnails
    - _Requirements: 2.1, 2.5_


  - [x] 5.3 Create pivot and binding configuration endpoints

    - Implement PUT `/api/admin/characters/{id}/pivot` for pivot configuration
    - Implement PUT `/api/admin/characters/{id}/binding` for skeleton binding
    - Implement GET `/api/admin/characters/{id}/preview` for preview image
    - _Requirements: 3.5, 4.2, 4.3_

  - [ ]* 5.4 Write property test for pivot configuration round-trip
    - **Property 7: Pivot Configuration Round-Trip**
    - **Validates: Requirements 3.5**

  - [ ]* 5.5 Write property test for skeleton binding storage
    - **Property 9: Skeleton Binding Storage**
    - **Validates: Requirements 4.2**

  - [ ]* 5.6 Write property test for binding completeness validation
    - **Property 10: Binding Completeness Validation**
    - **Validates: Requirements 4.3**

- [x] 6. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Storyline data models and service






  - [x] 7.1 Create Storyline and Segment models

    - Define Segment model with index, duration, path_type, offsets, guidance_text fields
    - Define Storyline model with id, name, description, icon, base_video_path, video_duration, character_id, segments
    - Create database tables for storylines
    - _Requirements: 6.1, 6.3_


  - [x] 7.2 Implement StorylineService

    - Implement storyline CRUD operations
    - Implement video format validation (MP4, H.264)
    - Extract video duration using OpenCV
    - Validate segment duration against video duration
    - Implement character binding
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 7.3 Write property test for storyline required fields
    - **Property 12: Storyline Required Fields**
    - **Validates: Requirements 6.1**

  - [ ]* 7.4 Write property test for video format validation
    - **Property 13: Video Format Validation**
    - **Validates: Requirements 6.2**

  - [ ]* 7.5 Write property test for segment configuration storage
    - **Property 14: Segment Configuration Storage**
    - **Validates: Requirements 6.3**

  - [ ]* 7.6 Write property test for storyline duration validation
    - **Property 15: Storyline Duration Validation**
    - **Validates: Requirements 6.5**

- [x] 8. Implement Storyline API endpoints





  - [x] 8.1 Create storyline management router


    - Implement GET `/api/admin/storylines` for listing storylines
    - Implement POST `/api/admin/storylines` for creating storylines
    - Implement GET `/api/admin/storylines/{id}` for storyline details
    - Implement PUT `/api/admin/storylines/{id}` for updating storylines
    - Implement DELETE `/api/admin/storylines/{id}` for deleting storylines
    - _Requirements: 6.1, 6.4, 6.6_

  - [x] 8.2 Create video upload and segment configuration endpoints


    - Implement POST `/api/admin/storylines/{id}/video` for background video upload
    - Implement PUT `/api/admin/storylines/{id}/segments` for segment configuration
    - Validate video format and extract duration
    - _Requirements: 6.2, 6.3, 6.5_

  - [ ]* 8.3 Write unit tests for storyline endpoints
    - Test storyline CRUD operations
    - Test video upload validation
    - Test segment configuration
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Settings service and API






  - [x] 10.1 Create Settings models

    - Define StorageSettings model with mode, local_path, S3 configuration
    - Define QRCodeSettings model with auto_detect_ip, manual_ip, port
    - Define SystemSettings model with language, storage, qr_code, timeouts, rendering
    - _Requirements: 7.1, 7.2, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_


  - [x] 10.2 Implement SettingsService

    - Implement settings CRUD operations
    - Implement S3 connection testing with boto3
    - Implement LAN IP auto-detection
    - Implement settings validation (timeout ranges 1-300 seconds)
    - Apply settings without restart
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 10.3 Write property test for storage mode configuration
    - **Property 16: Storage Mode Configuration**
    - **Validates: Requirements 7.1, 7.5**

  - [ ]* 10.4 Write property test for S3 configuration requirements
    - **Property 17: S3 Configuration Requirements**
    - **Validates: Requirements 7.2**

  - [ ]* 10.5 Write property test for S3 error message display
    - **Property 18: S3 Error Message Display**
    - **Validates: Requirements 7.4**

  - [ ]* 10.6 Write property test for auto-detect IP format
    - **Property 19: Auto-Detect IP Format**
    - **Validates: Requirements 8.2**

  - [ ]* 10.7 Write property test for manual IP usage
    - **Property 20: Manual IP Usage**
    - **Validates: Requirements 8.3**

  - [ ]* 10.8 Write property test for timeout value validation
    - **Property 23: Timeout Value Validation**
    - **Validates: Requirements 9.2**

  - [ ]* 10.9 Write property test for settings round-trip
    - **Property 24: Settings Round-Trip**
    - **Validates: Requirements 9.4**

- [x] 11. Implement Settings API endpoints






  - [x] 11.1 Create settings router

    - Implement GET `/api/admin/settings` for all settings
    - Implement PUT `/api/admin/settings` for updating settings
    - Implement GET `/api/admin/settings/storage` for storage configuration
    - Implement PUT `/api/admin/settings/storage` for storage updates
    - Implement POST `/api/admin/settings/storage/test` for S3 connection test
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_


  - [x] 11.2 Create camera and QR code settings endpoints

    - Implement GET `/api/admin/settings/cameras` for listing cameras
    - Implement PUT `/api/admin/settings/default-camera` for setting default camera
    - Implement GET `/api/admin/settings/lan-ip` for current LAN IP
    - _Requirements: 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 11.3 Write property test for camera setting persistence
    - **Property 11: Camera Setting Persistence**
    - **Validates: Requirements 5.4**

  - [ ]* 11.4 Write property test for QR code URL format
    - **Property 21: QR Code URL Format**
    - **Validates: Requirements 8.5**

- [x] 12. Checkpoint - Ensure all tests pass












  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement Dashboard and Statistics API





  - [x] 13.1 Create DashboardService


    - Implement session count aggregation
    - Implement video generation success rate calculation
    - Implement storage usage monitoring
    - Implement activity log retrieval
    - _Requirements: 10.1, 10.2, 10.3, 10.4_


  - [x] 13.2 Create dashboard API endpoints

    - Implement GET `/api/admin/dashboard/stats` for statistics
    - Implement GET `/api/admin/dashboard/logs` for activity logs
    - Implement GET `/api/admin/dashboard/storage` for storage usage
    - Add storage warning threshold (80%) detection
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 13.3 Write property test for storage warning threshold
    - **Property 25: Storage Warning Threshold**
    - **Validates: Requirements 10.3**

- [x] 14. Implement Export/Import functionality





  - [x] 14.1 Create ExportImportService


    - Implement configuration export to ZIP file
    - Include character data, storyline configurations, system settings
    - Implement configuration import with validation
    - Implement overwrite confirmation logic
    - _Requirements: 11.1, 11.2, 11.3, 11.4_


  - [x] 14.2 Create export/import API endpoints

    - Implement POST `/api/admin/export` for configuration export
    - Implement POST `/api/admin/import` for configuration import
    - Return download link for export file
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 14.3 Write property test for export completeness
    - **Property 26: Export Completeness**
    - **Validates: Requirements 11.1**

  - [ ]* 14.4 Write property test for import round-trip
    - **Property 27: Import Round-Trip**
    - **Validates: Requirements 11.2**

- [x] 15. Checkpoint - Ensure all backend tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Set up Admin Frontend project





  - [x] 16.1 Initialize React + Vite + TypeScript project


    - Create `admin-frontend/` with Vite React TypeScript template
    - Configure build settings for production
    - Set up directory structure (components, services, pages, contexts)
    - Install dependencies (axios, react-router-dom, i18next)
    - _Requirements: All frontend requirements_

  - [x] 16.2 Implement authentication context and login page


    - Create AuthContext for managing authentication state
    - Create LoginPage component with username/password form
    - Implement ProtectedRoute HOC for route protection
    - Store JWT token in localStorage
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 16.3 Create admin API client


    - Create axios-based API client with authentication headers
    - Implement request/response interceptors
    - Add automatic token refresh logic
    - Handle session expiration
    - _Requirements: 1.4_

- [x] 17. Implement Character Management UI



  - [x] 17.1 Create CharacterListPage


    - Display grid of characters with thumbnails
    - Add create, edit, delete actions
    - Implement character search/filter
    - _Requirements: 2.3_


  - [x] 17.2 Create CharacterUploadForm

    - Multi-file upload for character parts
    - Display validation errors for missing parts
    - Show upload progress
    - _Requirements: 2.1, 2.5_


  - [x] 17.3 Create PivotEditor component

    - Canvas-based part positioning with drag-and-drop
    - Click-to-set pivot points on parts
    - Connection line drawing between parts
    - Z-index slider for each part
    - Live preview of rendering order
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 17.4 Write property test for z-index rendering order
    - **Property 8: Z-Index Rendering Order**
    - **Validates: Requirements 3.4**



  - [x] 17.5 Create SkeletonBindingEditor component

    - Display MediaPipe 33 pose landmarks diagram
    - Visual mapping interface for landmarks to parts
    - Validation warnings for incomplete bindings
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 18. Implement Camera Testing UI






  - [x] 18.1 Create CameraTestPage

    - Request camera access and display live feed
    - Overlay character parts according to skeleton binding
    - Character selection dropdown
    - Camera device selection dropdown
    - Set default camera button
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
    
- [x] 19. Checkpoint - Ensure all tests pass




  - [x] 19.1 Run backend authentication tests





    - Run `pytest backend/tests/test_auth_properties.py -v`
    - Fix any failing tests
  -



  - [x] 19.2 Run backend character service tests


    - Run `pytest backend/tests/ -k "character" -v`

    - Fix any failing tests

  



 - [x] 19.3 Run backend storyline service tests


    - Run `pytest backend/tests/ -k "storyline" -v`
  

  - Fix any failing tests
  

  - [x] 19.4 Run backend settings service tests

    - Run `pytest backend/tests/ -k "settings" -v`


    - Run `pytest backend/tests/ -k "settings" -v`
    - Fix any failing tests
  


  - [x] 19.5 Run frontend admin tests

    - Run `cd admin-frontend && npm test -- --run`
    - Fix any failing tests
    - Note: No test files exist in admin-frontend (optional tests not implemented)

  
  - [x] 19.6 Verify test coverage summary



    - Check overall test pass rate
    - Document any skipped or pending tests


- [x] 20. Implement Storyline Management UI








  - [x] 20.1 Create StorylineListPage


    - Display list of storylines with character and segment info
    - Add create, edit, delete actions
    - _Requirements: 6.6_


  - [x] 20.2 Create StorylineEditor

    - Form for name, description, icon configuration
    - Background video upload with progress
    - Character binding dropdown
    - _Requirements: 6.1, 6.2, 6.4_


  - [x] 20.3 Create SegmentConfigurator

    - Configure segment count (2-4)
    - Set duration per segment
    - Configure movement path for each segment
    - Validate total duration against video duration
    - _Requirements: 6.3, 6.5_

- [x] 21. Implement Settings UI



  - [x] 21.1 Create StorageConfigPage


    - Local/S3 storage mode toggle
    - S3 configuration form (bucket, region, keys)
    - Connection test button with status display
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_


  - [x] 21.2 Create QRCodeConfigPage

    - Display current LAN IP
    - Auto-detect IP toggle
    - Manual IP input field
    - Sample QR code generation and preview
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_


  - [x] 21.3 Create SystemSettingsPage


    - Language selection dropdown
    - Timeout value configuration with validation
    - Rendering quality settings
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 21.4 Write property test for language setting effect
    - **Property 22: Language Setting Effect**
    - **Validates: Requirements 9.1**

- [x] 22. Implement Dashboard UI





  - [x] 22.1 Create DashboardPage


    - Display today's session count
    - Show video generation success rate
    - Display storage usage with visual indicator
    - Storage warning notification when >80%
    - _Requirements: 10.1, 10.3_

  - [x] 22.2 Create ActivityLogViewer


    - Paginated log display with timestamps
    - Click to expand full details
    - Error stack trace display
    - _Requirements: 10.2, 10.4_

- [x] 23. Implement Export/Import UI






  - [x] 23.1 Create ExportImportPage

    - Export button with download link
    - Import file upload with validation
    - Overwrite confirmation dialog
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [-] 24. Checkpoint - Run backend unit tests










  - [x] 24.1 Run authentication tests


    - Run `pytest backend/tests/test_auth_properties.py -v`
    - Fix any failing tests

  - [x] 24.2 Run character tests

    - Run `pytest backend/tests/ -k "character" -v`
    - Fix any failing tests

  - [x] 24.3 Run storyline tests

    - Run `pytest backend/tests/ -k "storyline" -v`
    - Fix any failing tests

  - [x] 24.4 Run settings tests




    - Run `pytest backend/tests/ -k "settings" -v`
    - Fix any failing tests
  - [x] 24.5 Run dashboard tests












    - Run `pytest backend/tests/ -k "dashboard" -v`
    - Fix any failing tests
  - [x] 24.6 Run export/import tests



    - Run `pytest backend/tests/ -k "export or import" -v`
    - Fix any failing tests

- [-] 25. Checkpoint - Run frontend tests











  - [x] 25.1 Run admin-frontend unit tests


    - Run `cd admin-frontend && npm test -- --run`
    - Fix any failing tests
  - [x] 25.2 Run main frontend tests







    - Run `cd frontend && npm test -- --run`
    - Fix any failing tests

- [x] 26. Integration setup



  - [x] 26.1 Mount admin frontend in FastAPI












    - Mount admin frontend build in FastAPI static files
    - Configure routing for admin panel access
    - _Requirements: All_
  - [x] 26.2 Set up production build scripts





    - Create build scripts for admin panel
    - Test production build process
    - _Requirements: All_

- [x] 27. Integration tests - Authentication flow






  - [x] 27.1 Write login flow integration test

    - Test login with valid credentials
    - Test session persistence
    - Test logout functionality
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 28. Integration tests - Character flow



  - [x] 28.1 Write character creation integration test


    - Test create character → upload parts → configure pivot → save
    - _Requirements: 2.1, 2.2, 2.3, 3.5_


  - [x] 28.2 Write character binding integration test

    - Test skeleton binding configuration flow
    - _Requirements: 4.2, 4.3_

- [x] 29. Integration tests - Storyline flow





  - [x] 29.1 Write storyline creation integration test


    - Test create storyline → upload video → configure segments → save
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 29.2 Write storyline-character binding test

    - Test binding character to storyline
    - _Requirements: 6.4_

- [x] 30. Integration tests - Settings flow





  - [x] 30.1 Write storage settings integration test


    - Test storage mode configuration
    - Test S3 connection test
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 30.2 Write QR code settings integration test

    - Test IP auto-detection
    - Test manual IP configuration
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 30.3 Write system settings integration test

    - Test language and timeout settings
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 31. Final Checkpoint - Run all tests











  - [-] 31.1 Run all backend tests








    - Run `pytest backend/tests/ -v`
    - Ensure all tests pass
  - [ ] 31.2 Run all frontend tests (broken into sections to avoid session timeout)
    - [x] 31.2.1 Run state machine tests





      - Run `cd frontend && npm test -- --run src/state/`
      - Ensure all state machine tests pass
    - [x] 31.2.2 Run services tests (part 1: core services)








      - Run `cd frontend && npm test -- --run src/services/camera-detection`
      - Run `cd frontend && npm test -- --run src/services/gesture-cursor`
      - Run `cd frontend && npm test -- --run src/services/motion-capture`
      - Ensure all core service tests pass
    - [x] 31.2.3 Run services tests (part 2: API and utilities)





      - Run `cd frontend && npm test -- --run src/services/api-client`
      - Run `cd frontend && npm test -- --run src/services/exit`
      - Run `cd frontend && npm test -- --run src/services/timeout`
      - Ensure all API and utility service tests pass
    - [x] 31.2.4 Run services tests (part 3: remaining services)





      - Run `cd frontend && npm test -- --run src/services/segment`
      - Run `cd frontend && npm test -- --run src/services/video`
      - Run `cd frontend && npm test -- --run src/services/multi-person`
      - Run `cd frontend && npm test -- --run src/services/reset`
      - Ensure all remaining service tests pass
    - [x] 31.2.5 Run component tests (part 1: pages)





      - Run `cd frontend && npm test -- --run src/components/IdlePage`
      - Run `cd frontend && npm test -- --run src/components/SceneSelectionPage`
      - Run `cd frontend && npm test -- --run src/components/CountdownPage`
      - Ensure all page component tests pass
    - [x] 31.2.6 Run component tests (part 2: recording flow)




      - Run `cd frontend && npm test -- --run src/components/RecordingPage`
      - Run `cd frontend && npm test -- --run src/components/SegmentGuidancePage`
      - Run `cd frontend && npm test -- --run src/components/SegmentReviewPage`
      - Ensure all recording flow component tests pass
    - [x] 31.2.7 Run component tests (part 3: result and error handling)





      - Run `cd frontend && npm test -- --run src/components/RenderWaitPage`
      - Run `cd frontend && npm test -- --run src/components/FinalResultPage`
      - Run `cd frontend && npm test -- --run src/components/Error`
      - Run `cd frontend && npm test -- --run src/components/Toast`
      - Ensure all result and error handling tests pass
    - [x] 31.2.8 Run component tests (part 4: remaining components)





      - Run `cd frontend && npm test -- --run src/components/qr-code`
      - Run `cd frontend && npm test -- --run src/components/polling`
      - Run `cd frontend && npm test -- --run src/components/inactivity`
      --Ensure all remaining com
ponent tests pass
    - [x] 31.2.9 Run utils tests




      - Run `cd frontend && npm test -- --run src/utils/`
      - Ensure all utility tests pass
  - [x] 31.3 Run all admin-frontend tests





    - Run `cd admin-frontend && npm test -- --run`
    - Ensure all tests pass
  - [x] 31.4 Verify test coverage





    - Run `pytest backend/tests/ --cov=backend/app --cov-report=term`
    - Document coverage percentage
