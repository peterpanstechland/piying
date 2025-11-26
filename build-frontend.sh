#!/bin/bash
# Build frontend for production

echo "Building Shadow Puppet Frontend for production..."

cd frontend

# Install dependencies
echo "Installing dependencies..."
npm install

# Run production build
echo "Building production bundle..."
npm run build

# Check if build was successful
if [ -d "dist" ]; then
    echo "✓ Frontend build successful!"
    echo "Build output: frontend/dist/"
    
    # Show build size
    du -sh dist
else
    echo "✗ Frontend build failed!"
    exit 1
fi

cd ..
echo "Frontend build complete."
