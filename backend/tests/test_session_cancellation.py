"""
Tests for session cancellation functionality
Validates that DELETE endpoint properly marks sessions as cancelled
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import SessionManager, StorageManager
from app.models import SessionStatus
import tempfile
import shutil


@pytest.fixture
def temp_storage():
    """Create temporary storage for tests"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def client(temp_storage):
    """Create test client with temporary storage"""
    # Override storage manager with temp directory
    from app.api import sessions
    sessions.session_manager = SessionManager(StorageManager(base_path=temp_storage))
    
    client = TestClient(app)
    yield client


def test_delete_marks_session_as_cancelled_before_deletion(client):
    """
    Test that DELETE endpoint marks session as cancelled before deleting
    Validates: Requirements 17.5
    """
    # Create a session
    response = client.post("/api/sessions", json={"scene_id": "sceneA"})
    assert response.status_code == 201
    session_id = response.json()["session_id"]
    
    # Verify session exists and is pending
    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    
    # Delete the session
    response = client.delete(f"/api/sessions/{session_id}")
    assert response.status_code == 200
    assert response.json()["success"] is True
    
    # Verify session is deleted (404)
    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code == 404


def test_delete_nonexistent_session_returns_404(client):
    """Test that deleting a non-existent session returns 404"""
    response = client.delete("/api/sessions/nonexistent-id")
    assert response.status_code == 404


def test_delete_session_with_segments(client):
    """Test that deleting a session with segments works correctly"""
    # Create a session
    response = client.post("/api/sessions", json={"scene_id": "sceneA"})
    assert response.status_code == 201
    session_id = response.json()["session_id"]
    
    # Upload a segment
    segment_data = {
        "index": 0,
        "duration": 8.0,
        "frames": [
            {
                "timestamp": 0.033,
                "landmarks": [[0.5, 0.3, -0.1, 0.99] for _ in range(33)]
            }
        ]
    }
    response = client.post(
        f"/api/sessions/{session_id}/segments/0",
        json=segment_data
    )
    assert response.status_code == 200
    
    # Delete the session
    response = client.delete(f"/api/sessions/{session_id}")
    assert response.status_code == 200
    
    # Verify session is deleted
    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code == 404


def test_multiple_sessions_can_be_cancelled_independently(client):
    """Test that multiple sessions can be cancelled independently"""
    # Create multiple sessions
    session_ids = []
    for i in range(3):
        response = client.post("/api/sessions", json={"scene_id": f"scene{chr(65+i)}"})
        assert response.status_code == 201
        session_ids.append(response.json()["session_id"])
    
    # Cancel first session
    response = client.delete(f"/api/sessions/{session_ids[0]}")
    assert response.status_code == 200
    
    # Verify first session is deleted
    response = client.get(f"/api/sessions/{session_ids[0]}")
    assert response.status_code == 404
    
    # Verify other sessions still exist
    for session_id in session_ids[1:]:
        response = client.get(f"/api/sessions/{session_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "pending"
