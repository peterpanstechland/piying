"""
Storyline models for admin panel.
Defines Segment and Storyline models for managing interactive scenarios.
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional, Tuple
from sqlalchemy import String, DateTime, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, Field, field_validator

from ...database import Base


# Enums for storyline status
class StorylineStatus(str, Enum):
    """Status of a storyline."""
    DRAFT = "draft"
    PUBLISHED = "published"


# Animation type enum (Requirements 5.1, 5.3)
class AnimationType(str, Enum):
    """Types of character entry/exit animations."""
    FADE_IN = "fade_in"
    FADE_OUT = "fade_out"
    SLIDE_LEFT = "slide_left"
    SLIDE_RIGHT = "slide_right"
    SLIDE_UP = "slide_up"
    SLIDE_DOWN = "slide_down"
    INSTANT = "instant"


# Valid path types for segments
VALID_PATH_TYPES = [
    "static",
    "enter_left", "enter_right", "enter_center",
    "exit_left", "exit_right", "exit_down",
    "walk_left", "walk_right"
]


# SQLAlchemy Models for Database Storage

class SegmentDB(Base):
    """SQLAlchemy model for storyline segments."""
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    storyline_id: Mapped[str] = mapped_column(String(36), ForeignKey("storylines.id", ondelete="CASCADE"), nullable=False)
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    duration: Mapped[float] = mapped_column(Float, nullable=False)
    path_type: Mapped[str] = mapped_column(String(50), default="static")
    offset_start_x: Mapped[int] = mapped_column(Integer, default=0)
    offset_start_y: Mapped[int] = mapped_column(Integer, default=0)
    offset_end_x: Mapped[int] = mapped_column(Integer, default=0)
    offset_end_y: Mapped[int] = mapped_column(Integer, default=0)
    guidance_text: Mapped[str] = mapped_column(Text, default="")
    guidance_text_en: Mapped[str] = mapped_column(Text, default="")
    guidance_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Timeline fields (Requirements 5.1, 5.2, 5.3, 5.4)
    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Entry animation configuration
    entry_type: Mapped[str] = mapped_column(String(20), default=AnimationType.INSTANT.value)
    entry_duration: Mapped[float] = mapped_column(Float, default=1.0)
    entry_delay: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Exit animation configuration
    exit_type: Mapped[str] = mapped_column(String(20), default=AnimationType.INSTANT.value)
    exit_duration: Mapped[float] = mapped_column(Float, default=1.0)
    exit_delay: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Relationship back to storyline
    storyline: Mapped["StorylineDB"] = relationship("StorylineDB", back_populates="segments")


# Transition type enum
class TransitionType(str, Enum):
    """Types of transitions between segments."""
    CUT = "cut"
    CROSSFADE = "crossfade"
    FADE_TO_BLACK = "fade_to_black"
    WIPE_LEFT = "wipe_left"
    WIPE_RIGHT = "wipe_right"


class TransitionDB(Base):
    """SQLAlchemy model for transitions between segments (Requirements 6.2, 6.3)."""
    __tablename__ = "transitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    storyline_id: Mapped[str] = mapped_column(String(36), ForeignKey("storylines.id", ondelete="CASCADE"), nullable=False)
    from_segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    to_segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(20), default=TransitionType.CUT.value)
    duration: Mapped[float] = mapped_column(Float, default=0.5)
    
    # Relationship back to storyline
    storyline: Mapped["StorylineDB"] = relationship("StorylineDB", back_populates="transitions")


class StorylineCharacterDB(Base):
    """SQLAlchemy model for storyline-character associations (Requirements 7.2, 7.3, 7.4)."""
    __tablename__ = "storyline_characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    storyline_id: Mapped[str] = mapped_column(String(36), ForeignKey("storylines.id", ondelete="CASCADE"), nullable=False)
    character_id: Mapped[str] = mapped_column(String(36), ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    is_default: Mapped[bool] = mapped_column(Integer, default=False)  # SQLite doesn't have native bool
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    
    # Relationships
    storyline: Mapped["StorylineDB"] = relationship("StorylineDB", back_populates="storyline_characters")


class StorylineDB(Base):
    """SQLAlchemy model for storylines."""
    __tablename__ = "storylines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(10), default="⛏️")
    icon_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    base_video_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    video_duration: Mapped[float] = mapped_column(Float, default=0.0)
    character_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("characters.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # New fields for timeline editor (Requirements 1.1, 1.2, 9.3)
    synopsis: Mapped[str] = mapped_column(Text, default="")
    synopsis_en: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default=StorylineStatus.DRAFT.value)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    
    # Video resolution fields
    video_width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    video_height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Cover image paths (multiple sizes)
    cover_original: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cover_thumbnail: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cover_medium: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cover_large: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Relationships
    segments: Mapped[List["SegmentDB"]] = relationship(
        "SegmentDB",
        back_populates="storyline",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SegmentDB.index"
    )
    
    # Relationship to transitions
    transitions: Mapped[List["TransitionDB"]] = relationship(
        "TransitionDB",
        back_populates="storyline",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    
    # Relationship to storyline characters
    storyline_characters: Mapped[List["StorylineCharacterDB"]] = relationship(
        "StorylineCharacterDB",
        back_populates="storyline",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StorylineCharacterDB.display_order"
    )


# Pydantic Models for API Validation

class Segment(BaseModel):
    """Pydantic model for storyline segment data."""
    index: int = Field(..., ge=0, description="Segment order (0-based)")
    duration: float = Field(..., gt=0, description="Duration in seconds")
    path_type: str = Field(default="static", description="Movement type")
    offset_start: List[int] = Field(default_factory=lambda: [0, 0], description="Starting position offset [x, y]")
    offset_end: List[int] = Field(default_factory=lambda: [0, 0], description="Ending position offset [x, y]")
    guidance_text: str = Field(default="", description="Chinese guidance text")
    guidance_text_en: str = Field(default="", description="English guidance text")
    guidance_image: Optional[str] = Field(default=None, description="Path to guidance image")

    @field_validator('path_type')
    @classmethod
    def validate_path_type(cls, v: str) -> str:
        if v not in VALID_PATH_TYPES:
            raise ValueError(f"Invalid path_type. Must be one of: {VALID_PATH_TYPES}")
        return v

    @field_validator('offset_start', 'offset_end')
    @classmethod
    def validate_offset(cls, v: List[int]) -> List[int]:
        if len(v) != 2:
            raise ValueError("Offset must be a list of exactly 2 integers [x, y]")
        return v

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "index": 0,
                "duration": 10.0,
                "path_type": "enter_left",
                "offset_start": [-200, 0],
                "offset_end": [0, 0],
                "guidance_text": "摆出武术起势",
                "guidance_text_en": "Strike a martial arts opening stance",
                "guidance_image": "assets/images/segment1_guide.png"
            }
        }


class Storyline(BaseModel):
    """Pydantic model for complete storyline data."""
    id: str = Field(..., description="Unique storyline identifier (UUID)")
    name: str = Field(..., description="Display name (Chinese)")
    name_en: str = Field(default="", description="Display name (English)")
    description: str = Field(default="", description="Chinese description")
    description_en: str = Field(default="", description="English description")
    icon: str = Field(default="⛏️", description="Emoji icon")
    icon_image: Optional[str] = Field(default=None, description="Icon image path")
    base_video_path: str = Field(..., description="Background video path")
    video_duration: float = Field(default=0.0, ge=0, description="Video duration in seconds")
    character_id: Optional[str] = Field(default=None, description="Bound character ID")
    segments: List[Segment] = Field(default_factory=list, description="Recording segments")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440001",
                "name": "时间迷途",
                "name_en": "Lost in Time",
                "description": "故事从嫦娥在古代月宫中独舞展开，一道来自未来的蓝色光裂缝突然出现，古典月光与现代科技在幕布上交错。嫦娥穿越裂缝来到千年后的月球，与执行中国探月任务的宇航员相遇。全片通过实体皮影、可移动背景板与光影切换，实现从古至今、从月宫到月面的时空转换，呈现神话与科技跨越千年的浪漫邂逅。",
                "description_en": "The story begins with Chang’e dancing alone in the ancient Moon Palace. A blue crack of light from the future appears, blending classical moonlit shadows with modern technology. Chang’e crosses through the rift and arrives on the moon thousands of years later, where she encounters a Chinese astronaut from the lunar exploration program. Using physical shadow puppets, movable background plates, and practical lighting transitions, the performance brings to life a cross-era journey from myth to modern space exploration.",
                "icon": "🌕",
                "icon_image": "assets/images/sceneA_icon.png",
                "base_video_path": "assets/scenes/sceneA_base.mp4",
                "video_duration": 54.0,
                "character_id": "550e8400-e29b-41d4-a716-446655440000",
                "segments": [],
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00"
            }
        }


class StorylineCreate(BaseModel):
    """Schema for creating a new storyline."""
    name: str = Field(..., min_length=1, max_length=100, description="Storyline name (Chinese)")
    name_en: str = Field(default="", max_length=100, description="Storyline name (English)")
    description: str = Field(default="", max_length=500, description="Description (Chinese)")
    description_en: str = Field(default="", max_length=500, description="Description (English)")
    icon: str = Field(default="⛏️", max_length=10, description="Emoji icon")
    character_id: Optional[str] = Field(default=None, description="Character to bind")


class StorylineUpdate(BaseModel):
    """Schema for updating a storyline."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    name_en: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    description_en: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=10)
    character_id: Optional[str] = Field(default=None)


class StorylineResponse(BaseModel):
    """Schema for storyline response."""
    id: str
    name: str
    name_en: str = ""
    description: str = ""
    description_en: str = ""
    icon: str = "⛏️"
    icon_image: Optional[str] = None
    base_video_path: str
    video_duration: float = 0.0
    character_id: Optional[str] = None
    segments: List[Segment] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StorylineListResponse(BaseModel):
    """Schema for storyline list response."""
    id: str
    name: str
    name_en: str = ""
    description: str = ""
    icon: str = "⛏️"
    icon_image: Optional[str] = None
    video_duration: float = 0.0
    character_id: Optional[str] = None
    segment_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class SegmentConfigUpdate(BaseModel):
    """Schema for updating segment configuration."""
    segments: List[Segment] = Field(..., min_length=2, max_length=4, description="Segment configurations (2-4 segments)")

    @field_validator('segments')
    @classmethod
    def validate_segment_indices(cls, v: List[Segment]) -> List[Segment]:
        """Ensure segments have sequential indices starting from 0."""
        expected_indices = list(range(len(v)))
        actual_indices = [s.index for s in v]
        if sorted(actual_indices) != expected_indices:
            raise ValueError(f"Segment indices must be sequential starting from 0. Expected {expected_indices}, got {actual_indices}")
        return sorted(v, key=lambda s: s.index)


class VideoUploadResponse(BaseModel):
    """Schema for video upload response."""
    video_path: str
    video_duration: float
    video_width: Optional[int] = None
    video_height: Optional[int] = None
    message: str = "Video uploaded successfully"


class FrameExtractionResponse(BaseModel):
    """Schema for frame extraction response (Requirements 9.2, 12.2)."""
    frame_data: str  # Base64 encoded JPEG image
    timestamp: float  # Actual timestamp extracted
    format: str = "jpeg"
    message: str = "Frame extracted successfully"


# New Pydantic models for Timeline Editor (Requirements 1.1, 5.1, 6.2, 7.2)

class AnimationConfig(BaseModel):
    """Configuration for character entry/exit animations (Requirements 5.1, 5.2, 5.3, 5.4)."""
    type: AnimationType = Field(default=AnimationType.INSTANT, description="Animation type")
    duration: float = Field(default=1.0, ge=0.5, le=5.0, description="Animation duration in seconds")
    delay: float = Field(default=0.0, ge=0.0, description="Delay before animation starts")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "type": "fade_in",
                "duration": 1.5,
                "delay": 0.5
            }
        }


class Transition(BaseModel):
    """Pydantic model for transition between segments (Requirements 6.2, 6.3)."""
    id: str = Field(..., description="Unique transition identifier")
    from_segment_index: int = Field(..., ge=0, description="Source segment index")
    to_segment_index: int = Field(..., ge=0, description="Target segment index")
    type: TransitionType = Field(default=TransitionType.CUT, description="Transition type")
    duration: float = Field(default=0.5, ge=0.1, le=3.0, description="Transition duration in seconds")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440002",
                "from_segment_index": 0,
                "to_segment_index": 1,
                "type": "crossfade",
                "duration": 0.5
            }
        }


class StorylineCharacterConfig(BaseModel):
    """Configuration for characters available in a storyline (Requirements 7.2, 7.3, 7.4)."""
    character_ids: List[str] = Field(..., min_length=1, max_length=10, description="List of available character IDs")
    default_character_id: str = Field(..., description="Default character ID")
    display_order: List[str] = Field(default_factory=list, description="Ordered list of character IDs for display")

    @field_validator('default_character_id')
    @classmethod
    def validate_default_in_list(cls, v: str, info) -> str:
        """Ensure default character is in the character list."""
        character_ids = info.data.get('character_ids', [])
        if character_ids and v not in character_ids:
            raise ValueError(f"Default character '{v}' must be in the character_ids list")
        return v

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "character_ids": ["char-1", "char-2", "char-3"],
                "default_character_id": "char-1",
                "display_order": ["char-1", "char-2", "char-3"]
            }
        }


class CoverImage(BaseModel):
    """Cover image paths for different sizes (Requirements 9.3)."""
    original_path: Optional[str] = Field(default=None, description="Original image path")
    thumbnail_path: Optional[str] = Field(default=None, description="Thumbnail (200x150) path")
    medium_path: Optional[str] = Field(default=None, description="Medium (400x300) path")
    large_path: Optional[str] = Field(default=None, description="Large (800x600) path")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "original_path": "data/storylines/abc123/cover_original.jpg",
                "thumbnail_path": "data/storylines/abc123/cover_thumbnail.jpg",
                "medium_path": "data/storylines/abc123/cover_medium.jpg",
                "large_path": "data/storylines/abc123/cover_large.jpg"
            }
        }


class TimelineSegment(BaseModel):
    """Extended segment model for timeline editor (Requirements 4.1, 5.1)."""
    id: Optional[str] = Field(default=None, description="Segment identifier")
    index: int = Field(..., ge=0, description="Segment order (0-based)")
    start_time: float = Field(default=0.0, ge=0, description="Start time in seconds")
    duration: float = Field(default=10.0, gt=0, description="Duration in seconds")
    path_type: str = Field(default="static", description="Movement type")
    offset_start: List[int] = Field(default_factory=lambda: [0, 0], description="Starting position offset [x, y]")
    offset_end: List[int] = Field(default_factory=lambda: [0, 0], description="Ending position offset [x, y]")
    entry_animation: AnimationConfig = Field(default_factory=AnimationConfig, description="Entry animation config")
    exit_animation: AnimationConfig = Field(default_factory=AnimationConfig, description="Exit animation config")
    guidance_text: str = Field(default="", description="Chinese guidance text")
    guidance_text_en: str = Field(default="", description="English guidance text")
    guidance_image: Optional[str] = Field(default=None, description="Path to guidance image")

    @field_validator('path_type')
    @classmethod
    def validate_path_type(cls, v: str) -> str:
        if v not in VALID_PATH_TYPES:
            raise ValueError(f"Invalid path_type. Must be one of: {VALID_PATH_TYPES}")
        return v

    @field_validator('offset_start', 'offset_end')
    @classmethod
    def validate_offset(cls, v: List[int]) -> List[int]:
        if len(v) != 2:
            raise ValueError("Offset must be a list of exactly 2 integers [x, y]")
        return v

    class Config:
        from_attributes = True


class StorylineExtended(BaseModel):
    """Extended storyline model with all timeline editor fields (Requirements 1.1, 1.2)."""
    id: str = Field(..., description="Unique storyline identifier (UUID)")
    name: str = Field(..., min_length=1, description="Display name (Chinese)")
    name_en: str = Field(default="", description="Display name (English)")
    synopsis: str = Field(default="", max_length=500, description="Story synopsis (Chinese)")
    synopsis_en: str = Field(default="", max_length=1000, description="Story synopsis (English)")
    description: str = Field(default="", description="Short description (Chinese)")
    description_en: str = Field(default="", description="Short description (English)")
    icon: str = Field(default="⛏️", description="Emoji icon")
    icon_image: Optional[str] = Field(default=None, description="Icon image path")
    status: StorylineStatus = Field(default=StorylineStatus.DRAFT, description="Publication status")
    display_order: int = Field(default=0, ge=0, description="Display order in list")
    
    # Video fields
    base_video_path: Optional[str] = Field(default=None, description="Background video path")
    video_duration: float = Field(default=0.0, ge=0, description="Video duration in seconds")
    video_resolution: Optional[Tuple[int, int]] = Field(default=None, description="Video resolution (width, height)")
    
    # Cover image
    cover_image: Optional[CoverImage] = Field(default=None, description="Cover image paths")
    
    # Timeline data
    segments: List[TimelineSegment] = Field(default_factory=list, description="Timeline segments")
    transitions: List[Transition] = Field(default_factory=list, description="Transitions between segments")
    
    # Character configuration
    character_config: Optional[StorylineCharacterConfig] = Field(default=None, description="Available characters")
    
    # Legacy field for backward compatibility
    character_id: Optional[str] = Field(default=None, description="Bound character ID (legacy)")
    
    # Timestamps
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440001",
                "name": "时间迷途",
                "name_en": "Martial Arts Performance",
                "synopsis": "这是一个关于武术的故事...",
                "synopsis_en": "This is a story about martial arts...",
                "description": "展示你的武术动作",
                "description_en": "Show your martial arts moves",
                "icon": "🌕",
                "status": "draft",
                "display_order": 0,
                "base_video_path": "assets/scenes/sceneA_base.mp4",
                "video_duration": 30.0,
                "video_resolution": [1920, 1080],
                "segments": [],
                "transitions": [],
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00"
            }
        }


class StorylineExtendedCreate(BaseModel):
    """Schema for creating a new storyline with extended fields."""
    name: str = Field(..., min_length=1, max_length=100, description="Storyline name (Chinese)")
    name_en: str = Field(default="", max_length=100, description="Storyline name (English)")
    synopsis: str = Field(default="", max_length=500, description="Synopsis (Chinese)")
    synopsis_en: str = Field(default="", max_length=1000, description="Synopsis (English)")
    description: str = Field(default="", max_length=500, description="Description (Chinese)")
    description_en: str = Field(default="", max_length=500, description="Description (English)")
    icon: str = Field(default="⛏️", max_length=10, description="Emoji icon")

    @field_validator('name')
    @classmethod
    def validate_name_not_whitespace(cls, v: str) -> str:
        """Ensure name is not empty or whitespace-only (Requirements 1.1, 8.2)."""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty or whitespace-only")
        return v


class StorylineExtendedUpdate(BaseModel):
    """Schema for updating a storyline with extended fields."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    name_en: Optional[str] = Field(default=None, max_length=100)
    synopsis: Optional[str] = Field(default=None, max_length=500)
    synopsis_en: Optional[str] = Field(default=None, max_length=1000)
    description: Optional[str] = Field(default=None, max_length=500)
    description_en: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=10)
    display_order: Optional[int] = Field(default=None, ge=0)


class StorylineExtendedListResponse(BaseModel):
    """Schema for extended storyline list response."""
    id: str
    name: str
    name_en: str = ""
    synopsis: str = ""
    description: str = ""
    icon: str = "⛏️"
    icon_image: Optional[str] = None
    status: StorylineStatus = StorylineStatus.DRAFT
    display_order: int = 0
    video_duration: float = 0.0
    cover_image: Optional[CoverImage] = None
    segment_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True
