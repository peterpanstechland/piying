"""
Storyline service for admin panel.
Handles storyline CRUD operations, video validation, and segment management.
"""
import os
import uuid
import shutil
from datetime import datetime
from typing import List, Optional, Tuple

import cv2
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models.admin.storyline import (
    StorylineDB,
    SegmentDB,
    StorylineCreate,
    StorylineUpdate,
    Segment,
    StorylineResponse,
    StorylineListResponse,
    VALID_PATH_TYPES,
)
from ...models.admin.character import CharacterDB


# Storyline assets directory
STORYLINES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "data", "storylines"
)

# Supported video formats
SUPPORTED_VIDEO_FORMATS = [".mp4"]
SUPPORTED_VIDEO_CODECS = ["h264", "avc1"]


class StorylineService:
    """Service for handling storyline operations."""

    def __init__(self):
        """Initialize the storyline service."""
        # Ensure storylines directory exists
        os.makedirs(STORYLINES_DIR, exist_ok=True)

    @staticmethod
    def validate_video_file(file_path: str) -> Tuple[bool, str, float]:
        """
        Validate a video file for format (MP4, H.264) and extract duration.
        
        Args:
            file_path: Path to the video file
            
        Returns:
            Tuple of (is_valid, error_message, duration_seconds)
        """
        try:
            # Check file extension
            _, ext = os.path.splitext(file_path)
            if ext.lower() not in SUPPORTED_VIDEO_FORMATS:
                return False, f"Video must be MP4 format (got {ext})", 0.0
            
            # Open video with OpenCV
            cap = cv2.VideoCapture(file_path)
            if not cap.isOpened():
                return False, "Failed to open video file", 0.0
            
            try:
                # Get video properties
                fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
                fourcc_str = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)]).lower()
                
                # Check codec (H.264 can be reported as 'avc1' or 'h264')
                is_h264 = any(codec in fourcc_str for codec in SUPPORTED_VIDEO_CODECS)
                
                # Some systems report different fourcc codes, so we'll be lenient
                # and just check if the video is readable
                if not is_h264:
                    # Try to read a frame to verify the video is valid
                    ret, _ = cap.read()
                    if not ret:
                        return False, f"Video codec not supported. Expected H.264, got {fourcc_str}", 0.0
                
                # Get duration
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                
                if fps <= 0 or frame_count <= 0:
                    return False, "Could not determine video duration", 0.0
                
                duration = frame_count / fps
                
                return True, "", duration
                
            finally:
                cap.release()
                
        except Exception as e:
            return False, f"Error validating video: {str(e)}", 0.0

    @staticmethod
    def extract_video_duration(file_path: str) -> float:
        """
        Extract video duration using OpenCV.
        
        Args:
            file_path: Path to the video file
            
        Returns:
            Duration in seconds, or 0.0 if extraction fails
        """
        try:
            cap = cv2.VideoCapture(file_path)
            if not cap.isOpened():
                return 0.0
            
            try:
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                
                if fps <= 0 or frame_count <= 0:
                    return 0.0
                
                return frame_count / fps
            finally:
                cap.release()
        except Exception:
            return 0.0

    @staticmethod
    def validate_segment_duration(
        segments: List[Segment], video_duration: float
    ) -> Tuple[bool, str]:
        """
        Validate that total segment duration does not exceed video duration.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not segments:
            return True, ""
        
        total_duration = sum(s.duration for s in segments)
        
        if total_duration > video_duration:
            return False, (
                f"Total segment duration ({total_duration:.1f}s) exceeds "
                f"video duration ({video_duration:.1f}s)"
            )
        
        return True, ""

    def get_storyline_dir(self, storyline_id: str) -> str:
        """Get the directory path for a storyline's assets."""
        return os.path.join(STORYLINES_DIR, storyline_id)

    async def create_storyline(
        self, db: AsyncSession, storyline_data: StorylineCreate
    ) -> StorylineDB:
        """Create a new storyline."""
        storyline_id = str(uuid.uuid4())
        
        # Create storyline directory
        storyline_dir = self.get_storyline_dir(storyline_id)
        os.makedirs(storyline_dir, exist_ok=True)
        
        storyline = StorylineDB(
            id=storyline_id,
            name=storyline_data.name,
            name_en=storyline_data.name_en,
            description=storyline_data.description,
            description_en=storyline_data.description_en,
            icon=storyline_data.icon,
            base_video_path="",  # Will be set when video is uploaded
            video_duration=0.0,
            character_id=storyline_data.character_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(storyline)
        await db.commit()
        await db.refresh(storyline)
        return storyline

    async def get_storyline_by_id(
        self, db: AsyncSession, storyline_id: str
    ) -> Optional[StorylineDB]:
        """Get a storyline by ID with all related data."""
        result = await db.execute(
            select(StorylineDB)
            .where(StorylineDB.id == storyline_id)
            .options(selectinload(StorylineDB.segments))
        )
        return result.scalar_one_or_none()

    async def get_all_storylines(self, db: AsyncSession) -> List[StorylineDB]:
        """Get all storylines with their segments."""
        result = await db.execute(
            select(StorylineDB)
            .options(selectinload(StorylineDB.segments))
            .order_by(StorylineDB.created_at.desc())
        )
        return list(result.scalars().all())

    async def update_storyline(
        self, db: AsyncSession, storyline_id: str, update_data: StorylineUpdate
    ) -> Optional[StorylineDB]:
        """Update a storyline's basic info."""
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None
        
        if update_data.name is not None:
            storyline.name = update_data.name
        if update_data.name_en is not None:
            storyline.name_en = update_data.name_en
        if update_data.description is not None:
            storyline.description = update_data.description
        if update_data.description_en is not None:
            storyline.description_en = update_data.description_en
        if update_data.icon is not None:
            storyline.icon = update_data.icon
        if update_data.character_id is not None:
            storyline.character_id = update_data.character_id
        
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(storyline)
        return storyline

    async def delete_storyline(
        self, db: AsyncSession, storyline_id: str
    ) -> Tuple[bool, str]:
        """
        Delete a storyline and its associated files.
        
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Delete storyline directory and files
        storyline_dir = self.get_storyline_dir(storyline_id)
        if os.path.exists(storyline_dir):
            shutil.rmtree(storyline_dir)
        
        # Delete from database (cascade will delete segments)
        await db.delete(storyline)
        await db.commit()
        return True, ""


    async def upload_video(
        self,
        db: AsyncSession,
        storyline_id: str,
        file_content: bytes,
        filename: str,
    ) -> Tuple[Optional[str], float, str]:
        """
        Upload and validate a background video for a storyline.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            file_content: Video file content
            filename: Original filename
            
        Returns:
            Tuple of (video_path, duration, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None, 0.0, "Storyline not found"
        
        # Save file temporarily for validation
        storyline_dir = self.get_storyline_dir(storyline_id)
        os.makedirs(storyline_dir, exist_ok=True)
        
        # Use a consistent filename
        video_filename = "base_video.mp4"
        video_path = os.path.join(storyline_dir, video_filename)
        relative_path = f"storylines/{storyline_id}/{video_filename}"
        
        # Write file
        with open(video_path, "wb") as f:
            f.write(file_content)
        
        # Validate video
        is_valid, error, duration = self.validate_video_file(video_path)
        if not is_valid:
            # Remove invalid file
            os.remove(video_path)
            return None, 0.0, error
        
        # Update storyline
        storyline.base_video_path = relative_path
        storyline.video_duration = duration
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return relative_path, duration, ""

    async def update_segments(
        self,
        db: AsyncSession,
        storyline_id: str,
        segments: List[Segment],
    ) -> Tuple[bool, str]:
        """
        Update segment configuration for a storyline.
        
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Validate segment count (2-4)
        if len(segments) < 2 or len(segments) > 4:
            return False, "Storyline must have 2-4 segments"
        
        # Validate segment duration against video duration
        if storyline.video_duration > 0:
            is_valid, error = self.validate_segment_duration(
                segments, storyline.video_duration
            )
            if not is_valid:
                return False, error
        
        # Delete existing segments
        await db.execute(
            delete(SegmentDB).where(SegmentDB.storyline_id == storyline_id)
        )
        
        # Add new segments
        for segment_data in segments:
            segment = SegmentDB(
                storyline_id=storyline_id,
                index=segment_data.index,
                duration=segment_data.duration,
                path_type=segment_data.path_type,
                offset_start_x=segment_data.offset_start[0],
                offset_start_y=segment_data.offset_start[1],
                offset_end_x=segment_data.offset_end[0],
                offset_end_y=segment_data.offset_end[1],
                guidance_text=segment_data.guidance_text,
                guidance_text_en=segment_data.guidance_text_en,
                guidance_image=segment_data.guidance_image,
            )
            db.add(segment)
        
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        return True, ""

    async def bind_character(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: Optional[str],
    ) -> Tuple[bool, str]:
        """
        Bind a character to a storyline.
        
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Verify character exists if provided
        if character_id is not None:
            result = await db.execute(
                select(CharacterDB).where(CharacterDB.id == character_id)
            )
            character = result.scalar_one_or_none()
            if character is None:
                return False, "Character not found"
        
        storyline.character_id = character_id
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        return True, ""

    async def upload_icon_image(
        self,
        db: AsyncSession,
        storyline_id: str,
        file_content: bytes,
        filename: str,
    ) -> Tuple[Optional[str], str]:
        """
        Upload an icon image for a storyline.
        
        Returns:
            Tuple of (icon_path, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None, "Storyline not found"
        
        # Save icon image
        storyline_dir = self.get_storyline_dir(storyline_id)
        os.makedirs(storyline_dir, exist_ok=True)
        
        # Get file extension
        _, ext = os.path.splitext(filename)
        if ext.lower() not in [".png", ".jpg", ".jpeg", ".gif"]:
            return None, "Icon must be PNG, JPG, or GIF format"
        
        icon_filename = f"icon{ext.lower()}"
        icon_path = os.path.join(storyline_dir, icon_filename)
        relative_path = f"storylines/{storyline_id}/{icon_filename}"
        
        with open(icon_path, "wb") as f:
            f.write(file_content)
        
        storyline.icon_image = relative_path
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return relative_path, ""

    async def upload_guidance_image(
        self,
        db: AsyncSession,
        storyline_id: str,
        segment_index: int,
        file_content: bytes,
        filename: str,
    ) -> Tuple[Optional[str], str]:
        """
        Upload a guidance image for a segment.
        
        Returns:
            Tuple of (image_path, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None, "Storyline not found"
        
        # Find segment
        segment = None
        for s in storyline.segments:
            if s.index == segment_index:
                segment = s
                break
        
        if segment is None:
            return None, f"Segment {segment_index} not found"
        
        # Save guidance image
        storyline_dir = self.get_storyline_dir(storyline_id)
        os.makedirs(storyline_dir, exist_ok=True)
        
        # Get file extension
        _, ext = os.path.splitext(filename)
        if ext.lower() not in [".png", ".jpg", ".jpeg"]:
            return None, "Guidance image must be PNG or JPG format"
        
        image_filename = f"segment{segment_index}_guide{ext.lower()}"
        image_path = os.path.join(storyline_dir, image_filename)
        relative_path = f"storylines/{storyline_id}/{image_filename}"
        
        with open(image_path, "wb") as f:
            f.write(file_content)
        
        segment.guidance_image = relative_path
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return relative_path, ""

    def to_storyline_response(self, storyline: StorylineDB) -> StorylineResponse:
        """Convert a StorylineDB to StorylineResponse."""
        segments = []
        for s in sorted(storyline.segments, key=lambda x: x.index):
            segments.append(Segment(
                index=s.index,
                duration=s.duration,
                path_type=s.path_type,
                offset_start=[s.offset_start_x, s.offset_start_y],
                offset_end=[s.offset_end_x, s.offset_end_y],
                guidance_text=s.guidance_text,
                guidance_text_en=s.guidance_text_en,
                guidance_image=s.guidance_image,
            ))
        
        return StorylineResponse(
            id=storyline.id,
            name=storyline.name,
            name_en=storyline.name_en,
            description=storyline.description,
            description_en=storyline.description_en,
            icon=storyline.icon,
            icon_image=storyline.icon_image,
            base_video_path=storyline.base_video_path,
            video_duration=storyline.video_duration,
            character_id=storyline.character_id,
            segments=segments,
            created_at=storyline.created_at,
            updated_at=storyline.updated_at,
        )

    def to_storyline_list_response(self, storyline: StorylineDB) -> StorylineListResponse:
        """Convert a StorylineDB to StorylineListResponse."""
        return StorylineListResponse(
            id=storyline.id,
            name=storyline.name,
            name_en=storyline.name_en,
            description=storyline.description,
            icon=storyline.icon,
            icon_image=storyline.icon_image,
            video_duration=storyline.video_duration,
            character_id=storyline.character_id,
            segment_count=len(storyline.segments),
            created_at=storyline.created_at,
        )


# Singleton instance
storyline_service = StorylineService()
