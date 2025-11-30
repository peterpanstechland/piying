"""
Storyline models for admin panel.
Defines Segment and Storyline models for managing interactive scenarios.
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, DateTime, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, Field, field_validator

from ...database import Base


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
    
    # Relationship back to storyline
    storyline: Mapped["StorylineDB"] = relationship("StorylineDB", back_populates="segments")


class StorylineDB(Base):
    """SQLAlchemy model for storylines."""
    __tablename__ = "storylines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(10), default="📖")
    icon_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    base_video_path: Mapped[str] = mapped_column(String(255), nullable=False)
    video_duration: Mapped[float] = mapped_column(Float, default=0.0)
    character_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("characters.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    segments: Mapped[List["SegmentDB"]] = relationship(
        "SegmentDB",
        back_populates="storyline",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SegmentDB.index"
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
    icon: str = Field(default="📖", description="Emoji icon")
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
                "name": "武术表演",
                "name_en": "Martial Arts Performance",
                "description": "展示你的武术动作",
                "description_en": "Show your martial arts moves",
                "icon": "🥋",
                "icon_image": "assets/images/sceneA_icon.png",
                "base_video_path": "assets/scenes/sceneA_base.mp4",
                "video_duration": 30.0,
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
    icon: str = Field(default="📖", max_length=10, description="Emoji icon")
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
    icon: str = "📖"
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
    icon: str = "📖"
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
    message: str = "Video uploaded successfully"
