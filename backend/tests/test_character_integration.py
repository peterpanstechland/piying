"""
Integration tests for Character flow.

Tests the complete character management flow including:
- Create character → upload parts → configure pivot → save
- Skeleton binding configuration flow

Requirements: 2.1, 2.2, 2.3, 3.5, 4.2, 4.3
"""

import pytest
import uuid
import bcrypt
import io
from datetime import datetime
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from PIL import Image

from app.main import app
from app.database import Base, get_db
from app.models.admin.user import User
from app.models.admin.character import REQUIRED_PARTS


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


def create_test_png(width: int = 256, height: int = 256, has_transparency: bool = True) -> bytes:
    """
    Create a test PNG image with optional transparency.
    
    Args:
        width: Image width in pixels
        height: Image height in pixels
        has_transparency: Whether to include transparent pixels
    
    Returns:
        PNG image as bytes
    """
    if has_transparency:
        # Create RGBA image with some transparent pixels
        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        # Draw a colored rectangle in the center (non-transparent)
        for x in range(width // 4, 3 * width // 4):
            for y in range(height // 4, 3 * height // 4):
                img.putpixel((x, y), (100, 100, 100, 255))
    else:
        # Create RGB image without alpha channel
        img = Image.new("RGB", (width, height), (100, 100, 100))
    
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.read()


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
            username="testadmin",
            password_hash=hash_password_bcrypt("adminpass123"),
            role="admin",
            created_at=datetime.utcnow(),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        return {
            "id": user.id,
            "username": "testadmin",
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
    """Get authentication token for API requests."""
    response = await async_client.post(
        "/api/admin/auth/login",
        json={"username": test_user["username"], "password": test_user["password"]}
    )
    assert response.status_code == 200
    return response.json()["token"]


@pytest.fixture
def auth_headers(auth_token: str) -> dict:
    """Get authorization headers for API requests."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestCharacterCreationFlow:
    """
    Test character creation integration flow.
    
    Validates: Requirements 2.1, 2.2, 2.3, 3.5
    - Create character → upload parts → configure pivot → save
    """
    
    @pytest.mark.asyncio
    async def test_complete_character_creation_flow(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test complete flow: create character → upload parts → configure pivot → save.
        
        Requirements: 2.1, 2.2, 2.3, 3.5
        """
        # Step 1: Create a new character
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Test Shadow Puppet", "description": "A test character"},
            headers=auth_headers
        )
        
        assert create_response.status_code == 201
        character_data = create_response.json()
        character_id = character_data["id"]
        
        # Verify character has unique ID (Requirement 2.2)
        assert character_id is not None
        assert len(character_id) == 36  # UUID format
        assert character_data["name"] == "Test Shadow Puppet"
        assert character_data["parts"] == []
        
        # Step 2: Upload character parts (Requirement 2.1)
        # Upload at least a few required parts
        parts_to_upload = ["head", "body", "left-arm"]
        
        for part_name in parts_to_upload:
            png_content = create_test_png(256, 256, has_transparency=True)
            
            files = {"file": (f"{part_name}.png", png_content, "image/png")}
            data = {"part_name": part_name}
            
            upload_response = await async_client.post(
                f"/api/admin/characters/{character_id}/parts",
                files=files,
                data=data,
                headers=auth_headers
            )
            
            assert upload_response.status_code == 201, f"Failed to upload {part_name}: {upload_response.text}"
            upload_data = upload_response.json()
            assert upload_data["part"]["name"] == part_name
        
        # Step 3: Verify character has uploaded parts (Requirement 2.3)
        get_response = await async_client.get(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        character_data = get_response.json()
        assert len(character_data["parts"]) == len(parts_to_upload)
        
        part_names = [p["name"] for p in character_data["parts"]]
        for expected_part in parts_to_upload:
            assert expected_part in part_names
        
        # Step 4: Configure pivot points (Requirement 3.5)
        pivot_config = {
            "parts": [
                {
                    "name": "head",
                    "file_path": f"characters/{character_id}/head.png",
                    "pivot_x": 0.5,
                    "pivot_y": 0.9,
                    "z_index": 10,
                    "connections": ["body"]
                },
                {
                    "name": "body",
                    "file_path": f"characters/{character_id}/body.png",
                    "pivot_x": 0.5,
                    "pivot_y": 0.3,
                    "z_index": 5,
                    "connections": ["head", "left-arm"]
                },
                {
                    "name": "left-arm",
                    "file_path": f"characters/{character_id}/left-arm.png",
                    "pivot_x": 0.8,
                    "pivot_y": 0.2,
                    "z_index": 3,
                    "connections": ["body"]
                }
            ]
        }
        
        pivot_response = await async_client.put(
            f"/api/admin/characters/{character_id}/pivot",
            json=pivot_config,
            headers=auth_headers
        )
        
        assert pivot_response.status_code == 200
        
        # Step 5: Verify pivot configuration was saved correctly (Requirement 3.5)
        verify_response = await async_client.get(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        assert verify_response.status_code == 200
        final_data = verify_response.json()
        
        # Verify pivot points were saved
        head_part = next((p for p in final_data["parts"] if p["name"] == "head"), None)
        assert head_part is not None
        assert head_part["pivot_x"] == 0.5
        assert head_part["pivot_y"] == 0.9
        assert head_part["z_index"] == 10
        assert "body" in head_part["connections"]
        
        body_part = next((p for p in final_data["parts"] if p["name"] == "body"), None)
        assert body_part is not None
        assert body_part["pivot_x"] == 0.5
        assert body_part["pivot_y"] == 0.3
        assert body_part["z_index"] == 5
    
    @pytest.mark.asyncio
    async def test_character_id_uniqueness(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that each character gets a unique ID.
        
        Validates: Requirement 2.2
        """
        character_ids = []
        
        # Create multiple characters
        for i in range(3):
            response = await async_client.post(
                "/api/admin/characters",
                json={"name": f"Character {i}", "description": f"Test character {i}"},
                headers=auth_headers
            )
            
            assert response.status_code == 201
            character_ids.append(response.json()["id"])
        
        # Verify all IDs are unique
        assert len(character_ids) == len(set(character_ids))
    
    @pytest.mark.asyncio
    async def test_character_list_with_thumbnails(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that character list displays all characters with preview thumbnails.
        
        Validates: Requirement 2.3
        """
        # Create a character
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Thumbnail Test Character"},
            headers=auth_headers
        )
        assert create_response.status_code == 201
        character_id = create_response.json()["id"]
        
        # Upload a part to trigger thumbnail generation
        png_content = create_test_png(256, 256, has_transparency=True)
        files = {"file": ("head.png", png_content, "image/png")}
        data = {"part_name": "head"}
        
        await async_client.post(
            f"/api/admin/characters/{character_id}/parts",
            files=files,
            data=data,
            headers=auth_headers
        )
        
        # List all characters
        list_response = await async_client.get(
            "/api/admin/characters",
            headers=auth_headers
        )
        
        assert list_response.status_code == 200
        characters = list_response.json()
        
        assert len(characters) >= 1
        
        # Find our character
        our_char = next((c for c in characters if c["id"] == character_id), None)
        assert our_char is not None
        assert our_char["name"] == "Thumbnail Test Character"
        assert our_char["part_count"] == 1
    
    @pytest.mark.asyncio
    async def test_png_validation_rejects_invalid_files(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that PNG validation rejects files without transparency or wrong resolution.
        
        Validates: Requirement 2.5
        """
        # Create a character
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Validation Test Character"},
            headers=auth_headers
        )
        assert create_response.status_code == 201
        character_id = create_response.json()["id"]
        
        # Test 1: Upload PNG without transparency (should fail)
        no_alpha_png = create_test_png(256, 256, has_transparency=False)
        files = {"file": ("head.png", no_alpha_png, "image/png")}
        data = {"part_name": "head"}
        
        response = await async_client.post(
            f"/api/admin/characters/{character_id}/parts",
            files=files,
            data=data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        assert "transparent" in response.json()["detail"].lower()
        
        # Test 2: Upload PNG with too small resolution (should fail)
        small_png = create_test_png(100, 100, has_transparency=True)
        files = {"file": ("head.png", small_png, "image/png")}
        
        response = await async_client.post(
            f"/api/admin/characters/{character_id}/parts",
            files=files,
            data=data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        assert "256" in response.json()["detail"]  # Should mention minimum resolution
    
    @pytest.mark.asyncio
    async def test_required_parts_validation(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that validation correctly identifies missing required parts.
        
        Validates: Requirement 2.1
        """
        # Create a character
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Parts Validation Test"},
            headers=auth_headers
        )
        assert create_response.status_code == 201
        character_id = create_response.json()["id"]
        
        # Upload only some parts
        parts_to_upload = ["head", "body"]
        for part_name in parts_to_upload:
            png_content = create_test_png(256, 256, has_transparency=True)
            files = {"file": (f"{part_name}.png", png_content, "image/png")}
            data = {"part_name": part_name}
            
            await async_client.post(
                f"/api/admin/characters/{character_id}/parts",
                files=files,
                data=data,
                headers=auth_headers
            )
        
        # Check validation endpoint
        validation_response = await async_client.get(
            f"/api/admin/characters/{character_id}/parts/validation",
            headers=auth_headers
        )
        
        assert validation_response.status_code == 200
        validation_data = validation_response.json()
        
        assert validation_data["is_valid"] is False
        assert len(validation_data["missing_parts"]) > 0
        
        # Verify missing parts are correct
        expected_missing = [p for p in REQUIRED_PARTS if p not in parts_to_upload]
        for missing in expected_missing:
            assert missing in validation_data["missing_parts"]
    
    @pytest.mark.asyncio
    async def test_pivot_configuration_round_trip(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that pivot configuration is correctly saved and retrieved.
        
        Validates: Requirement 3.5
        """
        # Create character and upload parts
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Pivot Round Trip Test"},
            headers=auth_headers
        )
        character_id = create_response.json()["id"]
        
        # Upload parts
        for part_name in ["head", "body"]:
            png_content = create_test_png(256, 256, has_transparency=True)
            files = {"file": (f"{part_name}.png", png_content, "image/png")}
            data = {"part_name": part_name}
            await async_client.post(
                f"/api/admin/characters/{character_id}/parts",
                files=files,
                data=data,
                headers=auth_headers
            )
        
        # Set specific pivot configuration
        original_config = {
            "parts": [
                {
                    "name": "head",
                    "file_path": f"characters/{character_id}/head.png",
                    "pivot_x": 0.35,
                    "pivot_y": 0.85,
                    "z_index": 15,
                    "connections": ["body"]
                },
                {
                    "name": "body",
                    "file_path": f"characters/{character_id}/body.png",
                    "pivot_x": 0.45,
                    "pivot_y": 0.25,
                    "z_index": 8,
                    "connections": ["head"]
                }
            ]
        }
        
        # Save configuration
        await async_client.put(
            f"/api/admin/characters/{character_id}/pivot",
            json=original_config,
            headers=auth_headers
        )
        
        # Retrieve and verify
        get_response = await async_client.get(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        retrieved_data = get_response.json()
        
        for original_part in original_config["parts"]:
            retrieved_part = next(
                (p for p in retrieved_data["parts"] if p["name"] == original_part["name"]),
                None
            )
            assert retrieved_part is not None
            assert retrieved_part["pivot_x"] == original_part["pivot_x"]
            assert retrieved_part["pivot_y"] == original_part["pivot_y"]
            assert retrieved_part["z_index"] == original_part["z_index"]
            assert retrieved_part["connections"] == original_part["connections"]



class TestSkeletonBindingFlow:
    """
    Test skeleton binding configuration flow.
    
    Validates: Requirements 4.2, 4.3
    - Skeleton binding configuration flow
    """
    
    @pytest.mark.asyncio
    async def test_complete_skeleton_binding_flow(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test complete skeleton binding configuration flow.
        
        Requirements: 4.2, 4.3
        """
        # Step 1: Create character and upload parts
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Binding Test Character"},
            headers=auth_headers
        )
        character_id = create_response.json()["id"]
        
        # Upload movable parts
        movable_parts = ["head", "body", "left-arm", "right-arm"]
        for part_name in movable_parts:
            png_content = create_test_png(256, 256, has_transparency=True)
            files = {"file": (f"{part_name}.png", png_content, "image/png")}
            data = {"part_name": part_name}
            await async_client.post(
                f"/api/admin/characters/{character_id}/parts",
                files=files,
                data=data,
                headers=auth_headers
            )
        
        # Step 2: Configure skeleton bindings (Requirement 4.2)
        binding_config = {
            "bindings": [
                {
                    "part_name": "head",
                    "landmarks": [0, 1, 2, 3, 4],  # Face landmarks
                    "rotation_landmark": 0,
                    "scale_landmarks": [1, 4]
                },
                {
                    "part_name": "left-arm",
                    "landmarks": [11, 13, 15],  # Left arm landmarks
                    "rotation_landmark": 13,
                    "scale_landmarks": [11, 15]
                },
                {
                    "part_name": "right-arm",
                    "landmarks": [12, 14, 16],  # Right arm landmarks
                    "rotation_landmark": 14,
                    "scale_landmarks": [12, 16]
                },
                {
                    "part_name": "body",
                    "landmarks": [11, 12, 23, 24],  # Torso landmarks
                    "rotation_landmark": 11,
                    "scale_landmarks": [11, 24]
                }
            ]
        }
        
        binding_response = await async_client.put(
            f"/api/admin/characters/{character_id}/binding",
            json=binding_config,
            headers=auth_headers
        )
        
        assert binding_response.status_code == 200
        
        # Step 3: Verify bindings were saved correctly (Requirement 4.2)
        get_response = await async_client.get(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        character_data = get_response.json()
        
        assert len(character_data["bindings"]) == len(binding_config["bindings"])
        
        # Verify each binding
        for original_binding in binding_config["bindings"]:
            saved_binding = next(
                (b for b in character_data["bindings"] if b["part_name"] == original_binding["part_name"]),
                None
            )
            assert saved_binding is not None, f"Binding for {original_binding['part_name']} not found"
            assert saved_binding["landmarks"] == original_binding["landmarks"]
            assert saved_binding["rotation_landmark"] == original_binding["rotation_landmark"]
            assert saved_binding["scale_landmarks"] == original_binding["scale_landmarks"]
    
    @pytest.mark.asyncio
    async def test_binding_completeness_validation(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that incomplete bindings generate warnings.
        
        Validates: Requirement 4.3
        """
        # Create character and upload parts
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Incomplete Binding Test"},
            headers=auth_headers
        )
        character_id = create_response.json()["id"]
        
        # Upload multiple movable parts
        parts = ["head", "body", "left-arm", "right-arm", "left-hand"]
        for part_name in parts:
            png_content = create_test_png(256, 256, has_transparency=True)
            files = {"file": (f"{part_name}.png", png_content, "image/png")}
            data = {"part_name": part_name}
            await async_client.post(
                f"/api/admin/characters/{character_id}/parts",
                files=files,
                data=data,
                headers=auth_headers
            )
        
        # Configure bindings for only some parts (incomplete)
        incomplete_binding = {
            "bindings": [
                {
                    "part_name": "head",
                    "landmarks": [0, 1, 2],
                    "rotation_landmark": 0,
                    "scale_landmarks": [1, 2]
                },
                {
                    "part_name": "body",
                    "landmarks": [11, 12, 23, 24],
                    "rotation_landmark": 11,
                    "scale_landmarks": [11, 24]
                }
                # Missing bindings for left-arm, right-arm, left-hand
            ]
        }
        
        binding_response = await async_client.put(
            f"/api/admin/characters/{character_id}/binding",
            json=incomplete_binding,
            headers=auth_headers
        )
        
        assert binding_response.status_code == 200
        response_data = binding_response.json()
        
        # Should have warnings about unbound parts
        assert "warnings" in response_data
        assert response_data["warnings"] is not None
        assert len(response_data["warnings"]) > 0
        
        # Verify validation endpoint also reports incomplete bindings
        validation_response = await async_client.get(
            f"/api/admin/characters/{character_id}/binding/validation",
            headers=auth_headers
        )
        
        assert validation_response.status_code == 200
        validation_data = validation_response.json()
        
        assert validation_data["is_complete"] is False
        assert len(validation_data["unbound_movable_parts"]) > 0
        
        # Check that unbound parts are correctly identified
        unbound = validation_data["unbound_movable_parts"]
        assert "left-arm" in unbound
        assert "right-arm" in unbound
        assert "left-hand" in unbound
    
    @pytest.mark.asyncio
    async def test_binding_storage_round_trip(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that skeleton bindings are correctly stored and retrieved.
        
        Validates: Requirement 4.2
        """
        # Create character and upload a part
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Binding Storage Test"},
            headers=auth_headers
        )
        character_id = create_response.json()["id"]
        
        png_content = create_test_png(256, 256, has_transparency=True)
        files = {"file": ("head.png", png_content, "image/png")}
        data = {"part_name": "head"}
        await async_client.post(
            f"/api/admin/characters/{character_id}/parts",
            files=files,
            data=data,
            headers=auth_headers
        )
        
        # Set specific binding configuration
        original_binding = {
            "bindings": [
                {
                    "part_name": "head",
                    "landmarks": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    "rotation_landmark": 5,
                    "scale_landmarks": [0, 10]
                }
            ]
        }
        
        # Save binding
        await async_client.put(
            f"/api/admin/characters/{character_id}/binding",
            json=original_binding,
            headers=auth_headers
        )
        
        # Retrieve and verify exact match
        get_response = await async_client.get(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        retrieved_data = get_response.json()
        assert len(retrieved_data["bindings"]) == 1
        
        retrieved_binding = retrieved_data["bindings"][0]
        original = original_binding["bindings"][0]
        
        assert retrieved_binding["part_name"] == original["part_name"]
        assert retrieved_binding["landmarks"] == original["landmarks"]
        assert retrieved_binding["rotation_landmark"] == original["rotation_landmark"]
        assert retrieved_binding["scale_landmarks"] == original["scale_landmarks"]
    
    @pytest.mark.asyncio
    async def test_binding_update_replaces_existing(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that updating bindings replaces existing bindings.
        
        Validates: Requirement 4.2
        """
        # Create character and upload parts
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Binding Update Test"},
            headers=auth_headers
        )
        character_id = create_response.json()["id"]
        
        for part_name in ["head", "body"]:
            png_content = create_test_png(256, 256, has_transparency=True)
            files = {"file": (f"{part_name}.png", png_content, "image/png")}
            data = {"part_name": part_name}
            await async_client.post(
                f"/api/admin/characters/{character_id}/parts",
                files=files,
                data=data,
                headers=auth_headers
            )
        
        # Set initial bindings
        initial_binding = {
            "bindings": [
                {
                    "part_name": "head",
                    "landmarks": [0, 1, 2],
                    "rotation_landmark": 0,
                    "scale_landmarks": [1, 2]
                }
            ]
        }
        
        await async_client.put(
            f"/api/admin/characters/{character_id}/binding",
            json=initial_binding,
            headers=auth_headers
        )
        
        # Update with new bindings
        updated_binding = {
            "bindings": [
                {
                    "part_name": "body",
                    "landmarks": [11, 12, 23, 24],
                    "rotation_landmark": 11,
                    "scale_landmarks": [11, 24]
                }
            ]
        }
        
        await async_client.put(
            f"/api/admin/characters/{character_id}/binding",
            json=updated_binding,
            headers=auth_headers
        )
        
        # Verify only new bindings exist (old ones replaced)
        get_response = await async_client.get(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        retrieved_data = get_response.json()
        assert len(retrieved_data["bindings"]) == 1
        assert retrieved_data["bindings"][0]["part_name"] == "body"
    
    @pytest.mark.asyncio
    async def test_binding_validation_for_nonexistent_part(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that binding to a non-existent part returns an error.
        
        Validates: Requirement 4.2
        """
        # Create character with only head part
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Invalid Binding Test"},
            headers=auth_headers
        )
        character_id = create_response.json()["id"]
        
        png_content = create_test_png(256, 256, has_transparency=True)
        files = {"file": ("head.png", png_content, "image/png")}
        data = {"part_name": "head"}
        await async_client.post(
            f"/api/admin/characters/{character_id}/parts",
            files=files,
            data=data,
            headers=auth_headers
        )
        
        # Try to bind to a part that doesn't exist
        invalid_binding = {
            "bindings": [
                {
                    "part_name": "nonexistent-part",
                    "landmarks": [0, 1, 2],
                    "rotation_landmark": 0,
                    "scale_landmarks": [1, 2]
                }
            ]
        }
        
        response = await async_client.put(
            f"/api/admin/characters/{character_id}/binding",
            json=invalid_binding,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        assert "not found" in response.json()["detail"].lower()


class TestCharacterDeletionConstraint:
    """
    Test character deletion constraints.
    
    Validates: Requirement 2.4
    """
    
    @pytest.mark.asyncio
    async def test_delete_unbound_character_succeeds(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that deleting a character not bound to any storyline succeeds.
        
        Validates: Requirement 2.4
        """
        # Create a character
        create_response = await async_client.post(
            "/api/admin/characters",
            json={"name": "Deletable Character"},
            headers=auth_headers
        )
        character_id = create_response.json()["id"]
        
        # Delete the character
        delete_response = await async_client.delete(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200
        
        # Verify character is deleted
        get_response = await async_client.get(
            f"/api/admin/characters/{character_id}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_delete_nonexistent_character_returns_404(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that deleting a non-existent character returns 404.
        """
        response = await async_client.delete(
            "/api/admin/characters/nonexistent-id",
            headers=auth_headers
        )
        
        assert response.status_code == 404
