# Shadow Puppet Interactive System - Deployment Guide

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Installation Setup](#pre-installation-setup)
3. [Installation Steps](#installation-steps)
4. [Production Deployment](#production-deployment)
5. [Configuration](#configuration)
6. [Testing Deployment](#testing-deployment)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

## System Requirements

### Hardware Requirements

- **CPU**: Quad-core processor (Intel i5/AMD Ryzen 5 or better)
- **RAM**: Minimum 8GB (16GB recommended)
- **Storage**: Minimum 50GB free disk space
- **Camera**: Webcam with 720p+ resolution (1080p recommended)
- **Network**: LAN connection for QR code downloads

### Software Requirements

- **Operating System**: 
  - Linux (Ubuntu 20.04+ recommended)
  - Windows 10/11
  - macOS 11+
- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher
- **npm**: 9.0 or higher

### Browser Requirements (for frontend)

- Chrome 90+ (recommended)
- Firefox 88+
- Edge 90+
- Safari 14+

## Pre-Installation Setup

### 1. Install System Dependencies

#### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install Python and pip
sudo apt install python3.10 python3-pip python3-venv

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs

# Install OpenCV dependencies
sudo apt install libopencv-dev python3-opencv

# Install system utilities
sudo apt install git curl wget
```

#### Windows

1. Download and install Python 3.10+ from [python.org](https://www.python.org/downloads/)
2. Download and install Node.js 18+ from [nodejs.org](https://nodejs.org/)
3. Ensure Python and Node are added to PATH

#### macOS

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python@3.10

# Install Node.js
brew install node@18
```

### 2. Clone Repository

```bash
git clone <repository-url>
cd shadow-puppet-interactive-system
```

### 3. Verify Installation

```bash
# Check Python version
python3 --version  # Should be 3.10+

# Check Node version
node --version     # Should be 18.0+

# Check npm version
npm --version      # Should be 9.0+
```

## Installation Steps

### 1. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Set Up Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your settings
nano .env  # or use your preferred editor
```

### 4. Create Required Directories

```bash
mkdir -p data/sessions
mkdir -p data/outputs
mkdir -p data/logs
mkdir -p assets/scenes
mkdir -p assets/images
```

### 5. Add Scene Assets

Place your base videos and scene assets:

```bash
# Copy base videos to assets/scenes/
cp /path/to/sceneA_base.mp4 assets/scenes/
cp /path/to/sceneB_base.mp4 assets/scenes/
cp /path/to/sceneC_base.mp4 assets/scenes/

# Copy scene icons to assets/images/
cp /path/to/icons/* assets/images/
```

See `assets/README.md` for detailed asset requirements.

### 6. Configure Scenes

Edit `config/scenes.json` to match your scene assets:

```json
{
  "scenes": {
    "sceneA": {
      "id": "sceneA",
      "name": "武术表演",
      "description": "展示你的武术动作",
      "base_video_path": "assets/scenes/sceneA_base.mp4",
      "segments": [
        {
          "duration": 8,
          "path_type": "enter_left",
          "offset_start": [-200, 0],
          "offset_end": [0, 0]
        }
      ]
    }
  }
}
```

## Production Deployment

### Option 1: Manual Production Start

#### Build Frontend

```bash
# Linux/macOS
./build-frontend.sh

# Windows
build-frontend.bat
```

#### Start Backend

```bash
# Linux/macOS
./start-production.sh

# Windows
start-production.bat
```

#### Serve Frontend

The frontend build is in `frontend/dist/`. Serve it with any web server:

**Using Python's built-in server:**

```bash
cd frontend/dist
python3 -m http.server 3000
```

**Using nginx (recommended for production):**

```nginx
server {
    listen 80;
    server_name localhost;
    
    root /opt/shadow-puppet/frontend/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 2: Systemd Service (Linux)

#### 1. Install System-Wide

```bash
# Create installation directory
sudo mkdir -p /opt/shadow-puppet

# Copy project files
sudo cp -r . /opt/shadow-puppet/

# Set permissions
sudo chown -R www-data:www-data /opt/shadow-puppet
sudo chmod -R 755 /opt/shadow-puppet
```

#### 2. Install Systemd Service

```bash
# Copy service file
sudo cp shadow-puppet.service /etc/systemd/system/

# Create log directory
sudo mkdir -p /var/log/shadow-puppet
sudo chown www-data:www-data /var/log/shadow-puppet

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable shadow-puppet

# Start service
sudo systemctl start shadow-puppet

# Check status
sudo systemctl status shadow-puppet
```

#### 3. View Logs

```bash
# View backend logs
sudo journalctl -u shadow-puppet -f

# View application logs
sudo tail -f /var/log/shadow-puppet/backend.log
```

### Option 3: Docker Deployment (Optional)

Create `Dockerfile` for containerized deployment:

```dockerfile
FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy backend files
COPY backend/ ./backend/
COPY config/ ./config/
COPY assets/ ./assets/

# Install Python dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Create data directories
RUN mkdir -p data/sessions data/outputs data/logs

# Expose port
EXPOSE 8000

# Start backend
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

## Configuration

### Environment Variables

Edit `.env` file:

```bash
# Backend Configuration
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000

# Frontend Configuration
VITE_API_BASE_URL=http://<YOUR_LOCAL_IP>:8000

# Storage Paths
DATA_PATH=./data
ASSETS_PATH=./assets
CONFIG_PATH=./config

# Logging
LOG_LEVEL=INFO
LOG_FILE=./data/logs/app.log

# Development
DEBUG=false
```

### CORS Configuration

The backend is configured to allow all origins for LAN access. To restrict access, edit `backend/app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.168.1.100:3000"],  # Specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### System Settings

Edit `config/settings.json`:

```json
{
  "language": "zh",
  "timeouts": {
    "idle_to_scene_select": 1,
    "scene_select_inactivity": 10,
    "motion_capture_inactivity": 15,
    "final_result_auto_reset": 30
  },
  "storage": {
    "max_age_days": 7,
    "min_disk_space_gb": 5,
    "emergency_cleanup_threshold_gb": 2,
    "emergency_cleanup_target_gb": 3
  },
  "performance": {
    "min_fps": 20,
    "max_cursor_latency_ms": 100,
    "max_state_transition_ms": 1000
  }
}
```

## Testing Deployment

### 1. Test Backend Health

```bash
curl http://localhost:8000/api/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": 1234567890.0,
  "disk_space_gb": 50.5,
  "storage": {
    "session_count": 0,
    "video_count": 0,
    "total_size_mb": 0
  },
  "sessions": {
    "total": 0,
    "pending": 0,
    "processing": 0,
    "done": 0,
    "cancelled": 0,
    "failed": 0
  }
}
```

### 2. Test Frontend Access

Open browser and navigate to:

- Development: `http://localhost:3000`
- Production: `http://<YOUR_IP>:80` (or configured port)

### 3. Test Camera Access

1. Allow camera permissions when prompted
2. Verify person detection works (IDLE → SCENE_SELECT transition)
3. Test hand tracking and cursor movement

### 4. Test Complete Flow

1. **Idle State**: Stand in front of camera for 1 second
2. **Scene Selection**: Use hand to hover over a scene for 5 seconds
3. **Motion Capture**: Follow guidance and perform actions
4. **Video Generation**: Wait for rendering (10-20 seconds)
5. **QR Code**: Scan QR code with mobile device
6. **Download**: Verify video downloads and plays correctly

### 5. Test QR Code Download from Mobile

1. Connect mobile device to same LAN network
2. Scan QR code displayed on screen
3. Verify video downloads and plays on mobile device

### 6. Test Auto-Reset

1. Complete a full session
2. Wait 30 seconds on final result page
3. Verify system resets to IDLE state

## Troubleshooting

### Camera Not Detected

**Problem**: Camera access denied or not working

**Solutions**:
- Check browser permissions (chrome://settings/content/camera)
- Verify camera is not in use by another application
- Try different browser (Chrome recommended)
- Check camera drivers are installed

### Backend Not Starting

**Problem**: Backend fails to start

**Solutions**:
- Check Python version: `python3 --version` (must be 3.10+)
- Verify all dependencies installed: `pip install -r backend/requirements.txt`
- Check port 8000 is not in use: `lsof -i :8000` (Linux/macOS)
- Review logs: `tail -f data/logs/app.log`

### Frontend Build Fails

**Problem**: `npm run build` fails

**Solutions**:
- Clear npm cache: `npm cache clean --force`
- Delete node_modules: `rm -rf node_modules && npm install`
- Check Node version: `node --version` (must be 18+)
- Review build errors in console

### Video Rendering Fails

**Problem**: Video generation fails or takes too long

**Solutions**:
- Check OpenCV installation: `python3 -c "import cv2; print(cv2.__version__)"`
- Verify base video files exist in `assets/scenes/`
- Check disk space: `df -h`
- Review backend logs for specific errors
- Ensure video codec H.264 is available

### QR Code Not Working

**Problem**: Mobile device cannot download video

**Solutions**:
- Verify mobile device is on same LAN network
- Check firewall allows port 8000
- Test URL directly in mobile browser: `http://<IP>:8000/api/videos/<session_id>`
- Verify backend CORS is configured for LAN access
- Check backend is bound to 0.0.0.0, not 127.0.0.1

### Low Disk Space

**Problem**: System runs out of disk space

**Solutions**:
- Check available space: `df -h`
- Manually trigger cleanup: `curl -X POST http://localhost:8000/api/cleanup`
- Adjust cleanup settings in `config/settings.json`
- Delete old videos manually from `data/outputs/`

### Performance Issues

**Problem**: System is slow or laggy

**Solutions**:
- Check CPU usage: `top` or Task Manager
- Verify camera FPS: Should be ≥20 FPS
- Reduce video resolution in scene configuration
- Close other applications
- Upgrade hardware if needed

## Maintenance

### Daily Tasks

- Check system logs for errors
- Verify disk space availability
- Test camera and detection

### Weekly Tasks

- Review session statistics
- Check cleanup job execution
- Update system if needed

### Monthly Tasks

- Backup configuration files
- Review and optimize scene assets
- Update dependencies if security patches available

### Log Management

```bash
# View recent logs
tail -f data/logs/app.log

# Search for errors
grep ERROR data/logs/app.log

# Rotate logs (if needed)
logrotate /etc/logrotate.d/shadow-puppet
```

### Backup

```bash
# Backup configuration
tar -czf backup-config-$(date +%Y%m%d).tar.gz config/

# Backup recent videos (last 7 days)
find data/outputs -name "*.mp4" -mtime -7 -exec cp {} backup/ \;
```

### Updates

```bash
# Update backend dependencies
cd backend
pip install --upgrade -r requirements.txt

# Update frontend dependencies
cd frontend
npm update

# Rebuild frontend
npm run build
```

### Monitoring

Set up monitoring for:
- Disk space (alert if < 5GB)
- Backend uptime
- Error rates in logs
- Session completion rates

### Security

- Keep system and dependencies updated
- Review logs for suspicious activity
- Restrict network access if needed
- Use HTTPS in production (with reverse proxy)

## Support

For issues and questions:
- Check logs: `data/logs/app.log`
- Review requirements: `requirements.md`
- Check design document: `design.md`
- Test with: `pytest` (backend) and `npm test` (frontend)

## Performance Targets

- Camera detection: ≥20 FPS
- Cursor latency: ≤100ms
- State transitions: ≤1 second
- Video rendering: 10-20 seconds
- Continuous operation: Multiple hours without restart

## Next Steps

After successful deployment:

1. Test complete user flow multiple times
2. Verify QR code downloads work from various mobile devices
3. Monitor system for 24 hours
4. Adjust configuration based on performance
5. Train staff on system operation and troubleshooting
