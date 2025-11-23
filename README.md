# 皮影互动短片生成系统 (Shadow Puppet Interactive System)

An innovative touchless interactive experience system that uses computer vision to create personalized shadow puppet videos.

## Features

- 🎭 Touchless gesture-based interaction using MediaPipe
- 📹 Multi-segment motion capture
- 🎨 Automatic shadow puppet video generation
- 📱 QR code download for mobile devices
- 🔄 Autonomous operation with auto-reset

## Tech Stack

**Frontend:** React 18 + TypeScript + Vite + MediaPipe  
**Backend:** Python 3.10+ + FastAPI + OpenCV

## Quick Start

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

## Project Structure

```
piying/
├── frontend/          # React + Vite application
├── backend/           # FastAPI application
├── assets/            # Scene videos and images
├── config/            # Configuration files
└── .kiro/             # Specs and steering rules
```

## Documentation

See `.kiro/specs/shadow-puppet-interactive-system/` for detailed requirements, design, and implementation tasks.

## License

MIT
