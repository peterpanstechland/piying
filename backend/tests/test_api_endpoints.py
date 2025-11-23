"""
Basic API endpoint tests to verify functionality
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import SessionStatus
import tempfile
import shutil
from pathlib import Path


@pytest.fixture
def client():
    """Create a test client"""
    return TestClient(app)


@pytest.fixture(autouse=True)
def setup_teardown():
    """Setup and teardown for tests"""
    # Setup: Create temp directory for sessions
    temp_dir = Path("data/sessions_test")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    yield
    
    # Teardown: Clean up test sessions
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_create_session(client):
    """Test POST /api/sessions endpoint"""
    response = client.post(
        "/api/sessions",
        json={"scene_id": "sceneA"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert "session_id" in data
    assert data["scene_id"] == "sceneA"
    assert data["status"] == "pending"


def test_get_session_status(client):
    """Test GET /api/sessions/{session_id} endpoint"""
    # First create a session
    create_response = client.post(
        "/api/sessions",
        json={"scene_id": "sceneB"}
    )
    session_id = create_response.json()["session_id"]
    
    # Then get its status
    response = client.get(f"/api/sessions/{session_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    assert data["scene_id"] == "sceneB"
    assert data["status"] == "pending"
    assert data["segment_count"] == 0


def test_get_nonexistent_session(client):
    """Test GET /api/sessions/{session_id} with invalid ID"""
    response = client.get("/api/sessions/nonexistent-id")
    
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_upload_segment(client):
    """Test POST /api/sessions/{session_id}/segments/{segment_index} endpoint"""
    # Create a session
    create_response = client.post(
        "/api/sessions",
        json={"scene_id": "sceneC"}
    )
    session_id = create_response.json()["session_id"]
    
    # Upload a segment
    segment_data = {
        "index": 0,
        "duration": 8.0,
        "frames": [
            {
                "timestamp": 0.033,
                "landmarks": [[0.5, 0.3, -0.1, 0.99], [0.52, 0.28, -0.12, 0.98]]
            }
        ]
    }
    
    response = client.post(
        f"/api/sessions/{session_id}/segments/0",
        json=segment_data
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    # Verify segment was saved
    status_response = client.get(f"/api/sessions/{session_id}")
    assert status_response.json()["segment_count"] == 1


def test_upload_segment_index_mismatch(client):
    """Test segment upload with mismatched index"""
    # Create a session
    create_response = client.post(
        "/api/sessions",
        json={"scene_id": "sceneA"}
    )
    session_id = create_response.json()["session_id"]
    
    # Try to upload with mismatched index
    segment_data = {
        "index": 1,  # Body says index 1
        "duration": 8.0,
        "frames": []
    }
    
    response = client.post(
        f"/api/sessions/{session_id}/segments/0",  # URL says index 0
        json=segment_data
    )
    
    assert response.status_code == 400
    assert "mismatch" in response.json()["detail"].lower()


def test_delete_session(client):
    """Test DELETE /api/sessions/{session_id} endpoint"""
    # Create a session
    create_response = client.post(
        "/api/sessions",
        json={"scene_id": "sceneA"}
    )
    session_id = create_response.json()["session_id"]
    
    # Delete it
    response = client.delete(f"/api/sessions/{session_id}")
    
    assert response.status_code == 200
    assert response.json()["success"] is True
    
    # Verify it's gone
    get_response = client.get(f"/api/sessions/{session_id}")
    assert get_response.status_code == 404
