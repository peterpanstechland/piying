"""
Public storyline API endpoints for frontend.
Returns only published storylines with cover images, synopsis, and character options.
Requirements 10.1, 10.2, 10.3
"""
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
)
from ..services.admin.storyline_service import storyline_service

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
    icon: str = Field(default="📖", description="Emoji icon")
    icon_image: Optional[str] = Field(default=None, description="Icon image path")
    display_order: int = Field(default=0, description="Display order")
    
    # Video info
    video_duration: float = Field(default=0.0, description="Video duration in seconds")
    
    # Cover image
    cover_image: Optional[CoverImage] = Field(default=None, description="Cover image paths")
    
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
    icon: str = "📖"
    icon_image: Optional[str] = None
    display_order: int = 0
    video_duration: float = 0.0
    cover_image: Optional[CoverImage] = None
    character_count: int = 0
    segment_count: int = 0

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
            icon=storyline.icon or "📖",
            icon_image=storyline.icon_image,
            display_order=storyline.display_order or 0,
            video_duration=storyline.video_duration or 0.0,
            cover_image=cover_image,
            character_count=len(storyline.storyline_characters) if storyline.storyline_characters else 0,
            segment_count=len(storyline.segments) if storyline.segments else 0,
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
        for seg in sorted(storyline.segments, key=lambda x: x.index):
            segments.append(PublicSegmentInfo(
                index=seg.index,
                duration=seg.duration,
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
        icon=storyline.icon or "📖",
        icon_image=storyline.icon_image,
        display_order=storyline.display_order or 0,
        video_duration=storyline.video_duration or 0.0,
        cover_image=cover_image,
        characters=characters,
        segments=segments,
    )
