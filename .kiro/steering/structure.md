# Project Structure

## Repository Organization

```
project-root/
├── frontend/                    # React + Vite frontend application
│   ├── src/
│   │   ├── components/         # React components (pages, UI elements)
│   │   ├── services/           # Core services (camera, detection, API)
│   │   ├── state/              # State machine and context management
│   │   ├── utils/              # Helper functions and utilities
│   │   ├── locales/            # i18n translation files (en.json, zh.json)
│   │   ├── App.tsx             # Main application component
│   │   └── main.tsx            # Application entry point
│   ├── public/                 # Static assets (icons, images)
│   ├── tests/                  # Frontend tests (unit, property, integration)
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/                     # FastAPI backend application
│   ├── app/
│   │   ├── api/                # API endpoints and routes
│   │   ├── models/             # Pydantic data models
│   │   ├── services/           # Business logic (session, rendering, storage)
│   │   ├── config/             # Configuration loader
│   │   ├── utils/              # Helper functions
│   │   └── main.py             # FastAPI application entry
│   ├── tests/                  # Backend tests (unit, property, integration)
│   ├── requirements.txt
│   └── pytest.ini
│
├── data/                        # Runtime data (created automatically)
│   ├── sessions/               # Session JSON files
│   ├── outputs/                # Generated video files
│   └── logs/                   # Application logs
│
├── assets/                      # Static assets for scenes
│   ├── scenes/                 # Base videos for each scene
│   │   ├── sceneA_base.mp4
│   │   ├── sceneB_base.mp4
│   │   └── sceneC_base.mp4
│   └── images/                 # Scene icons and guidance images
│
├── config/                      # Configuration files
│   ├── scenes.json             # Scene definitions and parameters
│   └── settings.json           # System settings
│
├── .kiro/                       # Kiro IDE configuration
│   ├── specs/                  # Feature specifications
│   └── steering/               # AI assistant guidance (this directory)
│
└── requirements.txt             # Project requirements documentation
```

## Module Organization

### Frontend Modules

1. **Camera + Detection Module** (`services/camera-detection.ts`)
   - Camera access and MediaPipe integration
   - Person and hand detection
   - Exit gesture detection

2. **State Machine Module** (`state/state-machine.ts`)
   - Application state management
   - State transition logic
   - Context management

3. **Gesture Cursor Module** (`services/gesture-cursor.ts`)
   - Hand position to cursor mapping
   - Collision detection
   - Hover timer management

4. **Motion Capture Module** (`services/motion-capture.ts`)
   - Pose data recording
   - Frame capture with timestamps
   - Segment data management

5. **API Client Module** (`services/api-client.ts`)
   - Backend communication
   - Retry logic with exponential backoff
   - Local caching for offline resilience

6. **UI Components** (`components/`)
   - Page components for each state
   - Reusable UI elements
   - Error boundaries

### Backend Modules

1. **Session Manager** (`services/session_manager.py`)
   - Session CRUD operations
   - Status management
   - Data persistence

2. **Video Renderer** (`services/video_renderer.py`)
   - OpenCV video processing
   - Shadow puppet skeleton drawing
   - Time window mapping

3. **Storage Manager** (`services/storage_manager.py`)
   - File operations
   - Cleanup scheduling
   - Disk space monitoring

4. **Config Loader** (`config/config_loader.py`)
   - Scene configuration loading
   - Validation and fallback
   - Hot reload support

5. **API Endpoints** (`api/`)
   - RESTful endpoints
   - Request validation
   - Error handling

## File Naming Conventions

- **Frontend**: kebab-case for files (`gesture-cursor.ts`, `scene-selection-page.tsx`)
- **Backend**: snake_case for files (`session_manager.py`, `video_renderer.py`)
- **Components**: PascalCase for React components (`SceneSelectionPage.tsx`)
- **Tests**: Match source file names with `.test` or `.spec` suffix

## Data Flow

Camera → Detection → State Machine → UI Components → API Client → Backend API → Session Manager → Video Renderer → File System → Video Delivery → QR Code

## Configuration Files

- `config/scenes.json`: Scene definitions (segments, durations, paths)
- `config/settings.json`: System settings (timeouts, thresholds, language)
- `.env`: Environment variables (ports, paths, API URLs)
