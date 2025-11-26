#!/bin/bash
# End-to-end integration test for Shadow Puppet System
# This script tests the complete user flow programmatically

echo "Shadow Puppet System - End-to-End Integration Test"
echo "===================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
API_BASE_URL="http://localhost:8000"
TEST_SCENE_ID="sceneA"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Backend is running
echo "Test 1: Checking if backend is running..."
curl -s "$API_BASE_URL/api/health" > /dev/null 2>&1
test_result $? "Backend is accessible"

# Test 2: Health endpoint returns valid JSON
echo "Test 2: Checking health endpoint response..."
HEALTH_RESPONSE=$(curl -s "$API_BASE_URL/api/health")
echo "$HEALTH_RESPONSE" | python3 -m json.tool > /dev/null 2>&1
test_result $? "Health endpoint returns valid JSON"

# Test 3: Health status is healthy or degraded
echo "Test 3: Checking system health status..."
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
if [ "$HEALTH_STATUS" = "healthy" ] || [ "$HEALTH_STATUS" = "degraded" ]; then
    test_result 0 "System health status is acceptable ($HEALTH_STATUS)"
else
    test_result 1 "System health status is not acceptable ($HEALTH_STATUS)"
fi

# Test 4: Create a new session
echo "Test 4: Creating a new session..."
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/sessions" \
    -H "Content-Type: application/json" \
    -d "{\"scene_id\": \"$TEST_SCENE_ID\"}")

SESSION_ID=$(echo "$CREATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('session_id', ''))" 2>/dev/null)

if [ -n "$SESSION_ID" ]; then
    test_result 0 "Session created successfully (ID: $SESSION_ID)"
else
    test_result 1 "Failed to create session"
    echo "Response: $CREATE_RESPONSE"
fi

# Test 5: Retrieve session status
if [ -n "$SESSION_ID" ]; then
    echo "Test 5: Retrieving session status..."
    SESSION_RESPONSE=$(curl -s "$API_BASE_URL/api/sessions/$SESSION_ID")
    SESSION_STATUS=$(echo "$SESSION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', ''))" 2>/dev/null)
    
    if [ "$SESSION_STATUS" = "pending" ]; then
        test_result 0 "Session status is pending (as expected)"
    else
        test_result 1 "Session status is not pending (got: $SESSION_STATUS)"
    fi
else
    echo -e "${YELLOW}⊘ SKIP${NC}: Test 5 - No session ID available"
fi

# Test 6: Upload segment data
if [ -n "$SESSION_ID" ]; then
    echo "Test 6: Uploading segment data..."
    
    # Create sample segment data
    SEGMENT_DATA='{
        "index": 0,
        "duration": 8.0,
        "frames": [
            {
                "timestamp": 0.033,
                "landmarks": [[0.5, 0.5, 0.0, 0.99], [0.6, 0.4, 0.0, 0.98]]
            },
            {
                "timestamp": 0.066,
                "landmarks": [[0.51, 0.51, 0.0, 0.99], [0.61, 0.41, 0.0, 0.98]]
            }
        ]
    }'
    
    UPLOAD_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/sessions/$SESSION_ID/segments/0" \
        -H "Content-Type: application/json" \
        -d "$SEGMENT_DATA")
    
    UPLOAD_SUCCESS=$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
    
    if [ "$UPLOAD_SUCCESS" = "True" ]; then
        test_result 0 "Segment data uploaded successfully"
    else
        test_result 1 "Failed to upload segment data"
        echo "Response: $UPLOAD_RESPONSE"
    fi
else
    echo -e "${YELLOW}⊘ SKIP${NC}: Test 6 - No session ID available"
fi

# Test 7: Verify segment was stored
if [ -n "$SESSION_ID" ]; then
    echo "Test 7: Verifying segment was stored..."
    SESSION_RESPONSE=$(curl -s "$API_BASE_URL/api/sessions/$SESSION_ID")
    SEGMENT_COUNT=$(echo "$SESSION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('segment_count', 0))" 2>/dev/null)
    
    if [ "$SEGMENT_COUNT" -ge 1 ]; then
        test_result 0 "Segment was stored (count: $SEGMENT_COUNT)"
    else
        test_result 1 "Segment was not stored"
    fi
else
    echo -e "${YELLOW}⊘ SKIP${NC}: Test 7 - No session ID available"
fi

# Test 8: Cancel session (cleanup)
if [ -n "$SESSION_ID" ]; then
    echo "Test 8: Cancelling test session..."
    curl -s -X DELETE "$API_BASE_URL/api/sessions/$SESSION_ID" > /dev/null 2>&1
    test_result $? "Test session cancelled"
else
    echo -e "${YELLOW}⊘ SKIP${NC}: Test 8 - No session ID available"
fi

# Test 9: Verify CORS headers
echo "Test 9: Checking CORS headers..."
CORS_HEADERS=$(curl -s -I "$API_BASE_URL/api/health" | grep -i "access-control-allow-origin")
if [ -n "$CORS_HEADERS" ]; then
    test_result 0 "CORS headers are present"
else
    test_result 1 "CORS headers are missing"
fi

# Test 10: Check disk space
echo "Test 10: Checking disk space..."
DISK_SPACE=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('disk_space_gb', 0))" 2>/dev/null)
if (( $(echo "$DISK_SPACE >= 5" | bc -l) )); then
    test_result 0 "Sufficient disk space ($DISK_SPACE GB)"
else
    test_result 1 "Low disk space ($DISK_SPACE GB)"
fi

# Summary
echo ""
echo "===================================================="
echo "Test Summary"
echo "===================================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All integration tests passed!${NC}"
    echo "The system is functioning correctly."
    exit 0
else
    echo -e "${RED}✗ Some integration tests failed.${NC}"
    echo "Please check the backend logs for details."
    exit 1
fi
