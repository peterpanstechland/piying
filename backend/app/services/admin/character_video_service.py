"""
Character Video Service for managing character-specific videos.

This service handles uploading, validating, and managing character-specific
background videos for storylines. Each character in a storyline can have
its own background video that is used when that character is selected
for motion capture.

Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
"""
import os
import shutil
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models.admin.storyline import (
    StorylineDB,
    StorylineCharacterDB,
    CharacterVideoStatus,
    CharacterVideoUpload,
    CharacterVideoListResponse,
)
from ...models.admin.character import CharacterDB
from .video_processor import video_processor


# Base directory for storyline data
STORYLINES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "data", "storylines"
)


class CharacterVideoService:
    """
    Service for managing character-specific videos.
    
    Provides functionality for:
    - Uploading character-specific videos with validation
    - Validating video duration against base video
    - Retrieving video paths for characters
    - Deleting character videos
    - Getting video status for all characters in a storyline
    
    Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
    """

    def __init__(self):
        """Initialize the character video service."""
        # Ensure base directory exists
        os.makedirs(STORYLINES_DIR, exist_ok=True)

    def get_storyline_videos_dir(self, storyline_id: str) -> str:
        """
        Get the directory path for a storyline's character videos.
        
        File path convention (Requirements 6.1, 6.2):
        data/storylines/{storyline_id}/videos/
        
        Args:
            storyline_id: The storyline ID
            
        Returns:
            Path to the videos directory
        """
        return os.path.join(STORYLINES_DIR, storyline_id, "videos")

    def get_character_video_file_path(
        self, storyline_id: str, character_id: str
    ) -> str:
        """
        Get the file path for a character-specific video.
        
        Property 9: File Path Convention
        *For any* uploaded character-specific video, the file SHALL be stored
        at the path `data/storylines/{storyline_id}/videos/{character_id}.mp4`.
        
        Requirements 6.1, 6.2
        
        Args:
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            Full file path for the character video
        """
        videos_dir = self.get_storyline_videos_dir(storyline_id)
        return os.path.join(videos_dir, f"{character_id}.mp4")

    def get_character_thumbnail_path(
        self, storyline_id: str, character_id: str
    ) -> str:
        """
        Get the file path for a character video thumbnail.
        
        Args:
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            Full file path for the video thumbnail
        """
        videos_dir = self.get_storyline_videos_dir(storyline_id)
        return os.path.join(videos_dir, f"{character_id}_thumb.jpg")

    def get_relative_video_path(
        self, storyline_id: str, character_id: str
    ) -> str:
        """
        Get the relative path for a character-specific video.
        
        Args:
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            Relative path from data directory
        """
        return f"storylines/{storyline_id}/videos/{character_id}.mp4"

    def get_relative_thumbnail_path(
        self, storyline_id: str, character_id: str
    ) -> str:
        """
        Get the relative path for a character video thumbnail.
        
        Args:
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            Relative path from data directory
        """
        return f"storylines/{storyline_id}/videos/{character_id}_thumb.jpg"

    def validate_video_duration(
        self,
        video_duration: float,
        base_video_duration: float,
        tolerance: float = 1.0
    ) -> Tuple[bool, str]:
        """
        Validate that video duration matches base video within tolerance.
        
        NOTE: Duration validation is now disabled to allow flexible video lengths.
        Character videos can have different durations from the base video.
        
        Args:
            video_duration: Duration of the uploaded video in seconds
            base_video_duration: Duration of the base video in seconds
            tolerance: Maximum allowed difference in seconds (default 1.0)
            
        Returns:
            Tuple of (is_valid, error_message) - always returns True now
        """
        # Duration validation disabled - allow any video length
        return True, ""

    async def upload_character_video(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: str,
        file_content: bytes,
        filename: str,
    ) -> Tuple[Optional[CharacterVideoUpload], str]:
        """
        Upload a character-specific video with validation.
        
        Requirements 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            character_id: The character ID
            file_content: Video file content as bytes
            filename: Original filename
            
        Returns:
            Tuple of (CharacterVideoUpload response or None, error_message)
        """
        # Get storyline with character associations
        result = await db.execute(
            select(StorylineDB)
            .where(StorylineDB.id == storyline_id)
            .options(selectinload(StorylineDB.storyline_characters))
        )
        storyline = result.scalar_one_or_none()
        
        if storyline is None:
            return None, "Storyline not found."
        
        # Check if character is assigned to this storyline
        character_assoc = None
        for assoc in storyline.storyline_characters:
            if assoc.character_id == character_id:
                character_assoc = assoc
                break
        
        if character_assoc is None:
            return None, "Character is not assigned to this storyline."
        
        # Check if storyline has a base video
        if not storyline.base_video_path or storyline.video_duration <= 0:
            return None, "Storyline must have a base video before uploading character videos."
        
        # Create videos directory
        videos_dir = self.get_storyline_videos_dir(storyline_id)
        os.makedirs(videos_dir, exist_ok=True)
        
        # Save file temporarily for validation
        # Use .mp4 extension for temp file so video_processor can validate it
        video_path = self.get_character_video_file_path(storyline_id, character_id)
        temp_path = os.path.join(videos_dir, f"{character_id}_temp.mp4")
        
        try:
            # Write file to temp location
            with open(temp_path, "wb") as f:
                f.write(file_content)
            
            # Validate video format using video processor
            metadata = video_processor.validate_video_format(temp_path)
            
            if not metadata.is_valid:
                os.remove(temp_path)
                return None, metadata.error_message
            
            # Validate duration against base video (Property 1, Requirements 1.2, 2.3)
            is_valid, error = self.validate_video_duration(
                metadata.duration, storyline.video_duration
            )
            
            if not is_valid:
                os.remove(temp_path)
                return None, error
            
            # Move temp file to final location (replaces existing if any)
            if os.path.exists(video_path):
                os.remove(video_path)
            os.rename(temp_path, video_path)
            
            # Generate thumbnail (Requirements 2.4)
            thumbnail_path = self.get_character_thumbnail_path(storyline_id, character_id)
            success, thumb_error = video_processor.generate_thumbnail(
                video_path, thumbnail_path, timestamp=0.0
            )
            
            relative_video_path = self.get_relative_video_path(storyline_id, character_id)
            relative_thumbnail_path = self.get_relative_thumbnail_path(storyline_id, character_id) if success else None
            
            # Update database association (Requirements 2.5)
            character_assoc.video_path = relative_video_path
            character_assoc.video_duration = metadata.duration
            character_assoc.video_thumbnail = relative_thumbnail_path
            character_assoc.video_uploaded_at = datetime.utcnow()
            
            await db.commit()
            
            return CharacterVideoUpload(
                video_path=relative_video_path,
                video_duration=metadata.duration,
                video_thumbnail=relative_thumbnail_path or "",
                message="Video uploaded successfully"
            ), ""
            
        except Exception as e:
            # Clean up temp file if it exists
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return None, f"Failed to process video: {str(e)}"

    async def get_character_video_path(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: str,
    ) -> Optional[str]:
        """
        Get video path for a character, returns None if not set.
        
        Property 4: Video Path Resolution
        *For any* character selection in a storyline, the resolved video path
        SHALL be the character-specific video path if it exists, otherwise
        the storyline's base video path.
        
        Requirements 3.2, 3.3
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            Character-specific video path or None if not set
        """
        result = await db.execute(
            select(StorylineCharacterDB)
            .where(
                StorylineCharacterDB.storyline_id == storyline_id,
                StorylineCharacterDB.character_id == character_id
            )
        )
        character_assoc = result.scalar_one_or_none()
        
        if character_assoc is None:
            return None
        
        return character_assoc.video_path

    async def delete_character_video(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: str,
    ) -> Tuple[bool, str]:
        """
        Delete character-specific video and update database.
        
        Requirements 1.4, 4.5
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            Tuple of (success, error_message)
        """
        # Get the character association
        result = await db.execute(
            select(StorylineCharacterDB)
            .where(
                StorylineCharacterDB.storyline_id == storyline_id,
                StorylineCharacterDB.character_id == character_id
            )
        )
        character_assoc = result.scalar_one_or_none()
        
        if character_assoc is None:
            return False, "Character is not assigned to this storyline."
        
        if not character_assoc.video_path:
            return False, "No character-specific video exists."
        
        # Delete video file
        video_path = self.get_character_video_file_path(storyline_id, character_id)
        if os.path.exists(video_path):
            os.remove(video_path)
        
        # Delete thumbnail file
        thumbnail_path = self.get_character_thumbnail_path(storyline_id, character_id)
        if os.path.exists(thumbnail_path):
            os.remove(thumbnail_path)
        
        # Update database
        character_assoc.video_path = None
        character_assoc.video_duration = None
        character_assoc.video_thumbnail = None
        character_assoc.video_uploaded_at = None
        
        await db.commit()
        
        return True, ""

    async def get_video_status_for_storyline(
        self,
        db: AsyncSession,
        storyline_id: str,
    ) -> Tuple[Optional[CharacterVideoListResponse], str]:
        """
        Get video upload status for all characters in a storyline.
        
        Property 2: Character Video Status Consistency
        *For any* storyline with N assigned characters, querying video status
        SHALL return exactly N status entries, each correctly reflecting
        whether a video has been uploaded.
        
        Requirements 1.3, 4.2
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            
        Returns:
            Tuple of (CharacterVideoListResponse or None, error_message)
        """
        # Get storyline with character associations
        result = await db.execute(
            select(StorylineDB)
            .where(StorylineDB.id == storyline_id)
            .options(selectinload(StorylineDB.storyline_characters))
        )
        storyline = result.scalar_one_or_none()
        
        if storyline is None:
            return None, "Storyline not found."
        
        # Get character details for each association
        character_statuses: List[CharacterVideoStatus] = []
        
        for assoc in storyline.storyline_characters:
            # Get character info
            char_result = await db.execute(
                select(CharacterDB).where(CharacterDB.id == assoc.character_id)
            )
            character = char_result.scalar_one_or_none()
            
            if character is None:
                continue
            
            status = CharacterVideoStatus(
                character_id=assoc.character_id,
                character_name=character.name,
                character_thumbnail=character.thumbnail_path,
                has_video=assoc.video_path is not None,
                video_path=assoc.video_path,
                video_duration=assoc.video_duration,
                video_thumbnail=assoc.video_thumbnail,
                uploaded_at=assoc.video_uploaded_at,
            )
            character_statuses.append(status)
        
        # Sort by display order
        character_statuses.sort(
            key=lambda s: next(
                (a.display_order for a in storyline.storyline_characters 
                 if a.character_id == s.character_id),
                0
            )
        )
        
        return CharacterVideoListResponse(
            storyline_id=storyline_id,
            base_video_duration=storyline.video_duration,
            characters=character_statuses,
        ), ""

    async def delete_all_character_videos_for_storyline(
        self,
        db: AsyncSession,
        storyline_id: str,
    ) -> Tuple[bool, List[str]]:
        """
        Delete all character-specific videos for a storyline.
        
        Property 7: Storyline Cascade Delete
        *For any* storyline deletion, all associated character-video records
        and their video files SHALL be deleted.
        
        Requirements 5.3
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            
        Returns:
            Tuple of (success, list of deleted file paths)
        """
        deleted_files: List[str] = []
        
        # Get all character associations for this storyline
        result = await db.execute(
            select(StorylineCharacterDB)
            .where(StorylineCharacterDB.storyline_id == storyline_id)
        )
        associations = result.scalars().all()
        
        for assoc in associations:
            if assoc.video_path:
                # Delete video file
                video_path = self.get_character_video_file_path(storyline_id, assoc.character_id)
                if os.path.exists(video_path):
                    os.remove(video_path)
                    deleted_files.append(video_path)
                
                # Delete thumbnail file
                thumbnail_path = self.get_character_thumbnail_path(storyline_id, assoc.character_id)
                if os.path.exists(thumbnail_path):
                    os.remove(thumbnail_path)
                    deleted_files.append(thumbnail_path)
        
        # Delete the videos directory if empty
        videos_dir = self.get_storyline_videos_dir(storyline_id)
        if os.path.exists(videos_dir) and not os.listdir(videos_dir):
            os.rmdir(videos_dir)
        
        return True, deleted_files

    async def delete_character_video_on_removal(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: str,
    ) -> Tuple[bool, str]:
        """
        Delete character video when character is removed from storyline.
        
        Property 3: Cascade Delete on Character Removal
        *For any* storyline-character association with an uploaded video,
        removing the character from the storyline SHALL result in the
        video file being deleted from the file system.
        
        Requirements 1.4
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            Tuple of (success, error_message)
        """
        # Delete video file if it exists
        video_path = self.get_character_video_file_path(storyline_id, character_id)
        if os.path.exists(video_path):
            os.remove(video_path)
        
        # Delete thumbnail file if it exists
        thumbnail_path = self.get_character_thumbnail_path(storyline_id, character_id)
        if os.path.exists(thumbnail_path):
            os.remove(thumbnail_path)
        
        return True, ""

    async def delete_all_videos_for_character(
        self,
        db: AsyncSession,
        character_id: str,
    ) -> Tuple[bool, List[str]]:
        """
        Delete all character-specific videos for a character across all storylines.
        
        Property 8: Character Cascade Delete
        *For any* character deletion, all video associations for that character
        across all storylines SHALL be removed.
        
        Requirements 5.4
        
        Args:
            db: Database session
            character_id: The character ID
            
        Returns:
            Tuple of (success, list of deleted file paths)
        """
        deleted_files: List[str] = []
        
        # Get all storyline associations for this character
        result = await db.execute(
            select(StorylineCharacterDB)
            .where(StorylineCharacterDB.character_id == character_id)
        )
        associations = result.scalars().all()
        
        for assoc in associations:
            if assoc.video_path:
                # Delete video file
                video_path = self.get_character_video_file_path(assoc.storyline_id, character_id)
                if os.path.exists(video_path):
                    os.remove(video_path)
                    deleted_files.append(video_path)
                
                # Delete thumbnail file
                thumbnail_path = self.get_character_thumbnail_path(assoc.storyline_id, character_id)
                if os.path.exists(thumbnail_path):
                    os.remove(thumbnail_path)
                    deleted_files.append(thumbnail_path)
                
                # Clear video fields in database
                assoc.video_path = None
                assoc.video_duration = None
                assoc.video_thumbnail = None
                assoc.video_uploaded_at = None
        
        await db.commit()
        return True, deleted_files


    # Character Video Segments Methods
    
    async def get_character_video_segments(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: str,
    ) -> List[dict]:
        """
        Get segments for a character-specific video.
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            character_id: The character ID
            
        Returns:
            List of segment dictionaries
        """
        from ...models.admin.storyline import CharacterVideoSegmentDB
        
        # Get the storyline-character association
        result = await db.execute(
            select(StorylineCharacterDB)
            .where(
                StorylineCharacterDB.storyline_id == storyline_id,
                StorylineCharacterDB.character_id == character_id
            )
            .options(selectinload(StorylineCharacterDB.segments))
        )
        assoc = result.scalar_one_or_none()
        
        if not assoc:
            return []
        
        segments = []
        for seg in sorted(assoc.segments, key=lambda x: x.index):
            segments.append({
                "id": str(seg.id),
                "index": seg.index,
                "start_time": seg.start_time,
                "duration": seg.duration,
                "path_type": seg.path_type,
                "offset_start": [seg.offset_start_x, seg.offset_start_y],
                "offset_end": [seg.offset_end_x, seg.offset_end_y],
                "entry_animation": {
                    "type": seg.entry_type or "instant",
                    "duration": seg.entry_duration or 1.0,
                    "delay": seg.entry_delay or 0.0,
                },
                "exit_animation": {
                    "type": seg.exit_type or "instant",
                    "duration": seg.exit_duration or 1.0,
                    "delay": seg.exit_delay or 0.0,
                },
                "guidance_text": seg.guidance_text or "",
                "guidance_text_en": seg.guidance_text_en or "",
                "guidance_image": seg.guidance_image,
            })
        
        return segments

    async def update_character_video_segments(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: str,
        segments: List,
    ) -> Tuple[bool, str]:
        """
        Update segments for a character-specific video.
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            character_id: The character ID
            segments: List of TimelineSegment objects
            
        Returns:
            Tuple of (success, error_message)
        """
        from ...models.admin.storyline import CharacterVideoSegmentDB, AnimationType
        from sqlalchemy import delete
        
        # Get the storyline-character association
        result = await db.execute(
            select(StorylineCharacterDB)
            .where(
                StorylineCharacterDB.storyline_id == storyline_id,
                StorylineCharacterDB.character_id == character_id
            )
        )
        assoc = result.scalar_one_or_none()
        
        if not assoc:
            return False, "Character not associated with this storyline"
        
        if not assoc.video_path:
            return False, "Character video not uploaded yet"
        
        # Delete existing segments
        await db.execute(
            delete(CharacterVideoSegmentDB)
            .where(CharacterVideoSegmentDB.storyline_character_id == assoc.id)
        )
        
        # Add new segments
        for seg in segments:
            new_segment = CharacterVideoSegmentDB(
                storyline_character_id=assoc.id,
                index=seg.index,
                start_time=seg.start_time,
                duration=seg.duration,
                path_type=seg.path_type,
                offset_start_x=seg.offset_start[0],
                offset_start_y=seg.offset_start[1],
                offset_end_x=seg.offset_end[0],
                offset_end_y=seg.offset_end[1],
                entry_type=seg.entry_animation.type.value if hasattr(seg.entry_animation.type, 'value') else seg.entry_animation.type,
                entry_duration=seg.entry_animation.duration,
                entry_delay=seg.entry_animation.delay,
                exit_type=seg.exit_animation.type.value if hasattr(seg.exit_animation.type, 'value') else seg.exit_animation.type,
                exit_duration=seg.exit_animation.duration,
                exit_delay=seg.exit_animation.delay,
                guidance_text=seg.guidance_text or "",
                guidance_text_en=seg.guidance_text_en or "",
                guidance_image=seg.guidance_image,
            )
            db.add(new_segment)
        
        await db.commit()
        return True, ""

    async def delete_character_video_segment(
        self,
        db: AsyncSession,
        storyline_id: str,
        character_id: str,
        segment_index: int,
    ) -> Tuple[bool, str]:
        """
        Delete a segment from a character-specific video.
        
        Args:
            db: Database session
            storyline_id: The storyline ID
            character_id: The character ID
            segment_index: Index of segment to delete
            
        Returns:
            Tuple of (success, error_message)
        """
        from ...models.admin.storyline import CharacterVideoSegmentDB
        
        # Get the storyline-character association
        result = await db.execute(
            select(StorylineCharacterDB)
            .where(
                StorylineCharacterDB.storyline_id == storyline_id,
                StorylineCharacterDB.character_id == character_id
            )
            .options(selectinload(StorylineCharacterDB.segments))
        )
        assoc = result.scalar_one_or_none()
        
        if not assoc:
            return False, "Character not associated with this storyline"
        
        # Find and delete the segment
        segment_to_delete = None
        for seg in assoc.segments:
            if seg.index == segment_index:
                segment_to_delete = seg
                break
        
        if not segment_to_delete:
            return False, f"Segment with index {segment_index} not found"
        
        await db.delete(segment_to_delete)
        
        # Re-index remaining segments
        remaining = [s for s in assoc.segments if s.index != segment_index]
        remaining.sort(key=lambda s: s.start_time)
        for i, seg in enumerate(remaining):
            seg.index = i
        
        await db.commit()
        return True, ""


# Singleton instance
character_video_service = CharacterVideoService()
