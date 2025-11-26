#!/bin/bash
# End-to-end deployment testing script

echo "Shadow Puppet System - Deployment Test"
echo "======================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to print test results
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Check Python installation
echo "Test 1: Checking Python installation..."
python3 --version > /dev/null 2>&1
test_result $? "Python 3 is installed"

# Test 2: Check Python version
echo "Test 2: Checking Python version (3.10+)..."
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
if (( $(echo "$PYTHON_VERSION >= 3.10" | bc -l) )); then
    test_result 0 "Python version is $PYTHON_VERSION (>= 3.10)"
else
    test_result 1 "Python version is $PYTHON_VERSION (< 3.10)"
fi

# Test 3: Check Node.js installation
echo "Test 3: Checking Node.js installation..."
node --version > /dev/null 2>&1
test_result $? "Node.js is installed"

# Test 4: Check Node.js version
echo "Test 4: Checking Node.js version (18+)..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 18 ]; then
    test_result 0 "Node.js version is v$NODE_VERSION (>= 18)"
else
    test_result 1 "Node.js version is v$NODE_VERSION (< 18)"
fi

# Test 5: Check required directories
echo "Test 5: Checking required directories..."
DIRS_EXIST=0
for dir in "data/sessions" "data/outputs" "data/logs" "assets/scenes" "config"; do
    if [ -d "$dir" ]; then
        ((DIRS_EXIST++))
    fi
done
if [ $DIRS_EXIST -eq 5 ]; then
    test_result 0 "All required directories exist"
else
    test_result 1 "Missing required directories ($DIRS_EXIST/5 found)"
fi

# Test 6: Check backend dependencies
echo "Test 6: Checking backend dependencies..."
cd backend
pip show fastapi > /dev/null 2>&1
FASTAPI=$?
pip show opencv-python > /dev/null 2>&1
OPENCV=$?
cd ..
if [ $FASTAPI -eq 0 ] && [ $OPENCV -eq 0 ]; then
    test_result 0 "Backend dependencies installed"
else
    test_result 1 "Backend dependencies missing"
fi

# Test 7: Check frontend build
echo "Test 7: Checking frontend build..."
if [ -d "frontend/dist" ]; then
    test_result 0 "Frontend build exists"
else
    test_result 1 "Frontend build not found (run ./build-frontend.sh)"
fi

# Test 8: Check configuration files
echo "Test 8: Checking configuration files..."
CONFIG_FILES=0
for file in "config/scenes.json" "config/settings.json" ".env"; do
    if [ -f "$file" ]; then
        ((CONFIG_FILES++))
    fi
done
if [ $CONFIG_FILES -eq 3 ]; then
    test_result 0 "All configuration files exist"
else
    test_result 1 "Missing configuration files ($CONFIG_FILES/3 found)"
fi

# Test 9: Check scene assets
echo "Test 9: Checking scene assets..."
SCENE_COUNT=$(find assets/scenes -name "*.mp4" 2>/dev/null | wc -l)
if [ $SCENE_COUNT -ge 1 ]; then
    test_result 0 "Scene video files found ($SCENE_COUNT)"
else
    test_result 1 "No scene video files found"
fi

# Test 10: Check backend health (if running)
echo "Test 10: Checking backend health endpoint..."
curl -s http://localhost:8000/api/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    HEALTH_STATUS=$(curl -s http://localhost:8000/api/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    if [ "$HEALTH_STATUS" = "healthy" ] || [ "$HEALTH_STATUS" = "degraded" ]; then
        test_result 0 "Backend is running and healthy (status: $HEALTH_STATUS)"
    else
        test_result 1 "Backend is running but unhealthy (status: $HEALTH_STATUS)"
    fi
else
    echo -e "${YELLOW}⊘ SKIP${NC}: Backend is not running (start with ./start-production.sh)"
fi

# Test 11: Check disk space
echo "Test 11: Checking disk space..."
AVAILABLE_SPACE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -ge 10 ]; then
    test_result 0 "Sufficient disk space ($AVAILABLE_SPACE GB available)"
else
    test_result 1 "Low disk space ($AVAILABLE_SPACE GB available, need 10+ GB)"
fi

# Test 12: Check port availability
echo "Test 12: Checking port availability..."
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⊘ INFO${NC}: Port 8000 is in use (backend may be running)"
else
    test_result 0 "Port 8000 is available"
fi

# Test 13: Validate scenes.json
echo "Test 13: Validating scenes.json..."
if [ -f "config/scenes.json" ]; then
    python3 -c "import json; json.load(open('config/scenes.json'))" 2>/dev/null
    test_result $? "scenes.json is valid JSON"
else
    test_result 1 "scenes.json not found"
fi

# Test 14: Check OpenCV installation
echo "Test 14: Checking OpenCV installation..."
python3 -c "import cv2; print(cv2.__version__)" > /dev/null 2>&1
test_result $? "OpenCV is installed and importable"

# Test 15: Check write permissions
echo "Test 15: Checking write permissions..."
touch data/sessions/.test 2>/dev/null && rm data/sessions/.test 2>/dev/null
SESSIONS_WRITE=$?
touch data/outputs/.test 2>/dev/null && rm data/outputs/.test 2>/dev/null
OUTPUTS_WRITE=$?
if [ $SESSIONS_WRITE -eq 0 ] && [ $OUTPUTS_WRITE -eq 0 ]; then
    test_result 0 "Write permissions OK for data directories"
else
    test_result 1 "Write permission issues in data directories"
fi

# Summary
echo ""
echo "======================================="
echo "Test Summary"
echo "======================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! System is ready for deployment.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please fix the issues before deployment.${NC}"
    exit 1
fi
