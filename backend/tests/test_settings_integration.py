"""
Integration tests for Settings flow.

Tests the complete settings flow including:
- Storage mode configuration (local/S3)
- S3 connection testing
- QR code settings (IP auto-detection, manual IP)
- System settings (language, timeouts)

Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3
"""

import pytest
import uuid
import bcrypt
import json
import os
import tempfile
from datetime import datetime
from typing import AsyncGenerator
from pathlib import Path
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.admin.user import User
from app.services.admin.settings_service import SettingsService


# Test database setup
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    future=True,
)

TestSessionMaker = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


def hash_password_bcrypt(password: str) -> str:
    """Hash a password using bcrypt directly."""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    """Override database dependency for testing."""
    async with TestSessionMaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@pytest.fixture(scope="function")
async def setup_test_db():
    """Set up test database before each test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    app.dependency_overrides[get_db] = override_get_db
    
    yield
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(setup_test_db) -> dict:
    """Create a test user and return credentials."""
    async with TestSessionMaker() as db:
        user = User(
            id=str(uuid.uuid4()),
            username="admin_test",
            password_hash=hash_password_bcrypt("adminpass123"),
            role="admin",
            created_at=datetime.utcnow(),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        return {
            "id": user.id,
            "username": "admin_test",
            "password": "adminpass123",
            "role": "admin"
        }


@pytest.fixture
async def async_client(setup_test_db) -> AsyncGenerator[AsyncClient, None]:
    """Create async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def auth_token(async_client: AsyncClient, test_user: dict) -> str:
    """Get authentication token for test user."""
    response = await async_client.post(
        "/api/admin/auth/login",
        json={"username": test_user["username"], "password": test_user["password"]}
    )
    return response.json()["token"]


@pytest.fixture
def temp_settings_file():
    """Create a temporary settings file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        default_settings = {
            "system": {"language": "zh", "fallback_language": "en"},
            "camera": {"default_camera_id": None, "min_fps": 20, "detection_confidence": 0.5},
            "timeouts": {
                "idle_to_scene_select_seconds": 1,
                "scene_select_inactivity_seconds": 10,
                "motion_capture_inactivity_seconds": 15,
                "final_result_auto_reset_seconds": 30,
                "exit_gesture_duration_seconds": 3,
                "exit_confirmation_duration_seconds": 2
            },
            "storage": {"mode": "local", "local_path": "data/outputs"},
            "rendering": {"target_fps": 30, "video_codec": "H264", "max_render_time_seconds": 20},
            "qr_code": {"auto_detect_ip": True, "manual_ip": None, "port": 8000}
        }
        json.dump(default_settings, f)
        temp_path = f.name
    
    yield Path(temp_path)
    
    # Cleanup
    if os.path.exists(temp_path):
        os.unlink(temp_path)


# ============================================================================
# Task 30.1: Storage Settings Integration Tests
# Requirements: 7.1, 7.2, 7.3, 7.4
# ============================================================================

class TestStorageModeConfiguration:
    """
    Test storage mode configuration.
    
    Validates: Requirements 7.1, 7.5
    - WHEN an admin selects "Local Storage" mode THEN the Admin Panel SHALL configure 
      the system to save videos to the local data directory
    - WHEN storage mode is changed THEN the Admin Panel SHALL update the system 
      configuration without requiring a restart
    """
    
    @pytest.mark.asyncio
    async def test_get_storage_settings(self, async_client: AsyncClient, auth_token: str):
        """Test retrieving current storage settings."""
        response = await async_client.get(
            "/api/admin/settings/storage",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "mode" in data
        assert data["mode"] in ["local", "s3"]
        assert "local_path" in data
    
    @pytest.mark.asyncio
    async def test_update_storage_mode_to_local(self, async_client: AsyncClient, auth_token: str):
        """Test updating storage mode to local."""
        response = await async_client.put(
            "/api/admin/settings/storage",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"mode": "local", "local_path": "data/test_outputs"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "local"
        assert data["local_path"] == "data/test_outputs"

    
    @pytest.mark.asyncio
    async def test_storage_mode_persists_after_update(self, async_client: AsyncClient, auth_token: str):
        """Test that storage mode changes persist."""
        # Update to local mode
        await async_client.put(
            "/api/admin/settings/storage",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"mode": "local", "local_path": "data/persistent_test"}
        )
        
        # Retrieve and verify persistence
        response = await async_client.get(
            "/api/admin/settings/storage",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "local"
        assert data["local_path"] == "data/persistent_test"


class TestS3Configuration:
    """
    Test S3 storage configuration.
    
    Validates: Requirements 7.2, 7.3, 7.4
    - WHEN an admin selects "AWS S3" mode THEN the Admin Panel SHALL require S3 bucket 
      name, region, access key, and secret key configuration
    - WHEN an admin saves S3 credentials THEN the Admin Panel SHALL test the connection 
      and display success or failure status
    - WHEN S3 connection test fails THEN the Admin Panel SHALL display the specific 
      error message from AWS
    """
    
    @pytest.mark.asyncio
    async def test_s3_mode_requires_all_credentials(self, async_client: AsyncClient, auth_token: str):
        """Test that S3 mode requires all credentials."""
        # First, reset to local mode and clear any existing S3 credentials
        # This ensures the test is isolated from any previous state
        await async_client.put(
            "/api/admin/settings/storage",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "mode": "local",
                "s3_bucket": "",
                "s3_region": "",
                "s3_access_key": "",
                "s3_secret_key": ""
            }
        )
        
        # Try to set S3 mode without credentials
        response = await async_client.put(
            "/api/admin/settings/storage",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"mode": "s3"}
        )
        
        assert response.status_code == 400
        assert "S3 mode requires" in response.json()["detail"]

    
    @pytest.mark.asyncio
    async def test_s3_connection_test_with_invalid_credentials(self, async_client: AsyncClient, auth_token: str):
        """Test S3 connection test returns error for invalid credentials."""
        response = await async_client.post(
            "/api/admin/settings/storage/test",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "bucket": "test-bucket",
                "region": "us-east-1",
                "access_key": "invalid_key",
                "secret_key": "invalid_secret"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "message" in data
        # Should contain AWS error or connection error
        assert len(data["message"]) > 0
    
    @pytest.mark.asyncio
    async def test_s3_connection_test_returns_specific_error(self, async_client: AsyncClient, auth_token: str):
        """Test that S3 connection test returns specific error messages."""
        response = await async_client.post(
            "/api/admin/settings/storage/test",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "bucket": "nonexistent-bucket-12345",
                "region": "invalid-region",
                "access_key": "AKIAIOSFODNN7EXAMPLE",
                "secret_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        # Error message should be descriptive
        assert "message" in data
        assert len(data["message"]) > 10  # Should have meaningful error text


# ============================================================================
# Task 30.2: QR Code Settings Integration Tests
# Requirements: 8.1, 8.2, 8.3
# ============================================================================

class TestIPAutoDetection:
    """
    Test IP auto-detection functionality.
    
    Validates: Requirements 8.1, 8.2
    - WHEN local storage mode is active THEN the Admin Panel SHALL display the current 
      LAN IP address used for QR codes
    - WHEN an admin enables "Auto-detect IP" THEN the Admin Panel SHALL automatically 
      determine the machine's LAN IP address
    """
    
    @pytest.mark.asyncio
    async def test_get_lan_ip_returns_valid_ip(self, async_client: AsyncClient, auth_token: str):
        """Test that LAN IP endpoint returns a valid IP address."""
        response = await async_client.get(
            "/api/admin/settings/lan-ip",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "ip" in data
        assert "auto_detected" in data
        
        # Validate IP format (IPv4)
        ip = data["ip"]
        parts = ip.split(".")
        assert len(parts) == 4
        for part in parts:
            assert 0 <= int(part) <= 255
    
    @pytest.mark.asyncio
    async def test_auto_detect_ip_returns_auto_detected_flag(self, async_client: AsyncClient, auth_token: str):
        """Test that auto-detected IP has correct flag."""
        # First ensure auto-detect is enabled
        await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"qr_code": {"auto_detect_ip": True}}
        )
        
        response = await async_client.get(
            "/api/admin/settings/lan-ip",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["auto_detected"] is True


class TestManualIPConfiguration:
    """
    Test manual IP configuration.
    
    Validates: Requirements 8.3
    - WHEN an admin manually sets an IP address THEN the Admin Panel SHALL use the 
      specified IP for QR code generation
    """
    
    @pytest.mark.asyncio
    async def test_set_manual_ip(self, async_client: AsyncClient, auth_token: str):
        """Test setting a manual IP address."""
        manual_ip = "192.168.1.100"
        
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "qr_code": {
                    "auto_detect_ip": False,
                    "manual_ip": manual_ip
                }
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["qr_code"]["auto_detect_ip"] is False
        assert data["qr_code"]["manual_ip"] == manual_ip
    
    @pytest.mark.asyncio
    async def test_manual_ip_used_when_auto_detect_disabled(self, async_client: AsyncClient, auth_token: str):
        """Test that manual IP is used when auto-detect is disabled."""
        manual_ip = "10.0.0.50"
        
        # Set manual IP with auto-detect disabled
        await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "qr_code": {
                    "auto_detect_ip": False,
                    "manual_ip": manual_ip
                }
            }
        )
        
        # Get LAN IP - should return manual IP
        response = await async_client.get(
            "/api/admin/settings/lan-ip",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["ip"] == manual_ip
        assert data["auto_detected"] is False

    
    @pytest.mark.asyncio
    async def test_qr_code_port_configuration(self, async_client: AsyncClient, auth_token: str):
        """Test configuring QR code port."""
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"qr_code": {"port": 3000}}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["qr_code"]["port"] == 3000


# ============================================================================
# Task 30.3: System Settings Integration Tests
# Requirements: 9.1, 9.2, 9.3
# ============================================================================

class TestLanguageSettings:
    """
    Test language settings.
    
    Validates: Requirements 9.1
    - WHEN an admin changes the default language setting THEN the Admin Panel SHALL 
      update the frontend display language without requiring a restart
    """
    
    @pytest.mark.asyncio
    async def test_get_current_language(self, async_client: AsyncClient, auth_token: str):
        """Test retrieving current language setting."""
        response = await async_client.get(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "language" in data
        assert data["language"] in ["zh", "en"]
    
    @pytest.mark.asyncio
    async def test_change_language_to_english(self, async_client: AsyncClient, auth_token: str):
        """Test changing language to English."""
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"language": "en"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["language"] == "en"

    
    @pytest.mark.asyncio
    async def test_change_language_to_chinese(self, async_client: AsyncClient, auth_token: str):
        """Test changing language to Chinese."""
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"language": "zh"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["language"] == "zh"
    
    @pytest.mark.asyncio
    async def test_language_change_persists(self, async_client: AsyncClient, auth_token: str):
        """Test that language changes persist."""
        # Change to English
        await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"language": "en"}
        )
        
        # Retrieve and verify
        response = await async_client.get(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        assert response.json()["language"] == "en"


class TestTimeoutSettings:
    """
    Test timeout settings.
    
    Validates: Requirements 9.2
    - WHEN an admin modifies timeout values THEN the Admin Panel SHALL validate that 
      values are within acceptable ranges (1-300 seconds)
    """
    
    @pytest.mark.asyncio
    async def test_update_timeout_values(self, async_client: AsyncClient, auth_token: str):
        """Test updating timeout values within valid range."""
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "timeouts": {
                    "idle_to_scene_select_seconds": 5,
                    "scene_select_inactivity_seconds": 20,
                    "final_result_auto_reset_seconds": 60
                }
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["timeouts"]["idle_to_scene_select_seconds"] == 5
        assert data["timeouts"]["scene_select_inactivity_seconds"] == 20
        assert data["timeouts"]["final_result_auto_reset_seconds"] == 60

    
    @pytest.mark.asyncio
    async def test_timeout_value_below_minimum_rejected(self, async_client: AsyncClient, auth_token: str):
        """Test that timeout values below 1 second are rejected."""
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"timeouts": {"idle_to_scene_select_seconds": 0}}
        )
        
        # 400 for custom validation, 422 for Pydantic validation
        assert response.status_code in [400, 422]
        detail = response.json().get("detail", "")
        # Handle both string detail and list of validation errors
        if isinstance(detail, list):
            # Pydantic validation error format
            assert any("greater" in str(err).lower() or "1" in str(err) for err in detail)
        else:
            assert "out of range" in detail.lower() or "greater than" in detail.lower()
    
    @pytest.mark.asyncio
    async def test_timeout_value_above_maximum_rejected(self, async_client: AsyncClient, auth_token: str):
        """Test that timeout values above 300 seconds are rejected."""
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"timeouts": {"scene_select_inactivity_seconds": 500}}
        )
        
        # 400 for custom validation, 422 for Pydantic validation
        assert response.status_code in [400, 422]
        detail = response.json().get("detail", "")
        # Handle both string detail and list of validation errors
        if isinstance(detail, list):
            # Pydantic validation error format
            assert any("less" in str(err).lower() or "300" in str(err) for err in detail)
        else:
            assert "out of range" in detail.lower() or "less than" in detail.lower()
    
    @pytest.mark.asyncio
    async def test_timeout_boundary_values_accepted(self, async_client: AsyncClient, auth_token: str):
        """Test that boundary values (1 and 300) are accepted."""
        # Test minimum boundary
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"timeouts": {"exit_gesture_duration_seconds": 1}}
        )
        assert response.status_code == 200
        assert response.json()["timeouts"]["exit_gesture_duration_seconds"] == 1
        
        # Test maximum boundary
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"timeouts": {"exit_gesture_duration_seconds": 300}}
        )
        assert response.status_code == 200
        assert response.json()["timeouts"]["exit_gesture_duration_seconds"] == 300


class TestRenderingSettings:
    """
    Test rendering quality settings.
    
    Validates: Requirements 9.3
    - WHEN an admin changes rendering quality settings THEN the Admin Panel SHALL 
      update the video output resolution and bitrate configuration
    """
    
    @pytest.mark.asyncio
    async def test_update_rendering_settings(self, async_client: AsyncClient, auth_token: str):
        """Test updating rendering settings."""
        response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "rendering": {
                    "target_fps": 24,
                    "video_codec": "H264",
                    "max_render_time_seconds": 30
                }
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["rendering"]["target_fps"] == 24
        assert data["rendering"]["video_codec"] == "H264"
        assert data["rendering"]["max_render_time_seconds"] == 30
    
    @pytest.mark.asyncio
    async def test_rendering_settings_persist(self, async_client: AsyncClient, auth_token: str):
        """Test that rendering settings persist."""
        # Update settings
        await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"rendering": {"target_fps": 60}}
        )
        
        # Retrieve and verify
        response = await async_client.get(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        assert response.json()["rendering"]["target_fps"] == 60


class TestCompleteSettingsFlow:
    """
    Test complete settings flow end-to-end.
    
    Validates: Requirements 7.1, 7.5, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4
    """
    
    @pytest.mark.asyncio
    async def test_complete_settings_update_flow(self, async_client: AsyncClient, auth_token: str):
        """
        Test complete flow: get settings -> update multiple settings -> verify persistence.
        """
        # Step 1: Get current settings
        get_response = await async_client.get(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert get_response.status_code == 200
        original_settings = get_response.json()

        
        # Step 2: Update multiple settings at once
        update_response = await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "language": "en",
                "storage": {"mode": "local", "local_path": "data/test_complete"},
                "qr_code": {"auto_detect_ip": False, "manual_ip": "192.168.1.200", "port": 8080},
                "timeouts": {"idle_to_scene_select_seconds": 3},
                "rendering": {"target_fps": 25}
            }
        )
        assert update_response.status_code == 200
        
        # Step 3: Verify all changes persisted
        verify_response = await async_client.get(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert verify_response.status_code == 200
        updated_settings = verify_response.json()
        
        assert updated_settings["language"] == "en"
        assert updated_settings["storage"]["mode"] == "local"
        assert updated_settings["storage"]["local_path"] == "data/test_complete"
        assert updated_settings["qr_code"]["auto_detect_ip"] is False
        assert updated_settings["qr_code"]["manual_ip"] == "192.168.1.200"
        assert updated_settings["qr_code"]["port"] == 8080
        assert updated_settings["timeouts"]["idle_to_scene_select_seconds"] == 3
        assert updated_settings["rendering"]["target_fps"] == 25
    
    @pytest.mark.asyncio
    async def test_settings_applied_without_restart(self, async_client: AsyncClient, auth_token: str):
        """
        Test that settings are applied immediately without restart.
        
        Validates: Requirements 7.5, 9.4
        """
        # Update settings
        await async_client.put(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"language": "zh", "timeouts": {"idle_to_scene_select_seconds": 7}}
        )
        
        # Immediately verify changes are reflected
        response = await async_client.get(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["language"] == "zh"
        assert data["timeouts"]["idle_to_scene_select_seconds"] == 7
