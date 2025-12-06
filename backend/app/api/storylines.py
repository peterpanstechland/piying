"""
Public storyline API endpoints for frontend.
Returns only published storylines with cover images, synopsis, and character options.
Requirements 10.1, 10.2, 10.3
"""
import logging
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from ..database import get_db
from ..models.admin.storyline import (
    StorylineStatus,
    CoverImage,
    TimelineSegment,
    AnimationConfig,
    AnimationType,
    CharacterVideoPathResponse,
)
from ..services.admin.storyline_service import storyline_service
from ..services.admin.character_video_service import character_video_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storylines", tags=["Public Storylines"])


# Pydantic models for public API responses

class PublicCharacterOption(BaseModel):
    """Character option for storyline selection."""
    id: str = Field(..., description="Character ID")
    name: str = Field(..., description="Character name")
    thumbnail_path: Optional[str] = Field(default=None, description="Thumbnail image path")
    is_default: bool = Field(default=False, description="Whether this is the default character")
    display_order: int = Field(default=0, description="Display order")

    class Config:
        from_attributes = True


class PublicSegmentInfo(BaseModel):
    """Simplified segment info for public API."""
    index: int = Field(..., description="Segment index")
    duration: float = Field(..., description="Duration in seconds")
    start_time: float = Field(default=0.0, description="Start time in video")
    path_type: str = Field(default="static", description="Movement type")
    offset_start: List[float] = Field(default_factory=lambda: [0.1, 0.5], description="Start offset [x, y]")
    offset_end: List[float] = Field(default_factory=lambda: [0.9, 0.5], description="End offset [x, y]")
    path_waypoints: Optional[List[List[float]]] = Field(default=None, description="Path waypoints")
    path_draw_type: str = Field(default="linear", description="Path draw type")
    entry_type: str = Field(default="instant", description="Entry animation type")
    entry_duration: float = Field(default=1.0, description="Entry duration")
    entry_delay: float = Field(default=0.0, description="Entry delay")
    exit_type: str = Field(default="instant", description="Exit animation type")
    exit_duration: float = Field(default=1.0, description="Exit duration")
    exit_delay: float = Field(default=0.0, description="Exit delay")
    play_audio: bool = Field(default=False, description="Play audio")
    scale_mode: str = Field(default="auto", description="Scale mode")
    scale_start: float = Field(default=1.0, description="Start scale")
    scale_end: float = Field(default=1.0, description="End scale")
    guidance_text: str = Field(default="", description="Guidance text (Chinese)")
    guidance_text_en: str = Field(default="", description="Guidance text (English)")
    guidance_image: Optional[str] = Field(default=None, description="Guidance image path")

    class Config:
        from_attributes = True


class PublicStorylineResponse(BaseModel):
    """
    Public storyline response for frontend scene selection.
    Requirements 10.1, 10.2, 10.3
    """
    id: str = Field(..., description="Storyline ID")
    name: str = Field(..., description="Storyline name (Chinese)")
    name_en: str = Field(default="", description="Storyline name (English)")
    synopsis: str = Field(default="", description="Story synopsis (Chinese)")
    synopsis_en: str = Field(default="", description="Story synopsis (English)")
    description: str = Field(default="", description="Short description (Chinese)")
    description_en: str = Field(default="", description="Short description (English)")
    icon: str = Field(default="⛏️", description="Emoji icon")
    icon_image: Optional[str] = Field(default=None, description="Icon image path")
    display_order: int = Field(default=0, description="Display order")
    
    # Video info
    video_duration: float = Field(default=0.0, description="Video duration in seconds")
    
    # Cover image
    cover_image: Optional[CoverImage] = Field(default=None, description="Cover image paths")
    
    # Character and segment counts
    character_count: int = Field(default=0, description="Number of available characters")
    segment_count: int = Field(default=0, description="Number of segments in this storyline")
    
    # Character options
    characters: List[PublicCharacterOption] = Field(
        default_factory=list, 
        description="Available characters for this storyline"
    )
    
    # Segment info (simplified)
    segments: List[PublicSegmentInfo] = Field(
        default_factory=list,
        description="Segment information"
    )

    class Config:
        from_attributes = True


class PublicStorylineListResponse(BaseModel):
    """
    Simplified storyline list response for frontend.
    Requirements 10.1, 10.2, 10.3
    """
    id: str
    name: str
    name_en: str = ""
    synopsis: str = ""
    synopsis_en: str = ""
    icon: str = "⛏️"
    icon_image: Optional[str] = None
    display_order: int = 0
    video_duration: float = 0.0
    cover_image: Optional[CoverImage] = None
    character_count: int = 0
    segment_count: int = 0
    enabled: bool = True  # Whether storyline is enabled for user selection

    class Config:
        from_attributes = True


@router.get("", response_model=List[PublicStorylineListResponse])
async def list_published_storylines(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[PublicStorylineListResponse]:
    """
    List all published storylines for frontend scene selection.
    
    Requirements 10.1, 10.2, 10.3:
    - Returns only published storylines (status = 'published')
    - Includes cover images, synopsis
    - Sorted by display_order ascending
    
    This endpoint is public and does not require authentication.
    """
    storylines = await storyline_service.get_published_storylines(db)
    
    result = []
    for storyline in storylines:
        # Build cover image if available
        cover_image = None
        if storyline.cover_original or storyline.cover_thumbnail:
            cover_image = CoverImage(
                original_path=storyline.cover_original,
                thumbnail_path=storyline.cover_thumbnail,
                medium_path=storyline.cover_medium,
                large_path=storyline.cover_large,
            )
        
        result.append(PublicStorylineListResponse(
            id=storyline.id,
            name=storyline.name,
            name_en=storyline.name_en or "",
            synopsis=storyline.synopsis or "",
            synopsis_en=storyline.synopsis_en or "",
            icon=storyline.icon or "⛏️",
            icon_image=storyline.icon_image,
            display_order=storyline.display_order or 0,
            video_duration=storyline.video_duration or 0.0,
            cover_image=cover_image,
            character_count=len(storyline.storyline_characters) if storyline.storyline_characters else 0,
            segment_count=len(storyline.segments) if storyline.segments else 0,
            enabled=storyline.enabled if storyline.enabled is not None else True,
        ))
    
    return result


@router.get("/{storyline_id}", response_model=PublicStorylineResponse)
async def get_published_storyline(
    storyline_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicStorylineResponse:
    """
    Get a published storyline by ID with full details.
    
    Requirements 10.1, 10.2:
    - Returns storyline only if status is 'published'
    - Includes cover images, synopsis, character options
    
    This endpoint is public and does not require authentication.
    """
    from ..models.admin.character import CharacterDB
    from sqlalchemy import select
    
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Check if storyline is published
    if storyline.status != StorylineStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Build cover image if available
    cover_image = None
    if storyline.cover_original or storyline.cover_thumbnail:
        cover_image = CoverImage(
            original_path=storyline.cover_original,
            thumbnail_path=storyline.cover_thumbnail,
            medium_path=storyline.cover_medium,
            large_path=storyline.cover_large,
        )
    
    # Build character options from storyline_characters
    characters = []
    if storyline.storyline_characters:
        # Get character details for each storyline character
        character_ids = [sc.character_id for sc in storyline.storyline_characters]
        if character_ids:
            result = await db.execute(
                select(CharacterDB).where(CharacterDB.id.in_(character_ids))
            )
            character_map = {c.id: c for c in result.scalars().all()}
            
            for sc in sorted(storyline.storyline_characters, key=lambda x: x.display_order):
                char = character_map.get(sc.character_id)
                if char:
                    characters.append(PublicCharacterOption(
                        id=char.id,
                        name=char.name,
                        thumbnail_path=char.thumbnail_path,
                        is_default=bool(sc.is_default),
                        display_order=sc.display_order,
                    ))
    
    # Build simplified segment info
    segments = []
    if storyline.segments:
        import json as json_module
        for seg in sorted(storyline.segments, key=lambda x: x.index):
            # Parse waypoints if available
            waypoints = []
            if seg.path_waypoints:
                try:
                    waypoints = json_module.loads(seg.path_waypoints) if isinstance(seg.path_waypoints, str) else seg.path_waypoints
                except (json_module.JSONDecodeError, TypeError):
                    waypoints = []

            segments.append(PublicSegmentInfo(
                index=seg.index,
                duration=seg.duration,
                start_time=seg.start_time or 0.0,
                path_type=seg.path_type or "static",
                offset_start=[float(seg.offset_start_x or 0.5), float(seg.offset_start_y or 0.5)],
                offset_end=[float(seg.offset_end_x or 0.5), float(seg.offset_end_y or 0.5)],
                path_waypoints=waypoints,
                path_draw_type=getattr(seg, 'path_draw_type', 'linear') or 'linear',
                entry_type=seg.entry_type or "instant",
                entry_duration=seg.entry_duration or 1.0,
                entry_delay=seg.entry_delay or 0.0,
                exit_type=seg.exit_type or "instant",
                exit_duration=seg.exit_duration or 1.0,
                exit_delay=seg.exit_delay or 0.0,
                play_audio=getattr(seg, 'play_audio', False),
                scale_mode=getattr(seg, 'scale_mode', 'auto') or 'auto',
                scale_start=getattr(seg, 'scale_start', 1.0) or 1.0,
                scale_end=getattr(seg, 'scale_end', 1.0) or 1.0,
                guidance_text=seg.guidance_text or "",
                guidance_text_en=seg.guidance_text_en or "",
                guidance_image=seg.guidance_image,
            ))
    
    return PublicStorylineResponse(
        id=storyline.id,
        name=storyline.name,
        name_en=storyline.name_en or "",
        synopsis=storyline.synopsis or "",
        synopsis_en=storyline.synopsis_en or "",
        description=storyline.description or "",
        description_en=storyline.description_en or "",
        icon=storyline.icon or "⛏️",
        icon_image=storyline.icon_image,
        display_order=storyline.display_order or 0,
        video_duration=storyline.video_duration or 0.0,
        cover_image=cover_image,
        character_count=len(characters),
        segment_count=len(segments),
        characters=characters,
        segments=segments,
    )



@router.get("/{storyline_id}/video/file")
async def get_storyline_video_file(
    storyline_id: str,
    character_id: Optional[str] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """
    Get the actual video file for a storyline (with optional character-specific video).
    
    This endpoint serves the video file itself, not just the path.
    Used by the frontend to display background video during recording.
    
    Args:
        storyline_id: The storyline ID
        character_id: Optional character ID for character-specific video
    
    Returns:
        FileResponse with the video file
    
    Raises:
        404: Storyline not found or video not available
    """
    import os
    from fastapi.responses import FileResponse
    
    # Get storyline
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Check if storyline is published
    if storyline.status != StorylineStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Determine which video to serve
    video_path = None
    
    if character_id:
        # Try to get character-specific video
        character_video_path = await character_video_service.get_character_video_path(
            db, storyline_id, character_id
        )
        if character_video_path:
            video_path = character_video_path
    
    # Fall back to base video if no character-specific video
    if not video_path:
        video_path = storyline.base_video_path
    
    if not video_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No video available for this storyline",
        )
    
    # Build full path - data directory is at backend/data
    # __file__ is at backend/app/api/storylines.py
    # We need to go up to backend/ then into data/
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))  # backend/
    data_dir = os.path.join(backend_dir, "data")
    full_path = os.path.join(data_dir, video_path)
    
    # Debug logging
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Video path resolution: video_path={video_path}, data_dir={data_dir}, full_path={full_path}, exists={os.path.exists(full_path)}")
    
    if not os.path.exists(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video file not found on disk: {full_path}",
        )
    
    # Serve video file
    return FileResponse(
        full_path,
        media_type="video/mp4",
        filename=os.path.basename(full_path),
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/{storyline_id}/characters/{character_id}/segments")
async def get_character_video_segments(
    storyline_id: str,
    character_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Get segment configuration for a character-specific video.
    
    This endpoint returns the character's own segment configuration if it exists,
    otherwise returns the base storyline segments.
    
    Requirements 3.2, 3.3:
    - Returns character-specific segments if they exist
    - Falls back to storyline's base segments if no specific segments exist
    
    This endpoint is public and does not require authentication.
    It is used by the frontend to get the correct segment count and configuration
    when a character is selected.
    
    Args:
        storyline_id: The storyline ID
        character_id: The character ID
    
    Returns:
        Dictionary with segment_count and segments array
    
    Raises:
        404: Storyline not found
    """
    from sqlalchemy import select
    from ..models.admin.storyline import StorylineCharacterDB, CharacterVideoSegmentDB
    
    # Get storyline to verify it exists
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Check if storyline is published
    if storyline.status != StorylineStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    segments = []
    
    # Try to get character-specific video segments
    try:
        from sqlalchemy.orm import selectinload
        
        logger.info(f"[CharacterSegments] Querying character-specific segments for storyline={storyline_id}, character={character_id}")
        
        result = await db.execute(
            select(StorylineCharacterDB)
            .options(selectinload(StorylineCharacterDB.segments))
            .where(
                (StorylineCharacterDB.storyline_id == storyline_id) &
                (StorylineCharacterDB.character_id == character_id)
            )
        )
        storyline_character = result.scalar_one_or_none()
        
        if storyline_character:
            logger.info(f"[CharacterSegments] Found storyline_character association, segments count: {len(storyline_character.segments) if storyline_character.segments else 0}")
        else:
            logger.info(f"[CharacterSegments] No storyline_character association found")
        
        if storyline_character and storyline_character.segments:
            # Use character-specific segments
            import json
            logger.info(f"[CharacterSegments] Using character-specific segments: {len(storyline_character.segments)} segments")
            for seg in sorted(storyline_character.segments, key=lambda x: x.index):
                # Parse waypoints from JSON string if available
                waypoints = []
                if seg.path_waypoints:
                    try:
                        waypoints = json.loads(seg.path_waypoints)
                    except:
                        waypoints = []
                
                segments.append({
                    "index": seg.index,
                    "start_time": seg.start_time or 0.0,  # 片段在视频中的起始时间
                    "duration": seg.duration,
                    "path_type": seg.path_type or "static",
                    "offset_start": [float(seg.offset_start_x or 0.5), float(seg.offset_start_y or 0.5)],
                    "offset_end": [float(seg.offset_end_x or 0.5), float(seg.offset_end_y or 0.5)],
                    "path_waypoints": waypoints,
                    "path_draw_type": getattr(seg, 'path_draw_type', 'linear') or 'linear',
                    "entry_type": seg.entry_type or "instant",
                    "entry_duration": seg.entry_duration or 1.0,
                    "entry_delay": seg.entry_delay or 0.0,
                    "exit_type": seg.exit_type or "instant",
                    "exit_duration": seg.exit_duration or 1.0,
                    "exit_delay": seg.exit_delay or 0.0,
                    "guidance_text": getattr(seg, 'guidance_text', None),
                    "guidance_text_en": getattr(seg, 'guidance_text_en', None),
                    "play_audio": getattr(seg, 'play_audio', False),
                    # Scale configuration
                    "scale_mode": getattr(seg, 'scale_mode', 'auto') or 'auto',
                    "scale_start": getattr(seg, 'scale_start', 1.0) or 1.0,
                    "scale_end": getattr(seg, 'scale_end', 1.0) or 1.0,
                })
            logger.info(f"[CharacterSegments] Character-specific segments loaded: {len(segments)} segments")
    except Exception as e:
        logger.warning(f"[CharacterSegments] Failed to load character-specific segments: {e}")
    
    # If no character-specific segments, use base storyline segments
    if not segments and storyline.segments:
        import json as json_module
        logger.info(f"[CharacterSegments] No character-specific segments, using base storyline segments: {len(storyline.segments)} segments")
        for seg in sorted(storyline.segments, key=lambda x: x.index):
            # Parse waypoints if available
            waypoints = []
            if seg.path_waypoints:
                try:
                    waypoints = json_module.loads(seg.path_waypoints) if isinstance(seg.path_waypoints, str) else seg.path_waypoints
                except (json_module.JSONDecodeError, TypeError):
                    waypoints = []
            
            segments.append({
                "index": seg.index,
                "start_time": seg.start_time or 0.0,  # 片段在视频中的起始时间
                "duration": seg.duration,
                "path_type": seg.path_type or "static",
                "offset_start": [float(seg.offset_start_x or 0.5), float(seg.offset_start_y or 0.5)],
                "offset_end": [float(seg.offset_end_x or 0.5), float(seg.offset_end_y or 0.5)],
                "path_waypoints": waypoints,
                "path_draw_type": getattr(seg, 'path_draw_type', 'linear') or 'linear',
                "entry_type": seg.entry_type or "instant",
                "entry_duration": seg.entry_duration or 1.0,
                "entry_delay": seg.entry_delay or 0.0,
                "exit_type": seg.exit_type or "instant",
                "exit_duration": seg.exit_duration or 1.0,
                "exit_delay": seg.exit_delay or 0.0,
                "guidance_text": seg.guidance_text,
                "guidance_text_en": seg.guidance_text_en,
                "play_audio": getattr(seg, 'play_audio', False),
                # Scale configuration
                "scale_mode": getattr(seg, 'scale_mode', 'auto') or 'auto',
                "scale_start": getattr(seg, 'scale_start', 1.0) or 1.0,
                "scale_end": getattr(seg, 'scale_end', 1.0) or 1.0,
            })
        logger.info(f"[CharacterSegments] Base storyline segments loaded: {len(segments)} segments")
    
    result = {
        "storyline_id": storyline_id,
        "character_id": character_id,
        "segment_count": len(segments),
        "segments": segments,
    }
    
    logger.info(f"[CharacterSegments] Returning result: segment_count={result['segment_count']}")
    
    return result


@router.get("/{storyline_id}/video", response_model=CharacterVideoPathResponse)
async def get_character_video_path(
    storyline_id: str,
    character_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CharacterVideoPathResponse:
    """
    Get the video path for a character in a storyline.
    
    Property 4: Video Path Resolution
    *For any* character selection in a storyline, the resolved video path
    SHALL be the character-specific video path if it exists, otherwise
    the storyline's base video path.
    
    Requirements 3.2, 3.3:
    - Returns character-specific video path if it exists
    - Falls back to storyline's base video if no specific video exists
    
    This endpoint is public and does not require authentication.
    It is used by the frontend when a user selects a character.
    
    Args:
        storyline_id: The storyline ID
        character_id: The character ID
    
    Returns:
        CharacterVideoPathResponse with resolved video path
    
    Raises:
        404: Storyline not found
    """
    # Get storyline to verify it exists and get base video path
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Check if storyline is published
    if storyline.status != StorylineStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Get character-specific video path
    character_video_path = await character_video_service.get_character_video_path(
        db, storyline_id, character_id
    )
    
    # Determine which video path to use
    if character_video_path:
        return CharacterVideoPathResponse(
            storyline_id=storyline_id,
            character_id=character_id,
            video_path=character_video_path,
            is_character_specific=True,
        )
    else:
        # Fall back to base video
        base_video_path = storyline.base_video_path or ""
        return CharacterVideoPathResponse(
            storyline_id=storyline_id,
            character_id=character_id,
            video_path=base_video_path,
            is_character_specific=False,
        )


@router.get("/{storyline_id}/cover/{size}")
async def get_storyline_cover_image(
    storyline_id: str,
    size: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get cover image file by size for a published storyline.
    
    This is a public endpoint that allows the frontend to load cover images
    for display in scene selection UI.
    
    Args:
        storyline_id: Storyline ID
        size: Image size - 'thumbnail', 'medium', 'large', or 'original'
    
    Returns:
        FileResponse with the cover image
    
    Raises:
        404: Storyline not found or cover image not available
    """
    import os
    from fastapi.responses import FileResponse
    
    # Get storyline to verify it exists and is published
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Check if storyline is published
    if storyline.status != StorylineStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Get the appropriate cover path based on size
    cover_path = None
    if size == "thumbnail":
        cover_path = getattr(storyline, 'cover_thumbnail', None)
    elif size == "medium":
        cover_path = getattr(storyline, 'cover_medium', None)
    elif size == "large":
        cover_path = getattr(storyline, 'cover_large', None)
    elif size == "original":
        cover_path = getattr(storyline, 'cover_original', None)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid size: {size}. Must be 'thumbnail', 'medium', 'large', or 'original'",
        )
    
    if not cover_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cover image ({size}) not found for storyline",
        )
    
    # Build full path - data directory is at backend/data
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    data_dir = os.path.join(backend_dir, "data")
    full_path = os.path.join(data_dir, cover_path)
    
    if not os.path.exists(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cover image file not found on disk",
        )
    
    # Determine media type based on file extension
    ext = os.path.splitext(full_path)[1].lower()
    media_type = "image/jpeg"
    if ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"
    
    return FileResponse(
        full_path,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=3600",
        }
    )
