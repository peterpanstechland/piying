#!/bin/bash
# ============================================================
# Build Admin Panel Frontend for Production (Unix/Linux/macOS)
# ============================================================

echo "============================================================"
echo "Building Admin Panel Frontend for production..."
echo "============================================================"
echo ""

# Check if admin-frontend directory exists
if [ ! -d "admin-frontend" ]; then
    echo "ERROR: admin-frontend directory not found."
    echo "Please ensure the admin panel project exists."
    exit 1
fi

cd admin-frontend

# Check if node_modules exists, if not install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies."
        cd ..
        exit 1
    fi
fi

# Run TypeScript compilation and Vite build
echo "Building production bundle..."
npm run build

# Check if build was successful
if [ -d "dist" ]; then
    echo ""
    echo "============================================================"
    echo "✓ Admin Panel build successful!"
    echo "Build output: admin-frontend/dist/"
    echo "============================================================"
    
    # Show build size
    echo ""
    echo "Build size:"
    du -sh dist
    
    # Count files
    FILE_COUNT=$(find dist -type f | wc -l)
    echo "$FILE_COUNT files generated."
else
    echo ""
    echo "✗ Admin Panel build failed!"
    cd ..
    exit 1
fi

cd ..
echo ""
echo "Admin Panel build complete."
echo "The admin panel will be served at /admin/ when the backend starts."
