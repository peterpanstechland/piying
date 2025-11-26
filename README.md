# 皮影互动短片生成系统 (Shadow Puppet Interactive System)

An innovative touchless interactive experience system that uses computer vision to create personalized shadow puppet videos.

## Features

- 🎭 Touchless gesture-based interaction using MediaPipe
- 📹 Multi-segment motion capture
- 🎨 Automatic shadow puppet video generation
- 📱 QR code download for mobile devices
- 🔄 Autonomous operation with auto-reset
- 🌐 Multi-language support (Chinese/English)
- 🧹 Automatic storage cleanup and disk management

## Tech Stack

**Frontend:** React 18 + TypeScript + Vite + MediaPipe  
**Backend:** Python 3.10+ + FastAPI + OpenCV

## Quick Start (Development)

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Production Deployment

### Quick Deployment (25 minutes)

See [QUICKSTART_DEPLOYMENT.md](QUICKSTART_DEPLOYMENT.md) for a step-by-step guide.

### Full Deployment Guide

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment instructions including:
- System requirements
- Installation steps
- Production configuration
- Systemd service setup
- Troubleshooting
- Maintenance

### Build and Start

```bash
# Build frontend for production
./build-frontend.sh        # Linux/macOS
build-frontend.bat         # Windows

# Test deployment
./test-deployment.sh       # Linux/macOS
test-deployment.bat        # Windows

# Start production server
./start-production.sh      # Linux/macOS
start-production.bat       # Windows
```

## Project Structure

```
shadow-puppet-interactive-system/
├── frontend/              # React + Vite application
│   ├── src/              # Source code
│   ├── dist/             # Production build (generated)
│   └── package.json
├── backend/              # FastAPI application
│   ├── app/             # Application code
│   ├── tests/           # Test suite
│   └── requirements.txt
├── assets/              # Scene videos and images
│   ├── scenes/         # Base videos (30s each)
│   └── images/         # Icons and guidance images
├── config/              # Configuration files
│   ├── scenes.json     # Scene definitions
│   └── settings.json   # System settings
├── data/                # Runtime data (auto-created)
│   ├── sessions/       # Session metadata
│   ├── outputs/        # Generated videos
│   └── logs/           # Application logs
├── .kiro/               # Specs and steering rules
│   └── specs/          # Feature specifications
├── DEPLOYMENT.md        # Full deployment guide
├── QUICKSTART_DEPLOYMENT.md  # Quick start guide
└── README.md           # This file
```

## System Requirements

- **CPU**: Quad-core processor (Intel i5/AMD Ryzen 5+)
- **RAM**: 8GB minimum (16GB recommended)
- **Storage**: 50GB+ free disk space
- **Camera**: Webcam with 720p+ resolution
- **Network**: LAN connection for QR code downloads

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Backend
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000

# Frontend (set to your LAN IP)
VITE_API_BASE_URL=http://192.168.1.100:8000
```

### Scene Configuration

Edit `config/scenes.json` to define your scenes:

```json
{
  "scenes": {
    "sceneA": {
      "id": "sceneA",
      "name": "武术表演",
      "description": "展示你的武术动作",
      "base_video_path": "assets/scenes/sceneA_base.mp4",
      "segments": [...]
    }
  }
}
```

## Testing

### Backend Tests

```bash
cd backend
pytest                    # Run all tests
pytest --cov=.           # Run with coverage
pytest -m property       # Run property tests only
```

### Frontend Tests

```bash
cd frontend
npm test                 # Run all tests
npm run test:property    # Run property tests only
```

### Deployment Tests

```bash
./test-deployment.sh     # Linux/macOS
test-deployment.bat      # Windows
```

## Documentation

- **Requirements**: `.kiro/specs/shadow-puppet-interactive-system/requirements.md`
- **Design**: `.kiro/specs/shadow-puppet-interactive-system/design.md`
- **Tasks**: `.kiro/specs/shadow-puppet-interactive-system/tasks.md`
- **Deployment**: `DEPLOYMENT.md`
- **Quick Start**: `QUICKSTART_DEPLOYMENT.md`
- **Project Structure**: `PROJECT_STRUCTURE.md`
- **Assets Guide**: `assets/README.md`

## Performance Targets

- Camera detection: ≥20 FPS
- Cursor latency: ≤100ms
- State transitions: ≤1 second
- Video rendering: 10-20 seconds
- Continuous operation: Multiple hours without restart

## Troubleshooting

### Common Issues

1. **Camera not working**: Check browser permissions and camera availability
2. **Backend won't start**: Verify Python 3.10+ and dependencies installed
3. **QR code not working**: Ensure mobile device on same network
4. **Video rendering fails**: Check OpenCV installation and disk space

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed troubleshooting.

## Monitoring

Check system health:

```bash
curl http://localhost:8000/api/health
```

View logs:

```bash
tail -f data/logs/app.log
```

## License

MIT
