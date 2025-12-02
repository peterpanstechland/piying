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
    TransitionDB,
    StorylineCharacterDB,
    StorylineCreate,
    StorylineUpdate,
    Segment,
    StorylineResponse,
    StorylineListResponse,
    StorylineStatus,
    StorylineExtendedCreate,
    StorylineExtendedUpdate,
    StorylineExtended,
    StorylineExtendedListResponse,
    TimelineSegment,
    Transition,
    CoverImage,
    StorylineCharacterConfig,
    AnimationConfig,
    AnimationType,
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

    @staticmethod
    def validate_timeline_segment_duration(
        segments: List["TimelineSegment"], video_duration: float
    ) -> Tuple[bool, str]:
        """
        Validate that total segment duration does not exceed video duration.
        
        Property 11: Total Duration Validation
        *For any* storyline save attempt, if the sum of all segment durations 
        exceeds video_duration, the system SHALL reject with a validation error.
        
        Requirements 4.6
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not segments:
            return True, ""
        
        total_duration = sum(s.duration for s in segments)
        
        if video_duration > 0 and total_duration > video_duration:
            return False, (
                f"Total segment duration ({total_duration:.1f}s) exceeds "
                f"video duration ({video_duration:.1f}s)"
            )
        
        return True, ""

    @staticmethod
    def validate_segment_non_overlap(
        segments: List["TimelineSegment"]
    ) -> Tuple[bool, str, Optional[Tuple[int, int]]]:
        """
        Validate that no two segments have overlapping time ranges.
        
        Property 8: Segment Non-Overlap
        *For any* set of segments in a storyline, no two segments SHALL have 
        overlapping time ranges (start_time to start_time + duration).
        
        Requirements 4.2
        
        Returns:
            Tuple of (is_valid, error_message, conflicting_indices or None)
        """
        if len(segments) < 2:
            return True, "", None
        
        # Sort segments by start_time for efficient overlap checking
        sorted_segments = sorted(segments, key=lambda s: s.start_time)
        
        for i in range(len(sorted_segments) - 1):
            current = sorted_segments[i]
            next_seg = sorted_segments[i + 1]
            
            current_end = current.start_time + current.duration
            
            # Check if current segment's end time overlaps with next segment's start
            if current_end > next_seg.start_time:
                return False, (
                    f"Segment {current.index} (ends at {current_end:.2f}s) overlaps with "
                    f"segment {next_seg.index} (starts at {next_seg.start_time:.2f}s)"
                ), (current.index, next_seg.index)
        
        return True, "", None

    @staticmethod
    def validate_segment_bounds(
        segments: List["TimelineSegment"], video_duration: float
    ) -> Tuple[bool, str]:
        """
        Validate that all segments are within video bounds.
        
        Property 9: Segment Position Bounds
        *For any* segment position update, the segment start_time SHALL be >= 0 
        and start_time + duration SHALL be <= video_duration.
        
        Requirements 4.3
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not segments or video_duration <= 0:
            return True, ""
        
        for segment in segments:
            if segment.start_time < 0:
                return False, f"Segment {segment.index} has negative start_time ({segment.start_time})"
            
            segment_end = segment.start_time + segment.duration
            if segment_end > video_duration:
                return False, (
                    f"Segment {segment.index} extends beyond video duration "
                    f"(ends at {segment_end:.2f}s, video is {video_duration:.2f}s)"
                )
        
        return True, ""

    @staticmethod
    def reindex_segments(segments: List["TimelineSegment"]) -> List["TimelineSegment"]:
        """
        Re-index segments to ensure sequential indices starting from 0.
        
        Property 10: Segment Index Continuity
        *For any* set of segments after deletion, the indices SHALL be 
        sequential starting from 0 with no gaps.
        
        Requirements 4.5
        
        Returns:
            List of segments with updated indices
        """
        # Sort by start_time to maintain temporal order
        sorted_segments = sorted(segments, key=lambda s: s.start_time)
        
        # Re-assign indices
        for i, segment in enumerate(sorted_segments):
            segment.index = i
        
        return sorted_segments

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

    async def create_storyline_extended(
        self, db: AsyncSession, storyline_data: StorylineExtendedCreate
    ) -> StorylineDB:
        """
        Create a new storyline with extended fields.
        Status defaults to draft (Requirements 1.1, 1.2).
        """
        storyline_id = str(uuid.uuid4())
        
        # Create storyline directory
        storyline_dir = self.get_storyline_dir(storyline_id)
        os.makedirs(storyline_dir, exist_ok=True)
        
        # Get max display_order for new storyline
        result = await db.execute(
            select(StorylineDB.display_order)
            .order_by(StorylineDB.display_order.desc())
            .limit(1)
        )
        max_order = result.scalar_one_or_none()
        new_order = (max_order or 0) + 1
        
        storyline = StorylineDB(
            id=storyline_id,
            name=storyline_data.name,
            name_en=storyline_data.name_en,
            synopsis=storyline_data.synopsis,
            synopsis_en=storyline_data.synopsis_en,
            description=storyline_data.description,
            description_en=storyline_data.description_en,
            icon=storyline_data.icon,
            base_video_path=None,  # Will be set when video is uploaded
            video_duration=0.0,
            status=StorylineStatus.DRAFT.value,  # Default to draft
            display_order=new_order,
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

    async def update_storyline_extended(
        self, db: AsyncSession, storyline_id: str, update_data: StorylineExtendedUpdate
    ) -> Optional[StorylineDB]:
        """
        Update a storyline's extended info including synopsis.
        Requirements 1.1, 1.5
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None
        
        if update_data.name is not None:
            storyline.name = update_data.name
        if update_data.name_en is not None:
            storyline.name_en = update_data.name_en
        if update_data.synopsis is not None:
            storyline.synopsis = update_data.synopsis
        if update_data.synopsis_en is not None:
            storyline.synopsis_en = update_data.synopsis_en
        if update_data.description is not None:
            storyline.description = update_data.description
        if update_data.description_en is not None:
            storyline.description_en = update_data.description_en
        if update_data.icon is not None:
            storyline.icon = update_data.icon
        if update_data.display_order is not None:
            storyline.display_order = update_data.display_order
        
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(storyline)
        return storyline

    async def delete_storyline(
        self, db: AsyncSession, storyline_id: str
    ) -> Tuple[bool, str, List[str]]:
        """
        Delete a storyline and its associated files.
        Implements cascade deletion (Requirements 1.4, Property 4).
        
        Property 7: Storyline Cascade Delete
        *For any* storyline deletion, all associated character-video records
        and their video files SHALL be deleted.
        
        Requirements 5.3
        
        Returns:
            Tuple of (success, error_message, deleted_files)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found", []
        
        deleted_files = []
        
        # Delete character-specific videos first (Property 7, Requirements 5.3)
        from .character_video_service import character_video_service
        _, char_video_deleted_files = await character_video_service.delete_all_character_videos_for_storyline(
            db, storyline_id
        )
        deleted_files.extend(char_video_deleted_files)
        
        # Collect all file paths to delete
        files_to_delete = []
        
        # Video file
        if storyline.base_video_path:
            video_full_path = os.path.join(
                os.path.dirname(STORYLINES_DIR), storyline.base_video_path
            )
            files_to_delete.append(video_full_path)
        
        # Cover images
        for cover_path in [
            storyline.cover_original,
            storyline.cover_thumbnail,
            storyline.cover_medium,
            storyline.cover_large
        ]:
            if cover_path:
                cover_full_path = os.path.join(
                    os.path.dirname(STORYLINES_DIR), cover_path
                )
                files_to_delete.append(cover_full_path)
        
        # Guidance images from segments
        for segment in storyline.segments:
            if segment.guidance_image:
                guidance_full_path = os.path.join(
                    os.path.dirname(STORYLINES_DIR), segment.guidance_image
                )
                files_to_delete.append(guidance_full_path)
        
        # Delete storyline directory and all files
        storyline_dir = self.get_storyline_dir(storyline_id)
        if os.path.exists(storyline_dir):
            # Track files that were deleted
            for root, dirs, files in os.walk(storyline_dir):
                for file in files:
                    deleted_files.append(os.path.join(root, file))
            shutil.rmtree(storyline_dir)
        
        # Delete from database (cascade will delete segments, transitions, character configs)
        await db.delete(storyline)
        await db.commit()
        return True, "", deleted_files


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
        
        # Validate video using video processor
        from .video_processor import video_processor
        metadata = video_processor.validate_video_format(video_path)
        
        if not metadata.is_valid:
            # Remove invalid file
            os.remove(video_path)
            return None, 0.0, metadata.error_message
        
        # Update storyline with video metadata
        storyline.base_video_path = relative_path
        storyline.video_duration = metadata.duration
        storyline.video_width = metadata.width
        storyline.video_height = metadata.height
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return relative_path, metadata.duration, ""

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

    async def update_timeline_segments(
        self,
        db: AsyncSession,
        storyline_id: str,
        segments: List[TimelineSegment],
    ) -> Tuple[bool, str]:
        """
        Update timeline segment configuration for a storyline.
        
        Implements:
        - Property 8: Segment Non-Overlap (Requirements 4.2)
        - Property 9: Segment Position Bounds (Requirements 4.3)
        - Property 10: Segment Index Continuity (Requirements 4.5)
        - Property 11: Total Duration Validation (Requirements 4.6)
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            segments: List of TimelineSegment objects
            
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Validate segment non-overlap (Property 8, Requirements 4.2)
        is_valid, error, _ = self.validate_segment_non_overlap(segments)
        if not is_valid:
            return False, error
        
        # Validate segment bounds (Property 9, Requirements 4.3)
        if storyline.video_duration > 0:
            is_valid, error = self.validate_segment_bounds(segments, storyline.video_duration)
            if not is_valid:
                return False, error
        
        # Validate total duration (Property 11, Requirements 4.6)
        if storyline.video_duration > 0:
            is_valid, error = self.validate_timeline_segment_duration(
                segments, storyline.video_duration
            )
            if not is_valid:
                return False, error
        
        # Re-index segments to ensure continuity (Property 10, Requirements 4.5)
        reindexed_segments = self.reindex_segments(segments)
        
        # Delete existing segments
        await db.execute(
            delete(SegmentDB).where(SegmentDB.storyline_id == storyline_id)
        )
        
        # Add new segments with timeline fields
        for segment_data in reindexed_segments:
            segment = SegmentDB(
                storyline_id=storyline_id,
                index=segment_data.index,
                start_time=segment_data.start_time,
                duration=segment_data.duration,
                path_type=segment_data.path_type,
                offset_start_x=segment_data.offset_start[0],
                offset_start_y=segment_data.offset_start[1],
                offset_end_x=segment_data.offset_end[0],
                offset_end_y=segment_data.offset_end[1],
                entry_type=segment_data.entry_animation.type.value,
                entry_duration=segment_data.entry_animation.duration,
                entry_delay=segment_data.entry_animation.delay,
                exit_type=segment_data.exit_animation.type.value,
                exit_duration=segment_data.exit_animation.duration,
                exit_delay=segment_data.exit_animation.delay,
                guidance_text=segment_data.guidance_text,
                guidance_text_en=segment_data.guidance_text_en,
                guidance_image=segment_data.guidance_image,
            )
            db.add(segment)
        
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        return True, ""

    async def delete_segment(
        self,
        db: AsyncSession,
        storyline_id: str,
        segment_index: int,
    ) -> Tuple[bool, str]:
        """
        Delete a segment and re-index remaining segments.
        
        Property 10: Segment Index Continuity
        *For any* set of segments after deletion, the indices SHALL be 
        sequential starting from 0 with no gaps.
        
        Requirements 4.5
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            segment_index: Index of segment to delete
            
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Find the segment to delete
        segment_to_delete = None
        for segment in storyline.segments:
            if segment.index == segment_index:
                segment_to_delete = segment
                break
        
        if segment_to_delete is None:
            return False, f"Segment with index {segment_index} not found"
        
        # Delete the segment
        await db.delete(segment_to_delete)
        
        # Re-index remaining segments
        remaining_segments = [s for s in storyline.segments if s.index != segment_index]
        remaining_segments.sort(key=lambda s: s.start_time)
        
        for i, segment in enumerate(remaining_segments):
            segment.index = i
        
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
        
        Requirements 12.1: Upload guidance image for segment.
        
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
        
        # Delete existing guidance image if any
        if segment.guidance_image:
            old_path = os.path.join(
                os.path.dirname(STORYLINES_DIR), segment.guidance_image
            )
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
        
        image_filename = f"segment{segment_index}_guide{ext.lower()}"
        image_path = os.path.join(storyline_dir, image_filename)
        relative_path = f"storylines/{storyline_id}/{image_filename}"
        
        with open(image_path, "wb") as f:
            f.write(file_content)
        
        segment.guidance_image = relative_path
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return relative_path, ""

    async def capture_guidance_from_video(
        self,
        db: AsyncSession,
        storyline_id: str,
        segment_index: int,
        timestamp: float = 0.0,
    ) -> Tuple[Optional[str], str]:
        """
        Capture a video frame and use it as guidance image for a segment.
        
        Requirements 12.2: Capture video frame as guidance image.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            segment_index: Index of the segment
            timestamp: Time in seconds to capture frame from
            
        Returns:
            Tuple of (image_path or None, error_message)
        """
        from .video_processor import video_processor
        
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
        
        # Check if video exists
        if not storyline.base_video_path:
            return None, "Storyline does not have a background video"
        
        # Get full video path
        video_full_path = os.path.join(
            os.path.dirname(STORYLINES_DIR), storyline.base_video_path
        )
        
        if not os.path.exists(video_full_path):
            return None, "Video file not found on disk"
        
        # Validate timestamp
        if timestamp < 0:
            timestamp = 0
        elif storyline.video_duration > 0 and timestamp > storyline.video_duration:
            timestamp = storyline.video_duration
        
        # Delete existing guidance image if any
        if segment.guidance_image:
            old_path = os.path.join(
                os.path.dirname(STORYLINES_DIR), segment.guidance_image
            )
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
        
        # Extract frame and save as guidance image
        storyline_dir = self.get_storyline_dir(storyline_id)
        os.makedirs(storyline_dir, exist_ok=True)
        
        image_filename = f"segment{segment_index}_guide.jpg"
        image_path = os.path.join(storyline_dir, image_filename)
        relative_path = f"storylines/{storyline_id}/{image_filename}"
        
        # Extract frame to file
        frame_data, error = video_processor.extract_frame(
            video_full_path,
            timestamp,
            output_format="file",
            output_path=image_path
        )
        
        if frame_data is None:
            return None, f"Failed to extract frame: {error}"
        
        # Update segment with guidance image path
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

    def to_storyline_extended_response(self, storyline: StorylineDB) -> StorylineExtended:
        """Convert a StorylineDB to StorylineExtended response."""
        # Build segments with animation configs
        segments = []
        for s in sorted(storyline.segments, key=lambda x: x.index):
            entry_animation = AnimationConfig(
                type=AnimationType(s.entry_type) if s.entry_type else AnimationType.INSTANT,
                duration=s.entry_duration or 1.0,
                delay=s.entry_delay or 0.0
            )
            exit_animation = AnimationConfig(
                type=AnimationType(s.exit_type) if s.exit_type else AnimationType.INSTANT,
                duration=s.exit_duration or 1.0,
                delay=s.exit_delay or 0.0
            )
            segments.append(TimelineSegment(
                id=str(s.id),
                index=s.index,
                start_time=s.start_time or 0.0,
                duration=s.duration,
                path_type=s.path_type,
                offset_start=[s.offset_start_x, s.offset_start_y],
                offset_end=[s.offset_end_x, s.offset_end_y],
                entry_animation=entry_animation,
                exit_animation=exit_animation,
                guidance_text=s.guidance_text,
                guidance_text_en=s.guidance_text_en,
                guidance_image=s.guidance_image,
            ))
        
        # Build transitions
        transitions = []
        for t in storyline.transitions:
            transitions.append(Transition(
                id=t.id,
                from_segment_index=t.from_segment_index,
                to_segment_index=t.to_segment_index,
                type=t.type,
                duration=t.duration
            ))
        
        # Build cover image
        cover_image = None
        if storyline.cover_original or storyline.cover_thumbnail:
            cover_image = CoverImage(
                original_path=storyline.cover_original,
                thumbnail_path=storyline.cover_thumbnail,
                medium_path=storyline.cover_medium,
                large_path=storyline.cover_large
            )
        
        # Build character config
        character_config = None
        if storyline.storyline_characters:
            char_ids = [sc.character_id for sc in sorted(storyline.storyline_characters, key=lambda x: x.display_order)]
            default_char = next((sc.character_id for sc in storyline.storyline_characters if sc.is_default), char_ids[0] if char_ids else None)
            if char_ids and default_char:
                character_config = StorylineCharacterConfig(
                    character_ids=char_ids,
                    default_character_id=default_char,
                    display_order=char_ids
                )
        
        # Build video resolution tuple
        video_resolution = None
        if storyline.video_width and storyline.video_height:
            video_resolution = (storyline.video_width, storyline.video_height)
        
        return StorylineExtended(
            id=storyline.id,
            name=storyline.name,
            name_en=storyline.name_en or "",
            synopsis=storyline.synopsis or "",
            synopsis_en=storyline.synopsis_en or "",
            description=storyline.description or "",
            description_en=storyline.description_en or "",
            icon=storyline.icon or "⛏️",
            icon_image=storyline.icon_image,
            status=StorylineStatus(storyline.status) if storyline.status else StorylineStatus.DRAFT,
            display_order=storyline.display_order or 0,
            enabled=bool(storyline.enabled) if hasattr(storyline, 'enabled') else False,
            base_video_path=storyline.base_video_path,
            video_duration=storyline.video_duration or 0.0,
            video_resolution=video_resolution,
            cover_image=cover_image,
            segments=segments,
            transitions=transitions,
            character_config=character_config,
            character_id=storyline.character_id,
            created_at=storyline.created_at,
            updated_at=storyline.updated_at,
        )

    def to_storyline_extended_list_response(self, storyline: StorylineDB) -> StorylineExtendedListResponse:
        """Convert a StorylineDB to StorylineExtendedListResponse."""
        # Build cover image
        cover_image = None
        if storyline.cover_original or storyline.cover_thumbnail:
            cover_image = CoverImage(
                original_path=storyline.cover_original,
                thumbnail_path=storyline.cover_thumbnail,
                medium_path=storyline.cover_medium,
                large_path=storyline.cover_large
            )
        
        return StorylineExtendedListResponse(
            id=storyline.id,
            name=storyline.name,
            name_en=storyline.name_en or "",
            synopsis=storyline.synopsis or "",
            description=storyline.description or "",
            icon=storyline.icon or "⛏️",
            icon_image=storyline.icon_image,
            status=StorylineStatus(storyline.status) if storyline.status else StorylineStatus.DRAFT,
            display_order=storyline.display_order or 0,
            enabled=bool(storyline.enabled) if hasattr(storyline, 'enabled') else False,
            video_duration=storyline.video_duration or 0.0,
            cover_image=cover_image,
            segment_count=len(storyline.segments),
            created_at=storyline.created_at,
        )

    async def get_all_storylines_sorted(self, db: AsyncSession) -> List[StorylineDB]:
        """Get all storylines sorted by display_order (Requirements 10.3)."""
        result = await db.execute(
            select(StorylineDB)
            .options(
                selectinload(StorylineDB.segments),
                selectinload(StorylineDB.transitions),
                selectinload(StorylineDB.storyline_characters)
            )
            .order_by(StorylineDB.display_order.asc())
        )
        return list(result.scalars().all())

    async def publish_storyline(
        self, db: AsyncSession, storyline_id: str
    ) -> Tuple[bool, str]:
        """
        Publish a storyline (Requirements 1.2, 10.1, 10.2).
        
        Validates that video exists before publishing.
        
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Validate video exists before publishing (Property 2)
        if not storyline.base_video_path:
            return False, "Cannot publish storyline without a background video"
        
        # Check if video file actually exists
        if storyline.base_video_path:
            video_full_path = os.path.join(
                os.path.dirname(STORYLINES_DIR), storyline.base_video_path
            )
            if not os.path.exists(video_full_path):
                return False, "Video file not found on disk"
        
        storyline.status = StorylineStatus.PUBLISHED.value
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(storyline)
        return True, ""

    async def unpublish_storyline(
        self, db: AsyncSession, storyline_id: str
    ) -> Tuple[bool, str]:
        """
        Unpublish a storyline (set to draft) (Requirements 10.1, 10.2).
        
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        storyline.status = StorylineStatus.DRAFT.value
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(storyline)
        return True, ""

    async def get_published_storylines(self, db: AsyncSession) -> List[StorylineDB]:
        """
        Get all published storylines sorted by display_order (Requirements 10.1, 10.2).
        
        For frontend integration - returns all storylines with status 'published'.
        The 'enabled' field is included so frontend can grey out disabled storylines.
        """
        result = await db.execute(
            select(StorylineDB)
            .where(StorylineDB.status == StorylineStatus.PUBLISHED.value)
            .options(
                selectinload(StorylineDB.segments),
                selectinload(StorylineDB.transitions),
                selectinload(StorylineDB.storyline_characters)
            )
            .order_by(StorylineDB.display_order.asc())
        )
        return list(result.scalars().all())

    async def update_storyline_order(
        self, db: AsyncSession, storyline_id: str, new_order: int
    ) -> Tuple[bool, str]:
        """
        Update a storyline's display order (Requirements 10.3).
        
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        storyline.display_order = new_order
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(storyline)
        return True, ""

    async def reorder_storylines(
        self, db: AsyncSession, storyline_orders: List[Tuple[str, int]]
    ) -> Tuple[bool, str]:
        """
        Batch update storyline display orders (Requirements 10.3).
        
        Args:
            storyline_orders: List of (storyline_id, new_order) tuples
            
        Returns:
            Tuple of (success, error_message)
        """
        for storyline_id, new_order in storyline_orders:
            storyline = await self.get_storyline_by_id(db, storyline_id)
            if storyline is None:
                return False, f"Storyline '{storyline_id}' not found"
            storyline.display_order = new_order
            storyline.updated_at = datetime.utcnow()
        
        await db.commit()
        return True, ""

    async def upload_cover_image(
        self,
        db: AsyncSession,
        storyline_id: str,
        file_content: bytes,
        filename: str,
    ) -> Tuple[Optional[CoverImage], str]:
        """
        Upload and process a cover image for a storyline.
        
        Requirements 9.1, 9.3: Validate format and generate multiple sizes.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            file_content: Image file content
            filename: Original filename
            
        Returns:
            Tuple of (CoverImage or None, error_message)
        """
        from .image_processor import image_processor
        
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None, "Storyline not found"
        
        # Save file temporarily for validation
        storyline_dir = self.get_storyline_dir(storyline_id)
        os.makedirs(storyline_dir, exist_ok=True)
        
        # Get file extension
        _, ext = os.path.splitext(filename)
        ext_lower = ext.lower()
        
        # Validate extension
        if ext_lower not in [".png", ".jpg", ".jpeg", ".webp"]:
            return None, "Cover image must be PNG, JPG, or WebP format"
        
        # Save temporary file
        temp_path = os.path.join(storyline_dir, f"cover_temp{ext_lower}")
        with open(temp_path, "wb") as f:
            f.write(file_content)
        
        try:
            # Validate cover image (format and minimum resolution)
            metadata = image_processor.validate_cover_image(temp_path)
            if not metadata.is_valid:
                os.remove(temp_path)
                return None, metadata.error_message
            
            # Delete existing cover images if any
            await self._delete_existing_cover_images(storyline)
            
            # Generate cover images at multiple sizes
            cover_paths, error = image_processor.generate_cover_images(
                temp_path, storyline_dir, "cover"
            )
            
            # Remove temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            if cover_paths is None:
                return None, error
            
            # Convert to relative paths
            relative_original = f"storylines/{storyline_id}/{os.path.basename(cover_paths.original_path)}"
            relative_thumbnail = f"storylines/{storyline_id}/{os.path.basename(cover_paths.thumbnail_path)}"
            relative_medium = f"storylines/{storyline_id}/{os.path.basename(cover_paths.medium_path)}"
            relative_large = f"storylines/{storyline_id}/{os.path.basename(cover_paths.large_path)}"
            
            # Update storyline with cover paths
            storyline.cover_original = relative_original
            storyline.cover_thumbnail = relative_thumbnail
            storyline.cover_medium = relative_medium
            storyline.cover_large = relative_large
            storyline.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(storyline)
            
            return CoverImage(
                original_path=relative_original,
                thumbnail_path=relative_thumbnail,
                medium_path=relative_medium,
                large_path=relative_large
            ), ""
            
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return None, f"Error processing cover image: {str(e)}"

    async def capture_cover_from_video(
        self,
        db: AsyncSession,
        storyline_id: str,
        timestamp: float = 0.0,
    ) -> Tuple[Optional[CoverImage], str]:
        """
        Capture a video frame and use it as cover image.
        
        Requirements 9.2: Capture video frame as cover image.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            timestamp: Time in seconds to capture frame from
            
        Returns:
            Tuple of (CoverImage or None, error_message)
        """
        from .image_processor import image_processor
        
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None, "Storyline not found"
        
        # Check if video exists
        if not storyline.base_video_path:
            return None, "Storyline does not have a background video"
        
        # Get full video path
        video_full_path = os.path.join(
            os.path.dirname(STORYLINES_DIR), storyline.base_video_path
        )
        
        if not os.path.exists(video_full_path):
            return None, "Video file not found on disk"
        
        # Validate timestamp
        if timestamp < 0:
            timestamp = 0
        elif storyline.video_duration > 0 and timestamp > storyline.video_duration:
            timestamp = storyline.video_duration
        
        # Delete existing cover images if any
        await self._delete_existing_cover_images(storyline)
        
        # Capture frame and generate cover images
        storyline_dir = self.get_storyline_dir(storyline_id)
        cover_paths, error = image_processor.capture_frame_as_cover(
            video_full_path, timestamp, storyline_dir, "cover"
        )
        
        if cover_paths is None:
            return None, error
        
        # Convert to relative paths
        relative_original = f"storylines/{storyline_id}/{os.path.basename(cover_paths.original_path)}"
        relative_thumbnail = f"storylines/{storyline_id}/{os.path.basename(cover_paths.thumbnail_path)}"
        relative_medium = f"storylines/{storyline_id}/{os.path.basename(cover_paths.medium_path)}"
        relative_large = f"storylines/{storyline_id}/{os.path.basename(cover_paths.large_path)}"
        
        # Update storyline with cover paths
        storyline.cover_original = relative_original
        storyline.cover_thumbnail = relative_thumbnail
        storyline.cover_medium = relative_medium
        storyline.cover_large = relative_large
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(storyline)
        
        return CoverImage(
            original_path=relative_original,
            thumbnail_path=relative_thumbnail,
            medium_path=relative_medium,
            large_path=relative_large
        ), ""

    async def delete_cover_image(
        self,
        db: AsyncSession,
        storyline_id: str,
    ) -> Tuple[bool, str]:
        """
        Delete cover image and revert to default (first video frame).
        
        Requirements 9.4: Delete cover (revert to default).
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Delete existing cover images
        await self._delete_existing_cover_images(storyline)
        
        # Clear cover paths in database
        storyline.cover_original = None
        storyline.cover_thumbnail = None
        storyline.cover_medium = None
        storyline.cover_large = None
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return True, ""

    async def _delete_existing_cover_images(self, storyline: StorylineDB) -> None:
        """Delete existing cover image files from disk."""
        for cover_path in [
            storyline.cover_original,
            storyline.cover_thumbnail,
            storyline.cover_medium,
            storyline.cover_large
        ]:
            if cover_path:
                full_path = os.path.join(
                    os.path.dirname(STORYLINES_DIR), cover_path
                )
                if os.path.exists(full_path):
                    try:
                        os.remove(full_path)
                    except Exception:
                        pass  # Ignore deletion errors

    # ==================== Transition Management ====================
    # Requirements 6.2, 6.3: CRUD operations for transitions

    async def get_transitions(
        self, db: AsyncSession, storyline_id: str
    ) -> Tuple[Optional[List[Transition]], str]:
        """
        Get all transitions for a storyline.
        
        Requirements 6.2, 6.3: Get transitions between segments.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            
        Returns:
            Tuple of (list of Transition or None, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None, "Storyline not found"
        
        # Load transitions with the storyline
        result = await db.execute(
            select(StorylineDB)
            .where(StorylineDB.id == storyline_id)
            .options(selectinload(StorylineDB.transitions))
        )
        storyline = result.scalar_one_or_none()
        
        if storyline is None:
            return None, "Storyline not found"
        
        transitions = []
        from ...models.admin.storyline import TransitionType
        for t in storyline.transitions:
            transitions.append(Transition(
                id=t.id,
                from_segment_index=t.from_segment_index,
                to_segment_index=t.to_segment_index,
                type=TransitionType(t.type) if t.type else TransitionType.CUT,
                duration=t.duration or 0.5
            ))
        
        return transitions, ""

    async def update_transitions(
        self,
        db: AsyncSession,
        storyline_id: str,
        transitions: List[Transition],
    ) -> Tuple[bool, str]:
        """
        Update transitions for a storyline (batch update).
        
        Requirements 6.2, 6.3: CRUD operations for transitions.
        Property 14: Transition Type Validation
        Property 15: Transition Storage Round-Trip
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            transitions: List of Transition objects
            
        Returns:
            Tuple of (success, error_message)
        """
        from ...models.admin.storyline import TransitionType
        
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Validate transition types (Property 14)
        valid_types = [t.value for t in TransitionType]
        for transition in transitions:
            if transition.type.value not in valid_types:
                return False, f"Invalid transition type: {transition.type}. Must be one of: {valid_types}"
        
        # Validate transition duration (0.1 to 3.0 seconds)
        for transition in transitions:
            if transition.duration < 0.1 or transition.duration > 3.0:
                return False, f"Transition duration must be between 0.1 and 3.0 seconds, got {transition.duration}"
        
        # Validate segment indices exist
        segment_indices = {s.index for s in storyline.segments}
        for transition in transitions:
            if transition.from_segment_index not in segment_indices:
                return False, f"Invalid from_segment_index: {transition.from_segment_index}"
            if transition.to_segment_index not in segment_indices:
                return False, f"Invalid to_segment_index: {transition.to_segment_index}"
        
        # Delete existing transitions
        await db.execute(
            delete(TransitionDB).where(TransitionDB.storyline_id == storyline_id)
        )
        
        # Add new transitions
        for transition in transitions:
            transition_db = TransitionDB(
                id=transition.id if transition.id else str(uuid.uuid4()),
                storyline_id=storyline_id,
                from_segment_index=transition.from_segment_index,
                to_segment_index=transition.to_segment_index,
                type=transition.type.value,
                duration=transition.duration
            )
            db.add(transition_db)
        
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        return True, ""

    async def create_transition(
        self,
        db: AsyncSession,
        storyline_id: str,
        transition: Transition,
    ) -> Tuple[Optional[Transition], str]:
        """
        Create a single transition.
        
        Requirements 6.2, 6.3: CRUD operations for transitions.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            transition: Transition object
            
        Returns:
            Tuple of (created Transition or None, error_message)
        """
        from ...models.admin.storyline import TransitionType
        
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return None, "Storyline not found"
        
        # Validate transition type
        valid_types = [t.value for t in TransitionType]
        if transition.type.value not in valid_types:
            return None, f"Invalid transition type: {transition.type}. Must be one of: {valid_types}"
        
        # Validate duration
        if transition.duration < 0.1 or transition.duration > 3.0:
            return None, f"Transition duration must be between 0.1 and 3.0 seconds"
        
        # Validate segment indices
        segment_indices = {s.index for s in storyline.segments}
        if transition.from_segment_index not in segment_indices:
            return None, f"Invalid from_segment_index: {transition.from_segment_index}"
        if transition.to_segment_index not in segment_indices:
            return None, f"Invalid to_segment_index: {transition.to_segment_index}"
        
        # Create transition
        transition_id = transition.id if transition.id else str(uuid.uuid4())
        transition_db = TransitionDB(
            id=transition_id,
            storyline_id=storyline_id,
            from_segment_index=transition.from_segment_index,
            to_segment_index=transition.to_segment_index,
            type=transition.type.value,
            duration=transition.duration
        )
        db.add(transition_db)
        
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return Transition(
            id=transition_id,
            from_segment_index=transition.from_segment_index,
            to_segment_index=transition.to_segment_index,
            type=transition.type,
            duration=transition.duration
        ), ""

    async def delete_transition(
        self,
        db: AsyncSession,
        storyline_id: str,
        transition_id: str,
    ) -> Tuple[bool, str]:
        """
        Delete a single transition.
        
        Requirements 6.2, 6.3: CRUD operations for transitions.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            transition_id: Transition ID to delete
            
        Returns:
            Tuple of (success, error_message)
        """
        storyline = await self.get_storyline_by_id(db, storyline_id)
        if storyline is None:
            return False, "Storyline not found"
        
        # Find and delete the transition
        result = await db.execute(
            select(TransitionDB).where(
                TransitionDB.id == transition_id,
                TransitionDB.storyline_id == storyline_id
            )
        )
        transition_db = result.scalar_one_or_none()
        
        if transition_db is None:
            return False, f"Transition '{transition_id}' not found"
        
        await db.delete(transition_db)
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        
        return True, ""

    # ==================== Character Configuration Management ====================
    # Requirements 7.2, 7.3, 7.4, 7.5: Character configuration for storylines

    async def get_storyline_characters(
        self, db: AsyncSession, storyline_id: str
    ) -> Tuple[Optional[StorylineCharacterConfig], str]:
        """
        Get character configuration for a storyline.
        
        Requirements 7.2, 7.3, 7.4: Get available characters for storyline.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            
        Returns:
            Tuple of (StorylineCharacterConfig or None, error_message)
        """
        # Load storyline with character associations
        result = await db.execute(
            select(StorylineDB)
            .where(StorylineDB.id == storyline_id)
            .options(selectinload(StorylineDB.storyline_characters))
        )
        storyline = result.scalar_one_or_none()
        
        if storyline is None:
            return None, "Storyline not found"
        
        if not storyline.storyline_characters:
            return None, ""  # No characters configured, not an error
        
        # Build character config from associations
        sorted_chars = sorted(storyline.storyline_characters, key=lambda x: x.display_order)
        char_ids = [sc.character_id for sc in sorted_chars]
        default_char = next(
            (sc.character_id for sc in sorted_chars if sc.is_default),
            char_ids[0] if char_ids else None
        )
        
        if not char_ids or not default_char:
            return None, ""
        
        return StorylineCharacterConfig(
            character_ids=char_ids,
            default_character_id=default_char,
            display_order=char_ids
        ), ""

    async def update_storyline_characters(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_config: StorylineCharacterConfig,
    ) -> Tuple[bool, str]:
        """
        Update character configuration for a storyline.
        
        Requirements 7.2, 7.3, 7.4: Manage character associations.
        
        Property 3: Cascade Delete on Character Removal
        *For any* storyline-character association with an uploaded video,
        removing the character from the storyline SHALL result in the
        video file being deleted from the file system.
        
        Requirements 1.4
        
        Property 16: Character Count Validation
        *For any* storyline character configuration, the number of selected 
        characters SHALL be between 1 and 10 inclusive.
        
        Property 17: Default Character Uniqueness
        *For any* storyline with character configuration, exactly one character 
        SHALL be marked as default, and that character SHALL be in the selected 
        characters list.
        
        Args:
            db: Database session
            storyline_id: Storyline ID
            character_config: Character configuration
            
        Returns:
            Tuple of (success, error_message)
        """
        # Load storyline with character associations
        result = await db.execute(
            select(StorylineDB)
            .where(StorylineDB.id == storyline_id)
            .options(selectinload(StorylineDB.storyline_characters))
        )
        storyline = result.scalar_one_or_none()
        
        if storyline is None:
            return False, "Storyline not found"
        
        # Property 16: Validate character count (1-10)
        if len(character_config.character_ids) < 1:
            return False, "At least 1 character must be selected"
        if len(character_config.character_ids) > 10:
            return False, "Maximum 10 characters can be selected"
        
        # Property 17: Validate default character is in the list
        if character_config.default_character_id not in character_config.character_ids:
            return False, f"Default character '{character_config.default_character_id}' must be in the selected characters list"
        
        # Verify all characters exist
        for char_id in character_config.character_ids:
            char_result = await db.execute(
                select(CharacterDB).where(CharacterDB.id == char_id)
            )
            if char_result.scalar_one_or_none() is None:
                return False, f"Character '{char_id}' not found"
        
        # Identify characters being removed (Property 3, Requirements 1.4)
        existing_char_ids = {sc.character_id for sc in storyline.storyline_characters}
        new_char_ids = set(character_config.character_ids)
        removed_char_ids = existing_char_ids - new_char_ids
        
        # Delete character videos for removed characters
        if removed_char_ids:
            from .character_video_service import character_video_service
            for char_id in removed_char_ids:
                await character_video_service.delete_character_video_on_removal(
                    db, storyline_id, char_id
                )
        
        # Delete existing character associations
        await db.execute(
            delete(StorylineCharacterDB).where(
                StorylineCharacterDB.storyline_id == storyline_id
            )
        )
        
        # Determine display order
        display_order_list = character_config.display_order if character_config.display_order else character_config.character_ids
        
        # Add new character associations
        for i, char_id in enumerate(display_order_list):
            if char_id in character_config.character_ids:
                char_assoc = StorylineCharacterDB(
                    storyline_id=storyline_id,
                    character_id=char_id,
                    is_default=(char_id == character_config.default_character_id),
                    display_order=i
                )
                db.add(char_assoc)
        
        storyline.updated_at = datetime.utcnow()
        await db.commit()
        return True, ""

    async def remove_character_from_all_storylines(
        self, db: AsyncSession, character_id: str
    ) -> Tuple[int, str]:
        """
        Remove a character from all storyline configurations.
        
        Requirements 7.5: Character Deletion Cascade
        *For any* character deleted from the system, that character SHALL be 
        removed from all storyline character configurations.
        
        Property 3: Cascade Delete on Character Removal
        *For any* storyline-character association with an uploaded video,
        removing the character from the storyline SHALL result in the
        video file being deleted from the file system.
        
        Requirements 1.4
        
        Property 19: Character Deletion Cascade
        
        Args:
            db: Database session
            character_id: Character ID to remove
            
        Returns:
            Tuple of (count of affected storylines, error_message)
        """
        # Find all storyline associations for this character
        result = await db.execute(
            select(StorylineCharacterDB).where(
                StorylineCharacterDB.character_id == character_id
            )
        )
        associations = list(result.scalars().all())
        
        affected_storyline_ids = set()
        
        # Import character video service for video cleanup
        from .character_video_service import character_video_service
        
        for assoc in associations:
            affected_storyline_ids.add(assoc.storyline_id)
            
            # Delete character video if it exists (Property 3, Requirements 1.4)
            await character_video_service.delete_character_video_on_removal(
                db, assoc.storyline_id, character_id
            )
            
            # If this was the default character, we need to update the default
            if assoc.is_default:
                # Find another character in this storyline to make default
                other_result = await db.execute(
                    select(StorylineCharacterDB).where(
                        StorylineCharacterDB.storyline_id == assoc.storyline_id,
                        StorylineCharacterDB.character_id != character_id
                    ).order_by(StorylineCharacterDB.display_order.asc())
                )
                other_chars = list(other_result.scalars().all())
                
                if other_chars:
                    # Make the first remaining character the default
                    other_chars[0].is_default = True
            
            # Delete the association
            await db.delete(assoc)
        
        # Update display_order for remaining characters in affected storylines
        for storyline_id in affected_storyline_ids:
            result = await db.execute(
                select(StorylineCharacterDB).where(
                    StorylineCharacterDB.storyline_id == storyline_id
                ).order_by(StorylineCharacterDB.display_order.asc())
            )
            remaining_chars = list(result.scalars().all())
            
            # Re-index display_order
            for i, char_assoc in enumerate(remaining_chars):
                char_assoc.display_order = i
            
            # Update storyline timestamp
            storyline_result = await db.execute(
                select(StorylineDB).where(StorylineDB.id == storyline_id)
            )
            storyline = storyline_result.scalar_one_or_none()
            if storyline:
                storyline.updated_at = datetime.utcnow()
        
        await db.commit()
        return len(affected_storyline_ids), ""

    @staticmethod
    def validate_character_count(character_ids: List[str]) -> Tuple[bool, str]:
        """
        Validate that character count is between 1 and 10.
        
        Property 16: Character Count Validation
        *For any* storyline character configuration, the number of selected 
        characters SHALL be between 1 and 10 inclusive.
        
        Requirements 7.2
        
        Args:
            character_ids: List of character IDs
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        count = len(character_ids)
        if count < 1:
            return False, "At least 1 character must be selected"
        if count > 10:
            return False, f"Maximum 10 characters allowed, got {count}"
        return True, ""

    @staticmethod
    def validate_default_character(
        character_ids: List[str], default_character_id: str
    ) -> Tuple[bool, str]:
        """
        Validate that default character is in the character list.
        
        Property 17: Default Character Uniqueness
        *For any* storyline with character configuration, exactly one character 
        SHALL be marked as default, and that character SHALL be in the selected 
        characters list.
        
        Requirements 7.3
        
        Args:
            character_ids: List of character IDs
            default_character_id: Default character ID
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not default_character_id:
            return False, "Default character ID is required"
        if default_character_id not in character_ids:
            return False, f"Default character '{default_character_id}' must be in the selected characters list"
        return True, ""


# Singleton instance
storyline_service = StorylineService()
