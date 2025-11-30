# Design Document: Admin Panel

## Overview

The Admin Panel is a web-based management interface for the Shadow Puppet Interactive System. It provides administrators with tools to manage character assets, configure skeleton bindings, create storylines, and configure system settings. The panel is built as a separate React application that communicates with the existing FastAPI backend through dedicated admin API endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Admin Panel (React)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Login   │ │Character │ │Storyline │ │ Settings │           │
│  │  Page    │ │ Manager  │ │ Manager  │ │  Page    │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│       │            │            │            │                   │
│  ┌────┴────────────┴────────────┴────────────┴────┐             │
│  │              Admin API Client                   │             │
│  └─────────────────────┬───────────────────────────┘             │
└────────────────────────┼─────────────────────────────────────────┘
                         │ HTTP/REST
┌────────────────────────┼─────────────────────────────────────────┐
│                   FastAPI Backend                                 │
│  ┌─────────────────────┴───────────────────────────┐             │
│  │              Admin API Router (/api/admin/*)     │             │
│  └──────────┬──────────┬──────────┬───────────────┘             │
│             │          │          │                              │
│  ┌──────────┴──┐ ┌─────┴─────┐ ┌──┴──────────┐                  │
│  │ Auth Service│ │ Character │ │  Storyline  │                  │
│  │  (SQLite)   │ │  Service  │ │   Service   │                  │
│  └─────────────┘ └───────────┘ └─────────────┘                  │
│             │          │          │                              │
│  ┌──────────┴──────────┴──────────┴───────────────┐             │
│  │              SQLite Database                    │             │
│  │  (users, characters, storylines, settings)      │             │
│  └─────────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Frontend Components

#### 1. Authentication Module
- **LoginPage**: Login form with username/password fields
- **AuthContext**: React context for managing authentication state
- **ProtectedRoute**: HOC for protecting admin routes

#### 2. Character Management Module
- **CharacterListPage**: Grid view of all characters with thumbnails
- **CharacterUploadForm**: Multi-file upload for character parts
- **PivotEditor**: Interactive canvas for pivot point configuration
  - Drag-and-drop part positioning
  - Click-to-set pivot points
  - Connection line drawing between parts
  - Z-index slider for each part
- **SkeletonBindingEditor**: Visual mapping of MediaPipe landmarks to parts

#### 3. Storyline Management Module
- **StorylineListPage**: List of all storylines with status
- **StorylineEditor**: Form for storyline configuration
- **SegmentConfigurator**: UI for configuring recording segments
- **VideoUploader**: Background video upload with progress

#### 4. Settings Module
- **StorageConfigPage**: Local/S3 storage toggle and configuration
- **CameraTestPage**: Live camera preview with skeleton overlay
- **SystemSettingsPage**: General system configuration
- **QRCodeConfigPage**: LAN IP configuration for local downloads

#### 5. Dashboard Module
- **DashboardPage**: Statistics overview and activity log
- **StorageUsageWidget**: Visual storage usage indicator
- **ActivityLogViewer**: Paginated log viewer

### Backend API Endpoints

#### Authentication API
```
POST /api/admin/auth/login     - Authenticate user
POST /api/admin/auth/logout    - End session
GET  /api/admin/auth/me        - Get current user info
POST /api/admin/users          - Create new user (admin only)
GET  /api/admin/users          - List all users
DELETE /api/admin/users/{id}   - Delete user
```

#### Character API
```
GET    /api/admin/characters              - List all characters
POST   /api/admin/characters              - Create new character
GET    /api/admin/characters/{id}         - Get character details
PUT    /api/admin/characters/{id}         - Update character
DELETE /api/admin/characters/{id}         - Delete character
POST   /api/admin/characters/{id}/parts   - Upload character parts
PUT    /api/admin/characters/{id}/pivot   - Update pivot configuration
PUT    /api/admin/characters/{id}/binding - Update skeleton binding
GET    /api/admin/characters/{id}/preview - Get character preview image
```

#### Storyline API
```
GET    /api/admin/storylines              - List all storylines
POST   /api/admin/storylines              - Create new storyline
GET    /api/admin/storylines/{id}         - Get storyline details
PUT    /api/admin/storylines/{id}         - Update storyline
DELETE /api/admin/storylines/{id}         - Delete storyline
POST   /api/admin/storylines/{id}/video   - Upload background video
PUT    /api/admin/storylines/{id}/segments - Update segment configuration
```

#### Settings API
```
GET  /api/admin/settings                  - Get all settings
PUT  /api/admin/settings                  - Update settings
GET  /api/admin/settings/storage          - Get storage configuration
PUT  /api/admin/settings/storage          - Update storage configuration
POST /api/admin/settings/storage/test     - Test S3 connection
GET  /api/admin/settings/cameras          - List available cameras
PUT  /api/admin/settings/default-camera   - Set default camera
GET  /api/admin/settings/lan-ip           - Get current LAN IP
```

#### Dashboard API
```
GET /api/admin/dashboard/stats            - Get dashboard statistics
GET /api/admin/dashboard/logs             - Get activity logs
GET /api/admin/dashboard/storage          - Get storage usage
```

#### Export/Import API
```
POST /api/admin/export                    - Export configuration
POST /api/admin/import                    - Import configuration
```

## Data Models

### User Model
```python
class User(BaseModel):
    id: str                    # UUID
    username: str              # Unique username
    password_hash: str         # bcrypt hashed password
    role: str                  # "admin" or "operator"
    created_at: datetime
    last_login: Optional[datetime]
```

### Character Model
```python
class CharacterPart(BaseModel):
    name: str                  # e.g., "head", "left-arm"
    file_path: str             # Path to PNG file
    pivot_x: float             # Pivot point X (0-1 normalized)
    pivot_y: float             # Pivot point Y (0-1 normalized)
    z_index: int               # Rendering order
    connections: List[str]     # Connected part names

class SkeletonBinding(BaseModel):
    part_name: str             # Character part name
    landmarks: List[int]       # MediaPipe landmark indices
    rotation_landmark: int     # Landmark for rotation calculation
    scale_landmarks: List[int] # Landmarks for scale calculation

class Character(BaseModel):
    id: str                    # UUID
    name: str                  # Display name
    description: Optional[str]
    parts: List[CharacterPart]
    bindings: List[SkeletonBinding]
    thumbnail_path: Optional[str]
    created_at: datetime
    updated_at: datetime
```

### Storyline Model
```python
class Segment(BaseModel):
    index: int                 # Segment order (0-based)
    duration: float            # Duration in seconds
    path_type: str             # Movement type
    offset_start: List[int]    # Starting position offset [x, y]
    offset_end: List[int]      # Ending position offset [x, y]
    guidance_text: str         # Chinese guidance text
    guidance_text_en: str      # English guidance text
    guidance_image: Optional[str]

class Storyline(BaseModel):
    id: str                    # UUID
    name: str                  # Display name
    name_en: str               # English name
    description: str           # Chinese description
    description_en: str        # English description
    icon: str                  # Emoji icon
    icon_image: Optional[str]  # Icon image path
    base_video_path: str       # Background video path
    video_duration: float      # Video duration in seconds
    character_id: str          # Bound character ID
    segments: List[Segment]
    created_at: datetime
    updated_at: datetime
```

### Settings Model
```python
class StorageSettings(BaseModel):
    mode: str                  # "local" or "s3"
    local_path: str            # Local storage path
    s3_bucket: Optional[str]
    s3_region: Optional[str]
    s3_access_key: Optional[str]
    s3_secret_key: Optional[str]  # Encrypted

class QRCodeSettings(BaseModel):
    auto_detect_ip: bool       # Auto-detect LAN IP
    manual_ip: Optional[str]   # Manual IP override
    port: int                  # Server port

class SystemSettings(BaseModel):
    language: str              # Default language
    storage: StorageSettings
    qr_code: QRCodeSettings
    default_camera_id: Optional[str]
    timeouts: Dict[str, int]   # Timeout configurations
    rendering: Dict[str, Any]  # Rendering settings
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Password Storage Security
*For any* user created in the system, the stored password SHALL be a bcrypt hash and SHALL NOT match the plaintext password.
**Validates: Requirements 1.5**

### Property 2: Invalid Credentials Rejection
*For any* login attempt with credentials that do not match a valid user, the system SHALL reject the authentication and return an error.
**Validates: Requirements 1.3**

### Property 3: Character Part Validation
*For any* character upload, if any required part (head, body, left-arm, right-arm, left-hand, right-hand, left-foot, right-foot, upper-leg) is missing, the system SHALL reject the upload with a validation error listing the missing parts.
**Validates: Requirements 2.1**

### Property 4: Character ID Uniqueness
*For any* set of characters in the system, all character IDs SHALL be unique.
**Validates: Requirements 2.2**

### Property 5: Character Deletion Constraint
*For any* character that is bound to an active storyline, deletion attempts SHALL be rejected with an error indicating the bound storylines.
**Validates: Requirements 2.4**

### Property 6: PNG Validation
*For any* uploaded PNG file, the system SHALL validate that the file has a transparent background and meets the minimum resolution of 256x256 pixels.
**Validates: Requirements 2.5**

### Property 7: Pivot Configuration Round-Trip
*For any* pivot configuration saved for a character, loading the configuration SHALL return identical pivot points, connections, and z-index values.
**Validates: Requirements 3.5**

### Property 8: Z-Index Rendering Order
*For any* character with multiple parts, parts with higher z-index values SHALL be rendered on top of parts with lower z-index values.
**Validates: Requirements 3.4**

### Property 9: Skeleton Binding Storage
*For any* landmark-to-part assignment saved, the system SHALL correctly store and retrieve the mapping.
**Validates: Requirements 4.2**

### Property 10: Binding Completeness Validation
*For any* skeleton binding configuration where a movable part lacks landmark assignments, the system SHALL report a validation warning.
**Validates: Requirements 4.3**

### Property 11: Camera Setting Persistence
*For any* camera device ID set as default, the setting SHALL be persisted and retrieved correctly on subsequent loads.
**Validates: Requirements 5.4**

### Property 12: Storyline Required Fields
*For any* storyline creation attempt missing name, description, or background video, the system SHALL reject with a validation error.
**Validates: Requirements 6.1**

### Property 13: Video Format Validation
*For any* uploaded background video, the system SHALL validate the format is MP4 with H.264 codec and extract the duration.
**Validates: Requirements 6.2**

### Property 14: Segment Configuration Storage
*For any* segment configuration saved, the system SHALL correctly store and retrieve segment count, duration, and movement path.
**Validates: Requirements 6.3**

### Property 15: Storyline Duration Validation
*For any* storyline where total segment duration exceeds background video duration, the system SHALL reject the save with a validation error.
**Validates: Requirements 6.5**

### Property 16: Storage Mode Configuration
*For any* storage mode change (local or S3), the system SHALL update the configuration and apply it without requiring a restart.
**Validates: Requirements 7.1, 7.5**

### Property 17: S3 Configuration Requirements
*For any* S3 storage mode selection, the system SHALL require bucket name, region, access key, and secret key.
**Validates: Requirements 7.2**

### Property 18: S3 Error Message Display
*For any* failed S3 connection test, the system SHALL display the specific error message from AWS.
**Validates: Requirements 7.4**

### Property 19: Auto-Detect IP Format
*For any* auto-detected LAN IP, the result SHALL be a valid IPv4 address format.
**Validates: Requirements 8.2**

### Property 20: Manual IP Usage
*For any* manually configured IP address, the QR code generation SHALL use the specified IP.
**Validates: Requirements 8.3**

### Property 21: QR Code URL Format
*For any* generated QR code, the encoded URL SHALL contain the correct base URL with the configured IP and port.
**Validates: Requirements 8.5**

### Property 22: Language Setting Effect
*For any* language setting change, the frontend display language SHALL update accordingly.
**Validates: Requirements 9.1**

### Property 23: Timeout Value Validation
*For any* timeout value modification, the system SHALL validate that values are within 1-300 seconds range.
**Validates: Requirements 9.2**

### Property 24: Settings Round-Trip
*For any* settings saved, reading the settings SHALL return identical values.
**Validates: Requirements 9.4**

### Property 25: Storage Warning Threshold
*For any* storage usage exceeding 80% of available space, the system SHALL display a warning notification.
**Validates: Requirements 10.3**

### Property 26: Export Completeness
*For any* configuration export, the ZIP file SHALL contain all character data, storyline configurations, and system settings.
**Validates: Requirements 11.1**

### Property 27: Import Round-Trip
*For any* exported configuration, importing the backup SHALL restore the system to an equivalent state.
**Validates: Requirements 11.2**

## Error Handling

### Authentication Errors
- Invalid credentials: Return 401 with generic "Invalid username or password" message
- Session expired: Return 401 with "Session expired" message
- Insufficient permissions: Return 403 with "Access denied" message

### Validation Errors
- Missing required fields: Return 400 with list of missing fields
- Invalid file format: Return 400 with specific format requirements
- Constraint violations: Return 409 with explanation of conflict

### Storage Errors
- S3 connection failure: Return 503 with AWS error message
- Disk space insufficient: Return 507 with available space info
- File not found: Return 404 with file path

### General Errors
- Internal server error: Return 500 with error ID for log correlation
- All errors logged with stack traces for debugging

## Testing Strategy

### Unit Testing
- Test individual service methods with mocked dependencies
- Test validation logic for all data models
- Test authentication and authorization logic

### Property-Based Testing
- Use Hypothesis (Python) for backend property tests
- Use fast-check (TypeScript) for frontend property tests
- Focus on data validation, round-trip consistency, and constraint enforcement

### Integration Testing
- Test API endpoints with test database
- Test file upload and storage operations
- Test S3 integration with mocked AWS services

### E2E Testing
- Test complete user flows (login → create character → configure → save)
- Test pivot editor interactions
- Test camera preview functionality (manual testing)
