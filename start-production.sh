#!/bin/bash
# Start Shadow Puppet System in production mode

echo "Starting Shadow Puppet Interactive System (Production Mode)"
echo "============================================================"

# Build main frontend if not already built
if [ ! -d "frontend/dist" ]; then
    echo "Building main frontend..."
    cd frontend
    npm install
    npm run build
    if [ $? -ne 0 ]; then
        echo "Error: Frontend build failed."
        exit 1
    fi
    cd ..
fi

# Build admin frontend if not already built
if [ ! -d "admin-frontend/dist" ]; then
    echo "Building admin panel..."
    cd admin-frontend
    npm install
    npm run build
    if [ $? -ne 0 ]; then
        echo "Warning: Admin panel build failed. Admin panel will not be available."
    fi
    cd ..
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
