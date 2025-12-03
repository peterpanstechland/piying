"""
Pydantic models for session management
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
import time


class SessionStatus(str, Enum):
    """Session status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    CANCELLED = "cancelled"
    FAILED = "failed"


class PoseFrame(BaseModel):
    """Single frame of pose data with timestamp"""
    timestamp: float = Field(..., description="Timestamp in milliseconds relative to segment start")
    landmarks: List[List[float]] = Field(..., description="Pose landmarks as list of [x, y, z, visibility]")

    class Config:
        json_schema_extra = {
            "example": {
                "timestamp": 33.5,
                "landmarks": [[0.5, 0.3, -0.1, 0.99], [0.52, 0.28, -0.12, 0.98]]
            }
        }


class Segment(BaseModel):
    """Motion capture segment data"""
    index: int = Field(..., ge=0, description="Segment index (0-based)")
    duration: float = Field(..., gt=0, description="Duration in seconds")
    frames: List[PoseFrame] = Field(default_factory=list, description="Captured pose frames")
    video_path: Optional[str] = Field(default=None, description="Path to recorded canvas video file")

    class Config:
        json_schema_extra = {
            "example": {
                "index": 0,
                "duration": 8.0,
                "frames": [
                    {
                        "timestamp": 0.033,
                        "landmarks": [[0.5, 0.3, -0.1, 0.99]]
                    }
                ],
                "video_path": "session_videos/abc123/segment_0.webm"
            }
        }


class Session(BaseModel):
    """Complete session data"""
    id: str = Field(..., description="Unique session identifier (UUID)")
    scene_id: str = Field(..., description="Selected scene identifier")
    character_id: Optional[str] = Field(default=None, description="Selected character ID for motion capture")
    video_path: Optional[str] = Field(default=None, description="Resolved video path (character-specific or default)")
    status: SessionStatus = Field(default=SessionStatus.PENDING, description="Current session status")
    segments: List[Segment] = Field(default_factory=list, description="Recorded segments")
    output_path: Optional[str] = Field(default=None, description="Path to rendered video file")
    created_at: float = Field(default_factory=time.time, description="Creation timestamp (Unix time)")
    updated_at: float = Field(default_factory=time.time, description="Last update timestamp (Unix time)")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "scene_id": "sceneA",
                "status": "pending",
                "segments": [],
                "output_path": None,
                "created_at": 1700000000.0,
                "updated_at": 1700000000.0
            }
        }


class CreateSessionRequest(BaseModel):
    """Request body for creating a new session"""
    scene_id: str = Field(..., description="Scene identifier to use for this session")
    character_id: Optional[str] = Field(default=None, description="Selected character ID for motion capture")
    video_path: Optional[str] = Field(default=None, description="Resolved video path (character-specific or default)")

    class Config:
        json_schema_extra = {
            "example": {
                "scene_id": "sceneA",
                "character_id": "char-123",
                "video_path": "storylines/abc/videos/char-123.mp4"
            }
        }


class CreateSessionResponse(BaseModel):
    """Response for session creation"""
    session_id: str = Field(..., description="Created session ID")
    scene_id: str = Field(..., description="Scene ID")
    status: SessionStatus = Field(..., description="Initial session status")

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "scene_id": "sceneA",
                "status": "pending"
            }
        }


class SessionStatusResponse(BaseModel):
    """Response for session status query"""
    id: str = Field(..., description="Session ID")
    scene_id: str = Field(..., description="Scene ID")
    status: SessionStatus = Field(..., description="Current status")
    output_path: Optional[str] = Field(default=None, description="Video output path if available")
    segment_count: int = Field(..., description="Number of uploaded segments")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "scene_id": "sceneA",
                "status": "done",
                "output_path": "outputs/final_550e8400.mp4",
                "segment_count": 3
            }
        }


class UploadSegmentResponse(BaseModel):
    """Response for segment upload"""
    success: bool = Field(..., description="Whether upload was successful")
    message: Optional[str] = Field(default=None, description="Optional message")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Segment uploaded successfully"
            }
        }
