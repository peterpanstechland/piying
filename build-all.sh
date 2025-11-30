#!/bin/bash
# ============================================================
# Build All Frontends for Production (Unix/Linux/macOS)
# Shadow Puppet Interactive System
# ============================================================

echo "============================================================"
echo "Building All Frontends for Production"
echo "============================================================"
echo ""

# Track build status
BUILD_SUCCESS=true
MAIN_BUILT=false
ADMIN_BUILT=false

# ============================================================
# Build Main Frontend
# ============================================================
echo "[1/2] Building Main Frontend..."
echo "------------------------------------------------------------"

if [ ! -d "frontend" ]; then
    echo "ERROR: frontend directory not found."
    BUILD_SUCCESS=false
else
    cd frontend

    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            echo "ERROR: Failed to install frontend dependencies."
            BUILD_SUCCESS=false
            cd ..
        fi
    fi

    if [ -d "node_modules" ]; then
        echo "Building production bundle..."
        npm run build

        if [ -d "dist" ]; then
            echo "✓ Main Frontend build successful!"
            MAIN_BUILT=true
        else
            echo "✗ Main Frontend build failed!"
            BUILD_SUCCESS=false
        fi
        cd ..
    fi
fi

echo ""

# ============================================================
# Build Admin Frontend
# ============================================================
echo "[2/2] Building Admin Panel Frontend..."
echo "------------------------------------------------------------"

if [ ! -d "admin-frontend" ]; then
    echo "ERROR: admin-frontend directory not found."
    BUILD_SUCCESS=false
else
    cd admin-frontend

    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            echo "ERROR: Failed to install admin-frontend dependencies."
            BUILD_SUCCESS=false
            cd ..
        fi
    fi

    if [ -d "node_modules" ]; then
        echo "Building production bundle..."
        npm run build

        if [ -d "dist" ]; then
            echo "✓ Admin Panel build successful!"
            ADMIN_BUILT=true
        else
            echo "✗ Admin Panel build failed!"
            BUILD_SUCCESS=false
        fi
        cd ..
    fi
fi

echo ""

# ============================================================
# Summary
# ============================================================
echo "============================================================"
echo "Build Summary"
echo "============================================================"

if [ "$MAIN_BUILT" = true ]; then
    echo "✓ Main Frontend:  frontend/dist/"
    du -sh frontend/dist 2>/dev/null || true
else
    echo "✗ Main Frontend:  NOT BUILT"
fi

if [ "$ADMIN_BUILT" = true ]; then
    echo "✓ Admin Panel:    admin-frontend/dist/"
    du -sh admin-frontend/dist 2>/dev/null || true
else
    echo "✗ Admin Panel:    NOT BUILT"
fi

echo ""

if [ "$BUILD_SUCCESS" = true ]; then
    echo "All builds completed successfully!"
    echo ""
    echo "To start the production server, run:"
    echo "  ./start-production.sh"
    echo ""
    echo "Access points:"
    echo "  Main App:    http://localhost:8000/"
    echo "  Admin Panel: http://localhost:8000/admin/"
    exit 0
else
    echo "Some builds failed. Please check the errors above."
    exit 1
fi
