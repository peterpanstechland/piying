"""
Character models for admin panel.
Defines CharacterPart, SkeletonBinding, and Character models.
"""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, DateTime, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, Field

from ...database import Base


# Required parts for a valid character
REQUIRED_PARTS = [
    "head", "body", "left-arm", "right-arm", 
    "left-hand", "right-hand", "left-foot", "right-foot", "upper-leg"
]


# SQLAlchemy Models for Database Storage

class CharacterPartDB(Base):
    """SQLAlchemy model for character parts."""
    __tablename__ = "character_parts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    character_id: Mapped[str] = mapped_column(String(36), ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    pivot_x: Mapped[float] = mapped_column(Float, default=0.5)
    pivot_y: Mapped[float] = mapped_column(Float, default=0.5)
    z_index: Mapped[int] = mapped_column(Integer, default=0)
    connections: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of connected part names
    joints: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of joint points
    # Editor layout position (for preserving layout in editor)
    editor_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    editor_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    editor_width: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    editor_height: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Joint pivot point (rotation center for animation, different from assembly pivot)
    joint_pivot_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    joint_pivot_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Rotation offset (based on sprite drawing direction, in radians)
    rotation_offset: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Relationship back to character
    character: Mapped["CharacterDB"] = relationship("CharacterDB", back_populates="parts")


class SkeletonBindingDB(Base):
    """SQLAlchemy model for skeleton bindings."""
    __tablename__ = "skeleton_bindings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    character_id: Mapped[str] = mapped_column(String(36), ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    part_name: Mapped[str] = mapped_column(String(50), nullable=False)
    landmarks: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of landmark indices
    rotation_landmark: Mapped[int] = mapped_column(Integer, nullable=True)
    scale_landmarks: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of landmark indices
    
    # Relationship back to character
    character: Mapped["CharacterDB"] = relationship("CharacterDB", back_populates="bindings")


class CharacterDB(Base):
    """SQLAlchemy model for characters."""
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    parts: Mapped[List["CharacterPartDB"]] = relationship(
        "CharacterPartDB", 
        back_populates="character",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    bindings: Mapped[List["SkeletonBindingDB"]] = relationship(
        "SkeletonBindingDB",
        back_populates="character", 
        cascade="all, delete-orphan",
        lazy="selectin"
    )


# Pydantic Models for API Validation

class Joint(BaseModel):
    """Pydantic model for joint point data."""
    id: str = Field(..., description="Unique joint identifier")
    name: str = Field(..., description="Joint display name")
    x: float = Field(..., ge=0.0, le=1.0, description="X position (0-1 normalized)")
    y: float = Field(..., ge=0.0, le=1.0, description="Y position (0-1 normalized)")
    connectedTo: Optional[str] = Field(default=None, description="Connected joint key (partName:jointId)")


class CharacterPart(BaseModel):
    """Pydantic model for character part data."""
    name: str = Field(..., description="Part name (e.g., 'head', 'left-arm')")
    file_path: str = Field(..., description="Path to PNG file")
    pivot_x: float = Field(default=0.5, ge=0.0, le=1.0, description="Pivot point X (0-1 normalized)")
    pivot_y: float = Field(default=0.5, ge=0.0, le=1.0, description="Pivot point Y (0-1 normalized)")
    z_index: int = Field(default=0, description="Rendering order (higher = on top)")
    connections: List[str] = Field(default_factory=list, description="Connected part names")
    joints: List[Joint] = Field(default_factory=list, description="Joint points for this part")
    # Editor layout position (for preserving layout in editor)
    editor_x: Optional[float] = Field(default=None, description="Editor X position")
    editor_y: Optional[float] = Field(default=None, description="Editor Y position")
    editor_width: Optional[float] = Field(default=None, description="Editor display width")
    editor_height: Optional[float] = Field(default=None, description="Editor display height")
    # Joint pivot point (rotation center for animation, different from assembly pivot)
    joint_pivot_x: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Joint pivot X for rotation (0-1)")
    joint_pivot_y: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Joint pivot Y for rotation (0-1)")
    # Rotation offset (based on sprite drawing direction, in radians)
    rotation_offset: Optional[float] = Field(default=None, description="Rotation offset in radians")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "name": "head",
                "file_path": "characters/char1/head.png",
                "pivot_x": 0.5,
                "pivot_y": 0.9,
                "z_index": 10,
                "connections": ["body"],
                "joints": [],
                "joint_pivot_x": 0.5,
                "joint_pivot_y": 0.1,
                "rotation_offset": 1.5708
            }
        }


class SkeletonBinding(BaseModel):
    """Pydantic model for skeleton binding configuration."""
    part_name: str = Field(..., description="Character part name")
    landmarks: List[int] = Field(default_factory=list, description="MediaPipe landmark indices")
    rotation_landmark: Optional[int] = Field(default=None, description="Landmark for rotation calculation")
    scale_landmarks: List[int] = Field(default_factory=list, description="Landmarks for scale calculation")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "part_name": "left-arm",
                "landmarks": [11, 13, 15],
                "rotation_landmark": 13,
                "scale_landmarks": [11, 15]
            }
        }


class Character(BaseModel):
    """Pydantic model for complete character data."""
    id: str = Field(..., description="Unique character identifier (UUID)")
    name: str = Field(..., description="Display name")
    description: Optional[str] = Field(default=None, description="Character description")
    parts: List[CharacterPart] = Field(default_factory=list, description="Character parts")
    bindings: List[SkeletonBinding] = Field(default_factory=list, description="Skeleton bindings")
    thumbnail_path: Optional[str] = Field(default=None, description="Path to thumbnail image")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "Shadow Warrior",
                "description": "A traditional shadow puppet warrior",
                "parts": [],
                "bindings": [],
                "thumbnail_path": "characters/char1/thumbnail.png",
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00"
            }
        }


class CharacterCreate(BaseModel):
    """Schema for creating a new character."""
    name: str = Field(..., min_length=1, max_length=100, description="Character name")
    description: Optional[str] = Field(default=None, max_length=500, description="Character description")


class CharacterUpdate(BaseModel):
    """Schema for updating a character."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)


class CharacterResponse(BaseModel):
    """Schema for character response."""
    id: str
    name: str
    description: Optional[str] = None
    parts: List[CharacterPart] = []
    bindings: List[SkeletonBinding] = []
    thumbnail_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CharacterListResponse(BaseModel):
    """Schema for character list response."""
    id: str
    name: str
    description: Optional[str] = None
    thumbnail_path: Optional[str] = None
    part_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class PivotConfigUpdate(BaseModel):
    """Schema for updating pivot configuration."""
    parts: List[CharacterPart] = Field(..., description="Updated parts with pivot configurations")


class SkeletonBindingUpdate(BaseModel):
    """Schema for updating skeleton bindings."""
    bindings: List[SkeletonBinding] = Field(..., description="Updated skeleton bindings")


class CharacterPartUpload(BaseModel):
    """Schema for character part upload metadata."""
    name: str = Field(..., description="Part name")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "head"
            }
        }
