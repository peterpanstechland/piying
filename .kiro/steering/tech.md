# Technology Stack

## Frontend

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Computer Vision**: MediaPipe (Pose + Hands) for body and hand detection
- **Rendering**: Canvas API for video overlay and cursor visualization
- **HTTP Client**: Axios with retry logic and exponential backoff
- **QR Code**: qrcode.react for download code generation
- **i18n**: i18next for internationalization (Chinese/English)

## Backend

- **Framework**: FastAPI (Python 3.10+)
- **Video Processing**: OpenCV (cv2) for rendering and frame manipulation
- **Validation**: Pydantic for data models and API validation
- **Server**: uvicorn (ASGI server)
- **Scheduling**: APScheduler for cleanup tasks
- **Storage**: File-based (JSON for sessions, MP4 for videos)

## Architecture

Three-layer architecture: Frontend (browser) ↔ REST API ↔ Backend (FastAPI) ↔ File System

## Common Commands

### Frontend Development
```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run property tests
npm run test:property
```

### Backend Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest

# Run tests with coverage
pytest --cov=. --cov-report=html

# Run property tests
pytest -m property
```

### Production Deployment
```bash
# Build frontend
cd frontend && npm run build

# Start backend service
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

## System Requirements

- Python 3.10+ with OpenCV
- Node.js 18+
- Minimum 8GB RAM
- Minimum 50GB free disk space
- Webcam with 720p+ resolution
- LAN network access for QR code downloads

## Performance Targets

- Camera detection: ≥20 FPS
- Cursor latency: ≤100ms
- State transitions: ≤1 second
- Video rendering: 10-20 seconds
- Continuous operation: Multiple hours without restart
