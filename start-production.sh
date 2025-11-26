#!/bin/bash
# Start Shadow Puppet System in production mode

echo "Starting Shadow Puppet Interactive System (Production Mode)"
echo "============================================================"

# Check if frontend is built
if [ ! -d "frontend/dist" ]; then
    echo "Error: Frontend not built. Run ./build-frontend.sh first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed."
    exit 1
fi

# Check if required directories exist
mkdir -p data/sessions
mkdir -p data/outputs
mkdir -p data/logs

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
pip install -r requirements.txt
cd ..

# Get local IP address for QR code
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
fi

echo ""
echo "System Configuration:"
echo "  Backend API: http://$LOCAL_IP:8000"
echo "  Frontend: Serve frontend/dist with a web server"
echo "  QR Code URLs will use: http://$LOCAL_IP:8000"
echo ""

# Start backend server
echo "Starting backend server..."
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --log-level info
