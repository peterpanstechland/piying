"""
Character Video API endpoints for admin panel.
Handles character-specific video uploads and management.

Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 4.2, 4.5
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models.admin.storyline import (
    CharacterVideoUpload,
    CharacterVideoStatus,
    CharacterVideoListResponse,
)
from ...models.admin import TokenPayload
from ...services.admin.character_video_service import character_video_service
from .auth import get_current_user

router = APIRouter(
    prefix="/api/admin/storylines",
    tags=["Admin Character Video Management"]
)


@router.post(
    "/{storyline_id}/characters/{character_id}/video",
    response_model=CharacterVideoUpload,
    status_code=status.HTTP_201_CREATED
)
async def upload_character_video(
    storyline_id: str,
    character_id: str,
    file: UploadFile = File(..., description="MP4 video file with H.264 codec"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> CharacterVideoUpload:
    """
    Upload a character-specific background video.
    
    Requirements 2.1, 2.2, 2.3, 2.4, 2.5:
    - Validates video format (MP4, H.264)
    - Validates video duration matches base video (within 1 second tolerance)
    - Generates thumbnail for the video
    - Stores video and updates database association
    
    Args:
        storyline_id: The storyline ID
        character_id: The character ID
        file: MP4 video file
    
    Returns:
        CharacterVideoUpload with video path, duration, and thumbnail
    
    Raises:
        400: Invalid video format or duration mismatch
        404: Storyline or character not found
        413: Video file too large
    """
    # Validate file type
    if not file.filename.lower().endswith('.mp4'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid video format. Only MP4 with H.264 codec is supported.",
        )
    
    # Read file content
    file_content = await file.read()
    
    # Check file size (max 500MB)
    max_size = 500 * 1024 * 1024  # 500MB
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Video file exceeds maximum size limit (500MB).",
        )
    
    # Upload and validate video
    result, error = await character_video_service.upload_character_video(
        db, storyline_id, character_id, file_content, file.filename
    )
    
    if result is None:
        # Determine appropriate error code
        if "not found" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        elif "duration" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
    
    return result



@router.get(
    "/{storyline_id}/characters/{character_id}/video",
    response_model=CharacterVideoStatus,
    status_code=status.HTTP_200_OK
)
async def get_character_video(
    storyline_id: str,
    character_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> CharacterVideoStatus:
    """
    Get character video information.
    
    Requirements 1.3, 4.2:
    - Returns video status for a specific character in a storyline
    - Includes video path, duration, thumbnail, and upload timestamp
    
    Args:
        storyline_id: The storyline ID
        character_id: The character ID
    
    Returns:
        CharacterVideoStatus with video information
    
    Raises:
        404: Storyline or character not found
    """
    from sqlalchemy import select
    from ...models.admin.storyline import StorylineCharacterDB, StorylineDB
    from ...models.admin.character import CharacterDB
    
    # Get storyline to verify it exists
    result = await db.execute(
        select(StorylineDB).where(StorylineDB.id == storyline_id)
    )
    storyline = result.scalar_one_or_none()
    
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storyline not found.",
        )
    
    # Get character association
    result = await db.execute(
        select(StorylineCharacterDB).where(
            StorylineCharacterDB.storyline_id == storyline_id,
            StorylineCharacterDB.character_id == character_id
        )
    )
    character_assoc = result.scalar_one_or_none()
    
    if character_assoc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character is not assigned to this storyline.",
        )
    
    # Get character details
    result = await db.execute(
        select(CharacterDB).where(CharacterDB.id == character_id)
    )
    character = result.scalar_one_or_none()
    
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found.",
        )
    
    return CharacterVideoStatus(
        character_id=character_id,
        character_name=character.name,
        character_thumbnail=character.thumbnail_path,
        has_video=character_assoc.video_path is not None,
        video_path=character_assoc.video_path,
        video_duration=character_assoc.video_duration,
        video_thumbnail=character_assoc.video_thumbnail,
        uploaded_at=character_assoc.video_uploaded_at,
    )


@router.delete(
    "/{storyline_id}/characters/{character_id}/video",
    status_code=status.HTTP_200_OK
)
async def delete_character_video(
    storyline_id: str,
    character_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Delete a character-specific video.
    
    Requirements 1.4, 4.5:
    - Removes the video file from the file system
    - Resets video fields in the database
    - After deletion, the character will use the storyline's base video
    
    Args:
        storyline_id: The storyline ID
        character_id: The character ID
    
    Returns:
        Success message
    
    Raises:
        404: Storyline, character, or video not found
    """
    success, error = await character_video_service.delete_character_video(
        db, storyline_id, character_id
    )
    
    if not success:
        if "not found" in error.lower() or "not assigned" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        elif "no character-specific video" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
    
    return {"message": "Character video deleted successfully"}


@router.get(
    "/{storyline_id}/character-videos",
    response_model=CharacterVideoListResponse,
    status_code=status.HTTP_200_OK
)
async def list_character_videos(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> CharacterVideoListResponse:
    """
    List all character video statuses for a storyline.
    
    Requirements 1.3, 4.2:
    - Returns video status for all characters assigned to the storyline
    - Each status includes whether a video has been uploaded
    - Includes base video duration for validation reference
    
    Property 2: Character Video Status Consistency
    *For any* storyline with N assigned characters, querying video status
    SHALL return exactly N status entries.
    
    Args:
        storyline_id: The storyline ID
    
    Returns:
        CharacterVideoListResponse with all character video statuses
    
    Raises:
        404: Storyline not found
    """
    result, error = await character_video_service.get_video_status_for_storyline(
        db, storyline_id
    )
    
    if result is None:
        if "not found" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
    
    return result
