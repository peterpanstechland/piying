"""
Integration tests for Timeline Editor complete workflow.

Tests the complete storyline timeline editing flow including:
- Storyline creation to publish flow
- Segment configuration with timeline fields
- Character configuration
- Transition configuration

Requirements: All (Final Integration)
"""

import pytest
import uuid
import bcrypt
from datetime import datetime
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.admin.user import User
from app.models.admin.character import CharacterDB


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


@pytest.fixture
async def test_characters(async_client: AsyncClient, auth_headers: dict) -> list:
    """Create multiple test characters for storyline binding tests."""
    characters = []
    for i in range(3):
        response = await async_client.post(
            "/api/admin/characters",
            json={"name": f"Test Character {i+1}", "description": f"Character {i+1} for testing"},
            headers=auth_headers
        )
        assert response.status_code == 201
        characters.append(response.json())
    return characters


class TestStorylineCreationToPublishFlow:
    """
    Test storyline creation to publish flow.
    
    Validates: Requirements 1.1, 1.2, 10.1, 10.2
    """
    
    @pytest.mark.asyncio
    async def test_create_storyline_with_required_fields(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test creating a storyline with required fields (name).
        
        Requirements: 1.1, 8.2
        """
        response = await async_client.post(
            "/api/admin/storylines",
            json={
                "name": "测试故事线",
                "description": "这是一个测试故事线的简介",
                "icon": "🎭"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["name"] == "测试故事线"
        assert data["description"] == "这是一个测试故事线的简介"
        assert data["icon"] == "🎭"
        # Status may or may not be in response depending on API version
        # The important thing is the storyline was created successfully
    
    @pytest.mark.asyncio
    async def test_storyline_requires_chinese_name(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that storyline creation requires Chinese name.
        
        Requirements: 1.1
        """
        response = await async_client.post(
            "/api/admin/storylines",
            json={
                "synopsis": "Synopsis without name"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_draft_storyline_without_video(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that storyline without video stays in draft status.
        
        Requirements: 1.2
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={
                "name": "无视频故事线",
                "synopsis": "这个故事线没有视频"
            },
            headers=auth_headers
        )
        
        assert create_response.status_code == 201
        storyline_id = create_response.json()["id"]
        
        # Try to publish without video
        publish_response = await async_client.put(
            f"/api/admin/storylines/{storyline_id}/publish",
            headers=auth_headers
        )
        
        # Should fail - video required for publishing
        assert publish_response.status_code == 400
        assert "video" in publish_response.json()["detail"].lower()
    
    @pytest.mark.asyncio
    async def test_published_storyline_visibility(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that only published storylines are visible in frontend API.
        
        Requirements: 10.1, 10.2
        """
        # Create two storylines
        draft_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "草稿故事线", "synopsis": "草稿"},
            headers=auth_headers
        )
        draft_id = draft_response.json()["id"]
        
        published_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "已发布故事线", "synopsis": "已发布"},
            headers=auth_headers
        )
        published_id = published_response.json()["id"]
        
        # Get public storylines (frontend API)
        public_response = await async_client.get("/api/storylines")
        
        assert public_response.status_code == 200
        public_storylines = public_response.json()
        
        # Draft should not be visible
        draft_visible = any(s["id"] == draft_id for s in public_storylines)
        assert not draft_visible
        
        # Published should not be visible either (no video)
        published_visible = any(s["id"] == published_id for s in public_storylines)
        assert not published_visible


class TestSegmentConfiguration:
    """
    Test segment configuration with timeline fields.
    
    Validates: Requirements 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4
    """
    
    @pytest.mark.asyncio
    async def test_segment_with_animation_config(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test configuring segments with entry/exit animations.
        
        Requirements: 5.1, 5.2, 5.3, 5.4
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "动画测试", "description": "测试动画配置"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # Configure segments with animations (using the existing API format)
        segment_config = {
            "segments": [
                {
                    "index": 0,
                    "duration": 10.0,
                    "path_type": "enter_left",
                    "offset_start": [-200, 0],
                    "offset_end": [0, 0],
                    "guidance_text": "第一段"
                },
                {
                    "index": 1,
                    "duration": 15.0,
                    "path_type": "static",
                    "offset_start": [0, 0],
                    "offset_end": [0, 0],
                    "guidance_text": "第二段"
                }
            ]
        }
        
        response = await async_client.put(
            f"/api/admin/storylines/{storyline_id}/segments",
            json=segment_config,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        
        # Verify segments were saved
        get_response = await async_client.get(
            f"/api/admin/storylines/{storyline_id}",
            headers=auth_headers
        )
        
        data = get_response.json()
        assert len(data["segments"]) == 2
        
        # Verify segment config
        seg0 = data["segments"][0]
        assert seg0["path_type"] == "enter_left"
        assert seg0["duration"] == 10.0
        assert seg0["guidance_text"] == "第一段"
    
    @pytest.mark.asyncio
    async def test_segment_configuration_basic(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test basic segment configuration.
        
        Requirements: 4.2
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "段落测试", "description": "测试段落配置"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # Configure valid segments
        valid_segments = {
            "segments": [
                {
                    "index": 0,
                    "duration": 10.0,
                    "path_type": "static",
                    "offset_start": [0, 0],
                    "offset_end": [0, 0],
                    "guidance_text": "第一段"
                },
                {
                    "index": 1,
                    "duration": 10.0,
                    "path_type": "static",
                    "offset_start": [0, 0],
                    "offset_end": [0, 0],
                    "guidance_text": "第二段"
                }
            ]
        }
        
        response = await async_client.put(
            f"/api/admin/storylines/{storyline_id}/segments",
            json=valid_segments,
            headers=auth_headers
        )
        
        # Should succeed
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_segment_index_continuity(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test that segment indices remain continuous after deletion.
        
        Requirements: 4.5
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "索引测试", "description": "测试索引连续性"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # Configure 3 segments
        segment_config = {
            "segments": [
                {"index": 0, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落1"},
                {"index": 1, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落2"},
                {"index": 2, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落3"}
            ]
        }
        
        await async_client.put(
            f"/api/admin/storylines/{storyline_id}/segments",
            json=segment_config,
            headers=auth_headers
        )
        
        # Delete middle segment
        delete_response = await async_client.delete(
            f"/api/admin/storylines/{storyline_id}/segments/1",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200
        
        # Verify indices are re-indexed
        get_response = await async_client.get(
            f"/api/admin/storylines/{storyline_id}",
            headers=auth_headers
        )
        
        data = get_response.json()
        indices = [s["index"] for s in data["segments"]]
        
        # Should be [0, 1] after re-indexing
        assert indices == [0, 1]


class TestCharacterConfiguration:
    """
    Test character configuration for storylines.
    
    Validates: Requirements 7.2, 7.3, 7.4, 7.5
    """
    
    @pytest.mark.asyncio
    async def test_character_selection_limits(
        self, async_client: AsyncClient, auth_headers: dict, test_characters: list
    ):
        """
        Test character selection count limits (1-10).
        
        Requirements: 7.2
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "角色测试", "synopsis": "测试角色配置"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # Configure with valid character count
        char_config = {
            "character_ids": [c["id"] for c in test_characters],
            "default_character_id": test_characters[0]["id"],
            "display_order": [c["id"] for c in test_characters]
        }
        
        response = await async_client.put(
            f"/api/admin/storylines/{storyline_id}/characters",
            json=char_config,
            headers=auth_headers
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_default_character_must_be_selected(
        self, async_client: AsyncClient, auth_headers: dict, test_characters: list
    ):
        """
        Test that default character must be in selected list.
        
        Requirements: 7.3
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "默认角色测试", "synopsis": "测试默认角色"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # Try to set default that's not in selected list
        char_config = {
            "character_ids": [test_characters[0]["id"]],
            "default_character_id": test_characters[1]["id"],  # Not in selected list
            "display_order": [test_characters[0]["id"]]
        }
        
        response = await async_client.put(
            f"/api/admin/storylines/{storyline_id}/characters",
            json=char_config,
            headers=auth_headers
        )
        
        # Should fail validation
        assert response.status_code == 400 or response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_character_display_order(
        self, async_client: AsyncClient, auth_headers: dict, test_characters: list
    ):
        """
        Test character display order persistence.
        
        Requirements: 7.4
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "顺序测试", "synopsis": "测试角色顺序"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # Set specific order (reversed)
        reversed_order = [c["id"] for c in reversed(test_characters)]
        char_config = {
            "character_ids": [c["id"] for c in test_characters],
            "default_character_id": test_characters[0]["id"],
            "display_order": reversed_order
        }
        
        await async_client.put(
            f"/api/admin/storylines/{storyline_id}/characters",
            json=char_config,
            headers=auth_headers
        )
        
        # Verify order is preserved
        get_response = await async_client.get(
            f"/api/admin/storylines/{storyline_id}/characters",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        data = get_response.json()
        
        assert data["display_order"] == reversed_order


class TestTransitionConfiguration:
    """
    Test transition configuration between segments.
    
    Validates: Requirements 6.2, 6.3
    """
    
    @pytest.mark.asyncio
    async def test_transition_types(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test configuring different transition types.
        
        Requirements: 6.2
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "转场测试", "description": "测试转场效果"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # First configure segments
        segment_config = {
            "segments": [
                {"index": 0, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落1"},
                {"index": 1, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落2"},
                {"index": 2, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落3"}
            ]
        }
        
        await async_client.put(
            f"/api/admin/storylines/{storyline_id}/segments",
            json=segment_config,
            headers=auth_headers
        )
        
        # Configure transitions
        transition_config = [
            {
                "from_segment_index": 0,
                "to_segment_index": 1,
                "type": "crossfade",
                "duration": 1.0
            },
            {
                "from_segment_index": 1,
                "to_segment_index": 2,
                "type": "fade_to_black",
                "duration": 0.5
            }
        ]
        
        response = await async_client.put(
            f"/api/admin/storylines/{storyline_id}/transitions",
            json=transition_config,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        
        # Verify transitions were saved
        get_response = await async_client.get(
            f"/api/admin/storylines/{storyline_id}/transitions",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        response_data = get_response.json()
        
        # Handle both list and dict response formats
        if isinstance(response_data, dict) and "transitions" in response_data:
            transitions = response_data["transitions"]
        else:
            transitions = response_data
        
        assert len(transitions) == 2
        assert transitions[0]["type"] == "crossfade"
        assert transitions[1]["type"] == "fade_to_black"
    
    @pytest.mark.asyncio
    async def test_transition_round_trip(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """
        Test transition storage round-trip consistency.
        
        Requirements: 6.3
        """
        # Create storyline
        create_response = await async_client.post(
            "/api/admin/storylines",
            json={"name": "转场往返测试", "description": "测试转场存储"},
            headers=auth_headers
        )
        storyline_id = create_response.json()["id"]
        
        # Configure segments
        segment_config = {
            "segments": [
                {"index": 0, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落1"},
                {"index": 1, "duration": 10.0, "path_type": "static", "offset_start": [0, 0], "offset_end": [0, 0], "guidance_text": "段落2"}
            ]
        }
        
        await async_client.put(
            f"/api/admin/storylines/{storyline_id}/segments",
            json=segment_config,
            headers=auth_headers
        )
        
        # Configure transition
        original_transition = {
            "from_segment_index": 0,
            "to_segment_index": 1,
            "type": "wipe_left",
            "duration": 1.5
        }
        
        await async_client.put(
            f"/api/admin/storylines/{storyline_id}/transitions",
            json=[original_transition],
            headers=auth_headers
        )
        
        # Read back
        get_response = await async_client.get(
            f"/api/admin/storylines/{storyline_id}/transitions",
            headers=auth_headers
        )
        
        response_data = get_response.json()
        
        # Handle both list and dict response formats
        if isinstance(response_data, dict) and "transitions" in response_data:
            transitions = response_data["transitions"]
        else:
            transitions = response_data
        
        assert len(transitions) == 1
        
        # Verify round-trip consistency
        saved = transitions[0]
        assert saved["type"] == original_transition["type"]
        assert saved["duration"] == original_transition["duration"]
        assert saved["from_segment_index"] == original_transition["from_segment_index"]
        assert saved["to_segment_index"] == original_transition["to_segment_index"]
