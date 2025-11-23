# Setup Guide

This guide will help you set up the Shadow Puppet Interactive System for development.

## Prerequisites

✅ Python 3.10+ (Detected: Python 3.14.0)
✅ Node.js 18+ (Detected: Node v24.11.1)
- Minimum 8GB RAM
- Minimum 50GB free disk space
- Webcam with 720p+ resolution

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd piying
```

### 2. Environment Configuration

Copy the example environment file:

```bash
copy .env.example .env
```

Edit `.env` to configure your local settings if needed.

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
```

This will install:
- React 18.2.0
- Vite 5.0.8
- TypeScript 5.3.3
- MediaPipe (via CDN in production)
- Axios, QRCode.react, i18next
- Testing libraries (Jest, fast-check)

### 4. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- FastAPI 0.108.0
- uvicorn 0.25.0
- OpenCV 4.9.0.80
- Pydantic 2.5.3
- APScheduler 3.10.4
- Testing libraries (pytest, hypothesis)

### 5. Prepare Assets

Before running the system, you need to add base videos and images:

**Scene Videos** (`assets/scenes/`):
- `sceneA_base.mp4` - 30 seconds, 1920x1080 or 1280x720, 30 FPS
- `sceneB_base.mp4` - 30 seconds, 1920x1080 or 1280x720, 30 FPS
- `sceneC_base.mp4` - 30 seconds, 1920x1080 or 1280x720, 30 FPS

**Scene Icons** (`assets/images/`):
- `sceneA_icon.png` - 256x256 pixels
- `sceneB_icon.png` - 256x256 pixels
- `sceneC_icon.png` - 256x256 pixels

**Guidance Images** (`assets/images/`):
- Pose guidance images for each segment (optional but recommended)

See `assets/scenes/README.md` and `assets/images/README.md` for details.

## Running the Application

### Development Mode

**Option 1: Using startup scripts (Windows)**

Terminal 1 - Backend:
```bash
start-backend.bat
```

Terminal 2 - Frontend:
```bash
start-frontend.bat
```

**Option 2: Using startup scripts (Linux/Mac)**

Terminal 1 - Backend:
```bash
chmod +x start-backend.sh
./start-backend.sh
```

Terminal 2 - Frontend:
```bash
chmod +x start-frontend.sh
./start-frontend.sh
```

**Option 3: Manual start**

Terminal 1 - Backend:
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

### Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Running Tests

### Frontend Tests

```bash
cd frontend
npm test                    # Run all tests
npm run test:property       # Run property-based tests only
```

### Backend Tests

```bash
cd backend
pytest                      # Run all tests
pytest -m property          # Run property-based tests only
pytest -m unit              # Run unit tests only
pytest --cov=app            # Run with coverage report
```

## Project Structure

```
piying/
├── frontend/              # React + Vite frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── services/     # Core services (camera, API, etc.)
│   │   ├── state/        # State machine
│   │   ├── utils/        # Helper functions
│   │   └── locales/      # i18n translations
│   └── tests/            # Frontend tests
│
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API endpoints
│   │   ├── models/      # Pydantic models
│   │   ├── services/    # Business logic
│   │   ├── config/      # Configuration loader
│   │   └── utils/       # Helper functions
│   └── tests/           # Backend tests
│
├── data/                # Runtime data (auto-created)
│   ├── sessions/       # Session JSON files
│   ├── outputs/        # Generated videos
│   └── logs/           # Application logs
│
├── assets/             # Static assets
│   ├── scenes/        # Base videos
│   └── images/        # Icons and guidance images
│
└── config/            # Configuration files
    ├── scenes.json    # Scene definitions
    └── settings.json  # System settings
```

## Configuration

### Scene Configuration (`config/scenes.json`)

Defines the three scenes (A, B, C) with:
- Scene metadata (name, description, icon)
- Base video path
- Segment definitions (duration, character path)

### System Settings (`config/settings.json`)

Configures:
- Language settings
- Camera parameters
- Timeout durations
- Interaction timings
- Storage cleanup rules
- Rendering parameters
- API retry logic

## Troubleshooting

### Frontend Issues

**Camera not detected:**
- Ensure webcam is connected and permissions are granted
- Check browser console for errors
- Try accessing http://localhost:3000 instead of 127.0.0.1

**MediaPipe loading errors:**
- Check internet connection (MediaPipe models load from CDN)
- Clear browser cache
- Try a different browser (Chrome/Edge recommended)

### Backend Issues

**Import errors:**
- Ensure all dependencies are installed: `pip install -r requirements.txt`
- Check Python version: `python --version` (should be 3.10+)

**OpenCV errors:**
- On Windows, you may need Visual C++ Redistributable
- On Linux, install: `sudo apt-get install libgl1-mesa-glx`

**Port already in use:**
- Change port in `.env` or use: `uvicorn app.main:app --port 8001`

### General Issues

**CORS errors:**
- Ensure backend is running on 0.0.0.0 (not 127.0.0.1)
- Check CORS configuration in `backend/app/main.py`

**File not found errors:**
- Ensure base videos are in `assets/scenes/`
- Check file paths in `config/scenes.json`

## Next Steps

1. ✅ Complete initial setup
2. 📝 Review the specification documents in `.kiro/specs/shadow-puppet-interactive-system/`
3. 🔨 Start implementing features according to `tasks.md`
4. 🧪 Write tests as you implement features
5. 🎨 Add base videos and assets
6. 🚀 Test the complete user flow

## Development Workflow

1. Pick a task from `.kiro/specs/shadow-puppet-interactive-system/tasks.md`
2. Implement the feature
3. Write tests (unit + property-based)
4. Run tests to verify
5. Test manually with the running application
6. Move to the next task

## Support

For questions or issues:
- Check the design document: `.kiro/specs/shadow-puppet-interactive-system/design.md`
- Review requirements: `.kiro/specs/shadow-puppet-interactive-system/requirements.md`
- Consult the task list: `.kiro/specs/shadow-puppet-interactive-system/tasks.md`
