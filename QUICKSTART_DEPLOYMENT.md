# Quick Start - Production Deployment

This guide will get your Shadow Puppet Interactive System up and running in production in under 30 minutes.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Webcam (720p+)
- 50GB+ free disk space

## Step 1: Install Dependencies (5 minutes)

### Linux/macOS

```bash
# Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Windows

```cmd
REM Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..

REM Install frontend dependencies
cd frontend
npm install
cd ..
```

## Step 2: Configure Environment (2 minutes)

```bash
# Copy environment template
cp .env.example .env

# Edit .env and set your local IP address
# Find your IP: ifconfig (Linux/macOS) or ipconfig (Windows)
nano .env
```

Update `VITE_API_BASE_URL` in `.env`:

```bash
VITE_API_BASE_URL=http://192.168.1.100:8000  # Replace with your IP
```

## Step 3: Add Scene Assets (5 minutes)

Place your base videos in `assets/scenes/`:

```bash
# Example structure
assets/scenes/
├── sceneA_base.mp4  # 30 seconds, 1920x1080
├── sceneB_base.mp4  # 30 seconds, 1920x1080
└── sceneC_base.mp4  # 30 seconds, 1920x1080
```

See `assets/README.md` for creating placeholder assets if you don't have videos yet.

## Step 4: Build Frontend (3 minutes)

### Linux/macOS

```bash
./build-frontend.sh
```

### Windows

```cmd
build-frontend.bat
```

## Step 5: Test Deployment (2 minutes)

### Linux/macOS

```bash
chmod +x test-deployment.sh
./test-deployment.sh
```

### Windows

```cmd
test-deployment.bat
```

Fix any issues reported by the test script.

## Step 6: Start Production Server (1 minute)

### Linux/macOS

```bash
chmod +x start-production.sh
./start-production.sh
```

### Windows

```cmd
start-production.bat
```

The backend will start on port 8000.

## Step 7: Serve Frontend (2 minutes)

### Option A: Simple Python Server (Development/Testing)

```bash
cd frontend/dist
python3 -m http.server 3000
```

### Option B: Nginx (Production - Recommended)

Install nginx and configure:

```nginx
server {
    listen 80;
    server_name _;
    
    root /path/to/shadow-puppet/frontend/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Step 8: Test Complete Flow (5 minutes)

1. Open browser: `http://YOUR_IP:3000` (or `:80` if using nginx)
2. Allow camera access
3. Stand in front of camera (should transition from IDLE to SCENE_SELECT)
4. Use hand to select a scene (hover for 5 seconds)
5. Follow motion capture guidance
6. Wait for video generation
7. Scan QR code with mobile device
8. Verify video downloads and plays

## Step 9: Verify QR Code Download (2 minutes)

1. Connect mobile device to same WiFi network
2. Complete a session and reach final result page
3. Scan QR code with mobile camera
4. Verify video downloads and plays correctly

## Troubleshooting

### Camera Not Working

- Check browser permissions (chrome://settings/content/camera)
- Try Chrome browser (recommended)
- Verify camera is not in use by another app

### QR Code Not Working

- Verify mobile device is on same network
- Check firewall allows port 8000
- Test URL directly: `http://YOUR_IP:8000/api/health`

### Backend Won't Start

- Check Python version: `python3 --version` (must be 3.10+)
- Verify port 8000 is available: `lsof -i :8000` (Linux/macOS)
- Check logs: `tail -f data/logs/app.log`

### Video Rendering Fails

- Verify OpenCV installed: `python3 -c "import cv2; print(cv2.__version__)"`
- Check base video files exist in `assets/scenes/`
- Ensure sufficient disk space: `df -h`

## Auto-Start on Boot (Linux)

For production deployment with auto-start:

```bash
# Copy service file
sudo cp shadow-puppet.service /etc/systemd/system/

# Enable and start service
sudo systemctl enable shadow-puppet
sudo systemctl start shadow-puppet

# Check status
sudo systemctl status shadow-puppet
```

## Next Steps

- Review full deployment guide: `DEPLOYMENT.md`
- Configure scene parameters: `config/scenes.json`
- Set up monitoring and backups
- Train staff on system operation

## Support

- Check logs: `data/logs/app.log`
- Run health check: `curl http://localhost:8000/api/health`
- Review requirements: `.kiro/specs/shadow-puppet-interactive-system/requirements.md`

## Performance Targets

- Camera detection: ≥20 FPS
- Cursor latency: ≤100ms
- State transitions: ≤1 second
- Video rendering: 10-20 seconds
- Continuous operation: Multiple hours without restart

---

**Total Setup Time: ~25 minutes**

Your Shadow Puppet Interactive System is now ready for production use!
