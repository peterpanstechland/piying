"""
Storyline management API endpoints for admin panel.
Handles storyline CRUD operations, video uploads, and segment configuration.
"""
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models.admin.storyline import (
    StorylineCreate,
    StorylineUpdate,
    StorylineResponse,
    StorylineListResponse,
    SegmentConfigUpdate,
    VideoUploadResponse,
)
from ...models.admin import TokenPayload
from ...services.admin.storyline_service import storyline_service
from .auth import get_current_user

router = APIRouter(prefix="/api/admin/storylines", tags=["Admin Storyline Management"])


@router.get("", response_model=List[StorylineListResponse])
async def list_storylines(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[StorylineListResponse]:
    """
    List all storylines with their bound character and segment count.
    
    Returns a list of all storylines with basic info.
    """
    storylines = await storyline_service.get_all_storylines(db)
    return [storyline_service.to_storyline_list_response(s) for s in storylines]


@router.post("", response_model=StorylineResponse, status_code=status.HTTP_201_CREATED)
async def create_storyline(
    storyline_data: StorylineCreate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StorylineResponse:
    """
    Create a new storyline.
    
    - **name**: Display name for the storyline (Chinese)
    - **name_en**: Display name (English, optional)
    - **description**: Description (Chinese, optional)
    - **description_en**: Description (English, optional)
    - **icon**: Emoji icon (optional, defaults to ⛏️)
    - **character_id**: Character to bind (optional)
    
    Creates a new storyline with a unique ID. Background video must be uploaded separately.
    """
    storyline = await storyline_service.create_storyline(db, storyline_data)
    return storyline_service.to_storyline_response(storyline)



@router.get("/{storyline_id}", response_model=StorylineResponse)
async def get_storyline(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StorylineResponse:
    """
    Get storyline details by ID.
    
    Returns complete storyline information including segments.
    """
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    return storyline_service.to_storyline_response(storyline)


@router.put("/{storyline_id}", response_model=StorylineResponse)
async def update_storyline(
    storyline_id: str,
    update_data: StorylineUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StorylineResponse:
    """
    Update a storyline's basic information.
    
    - **name**: New display name (Chinese, optional)
    - **name_en**: New display name (English, optional)
    - **description**: New description (Chinese, optional)
    - **description_en**: New description (English, optional)
    - **icon**: New emoji icon (optional)
    - **character_id**: New character binding (optional)
    """
    storyline = await storyline_service.update_storyline(db, storyline_id, update_data)
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    return storyline_service.to_storyline_response(storyline)


@router.delete("/{storyline_id}", status_code=status.HTTP_200_OK)
async def delete_storyline(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Delete a storyline by ID.
    
    Deletes the storyline and all associated files (video, segments, images).
    """
    success, error = await storyline_service.delete_storyline(db, storyline_id)
    if not success:
        if "not found" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error,
            )
    return {"message": f"Storyline '{storyline_id}' deleted successfully"}


@router.post("/{storyline_id}/video", response_model=VideoUploadResponse)
async def upload_storyline_video(
    storyline_id: str,
    file: UploadFile = File(..., description="MP4 video file with H.264 codec"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> VideoUploadResponse:
    """
    Upload a background video for a storyline.
    
    - **file**: MP4 video file with H.264 codec
    
    Validates the video format and extracts duration information.
    """
    # Validate file type
    if not file.filename.lower().endswith('.mp4'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video must be MP4 format",
        )
    
    # Read file content
    file_content = await file.read()
    
    # Upload and validate video
    video_path, duration, error = await storyline_service.upload_video(
        db, storyline_id, file_content, file.filename
    )
    
    if video_path is None:
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
    
    return VideoUploadResponse(
        video_path=video_path,
        video_duration=duration,
        message="Video uploaded successfully",
    )


@router.put("/{storyline_id}/segments", status_code=status.HTTP_200_OK)
async def update_segment_configuration(
    storyline_id: str,
    segment_config: SegmentConfigUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Update segment configuration for a storyline.
    
    - **segments**: List of 2-4 segment configurations
    
    Each segment should include:
    - index: Segment order (0-based, sequential)
    - duration: Duration in seconds
    - path_type: Movement type (static, enter_left, etc.)
    - offset_start: Starting position offset [x, y]
    - offset_end: Ending position offset [x, y]
    - guidance_text: Chinese guidance text
    - guidance_text_en: English guidance text
    - guidance_image: Path to guidance image (optional)
    
    Validates that total segment duration does not exceed video duration.
    """
    success, error = await storyline_service.update_segments(
        db, storyline_id, segment_config.segments
    )
    
    if not success:
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
    
    return {"message": "Segment configuration updated successfully"}


@router.put("/{storyline_id}/character", status_code=status.HTTP_200_OK)
async def bind_character_to_storyline(
    storyline_id: str,
    character_id: str = None,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Bind a character to a storyline.
    
    - **character_id**: Character ID to bind (or null to unbind)
    """
    success, error = await storyline_service.bind_character(
        db, storyline_id, character_id
    )
    
    if not success:
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
    
    return {"message": "Character binding updated successfully"}


@router.post("/{storyline_id}/icon", status_code=status.HTTP_200_OK)
async def upload_storyline_icon(
    storyline_id: str,
    file: UploadFile = File(..., description="Icon image (PNG, JPG, or GIF)"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Upload an icon image for a storyline.
    
    - **file**: PNG, JPG, or GIF image file
    """
    # Read file content
    file_content = await file.read()
    
    # Upload icon
    icon_path, error = await storyline_service.upload_icon_image(
        db, storyline_id, file_content, file.filename
    )
    
    if icon_path is None:
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
    
    return {"message": "Icon uploaded successfully", "icon_path": icon_path}


@router.post("/{storyline_id}/segments/{segment_index}/guidance-image", status_code=status.HTTP_200_OK)
async def upload_segment_guidance_image(
    storyline_id: str,
    segment_index: int,
    file: UploadFile = File(..., description="Guidance image (PNG or JPG)"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Upload a guidance image for a segment.
    
    - **segment_index**: Index of the segment (0-based)
    - **file**: PNG or JPG image file
    """
    # Read file content
    file_content = await file.read()
    
    # Upload guidance image
    image_path, error = await storyline_service.upload_guidance_image(
        db, storyline_id, segment_index, file_content, file.filename
    )
    
    if image_path is None:
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
    
    return {"message": "Guidance image uploaded successfully", "image_path": image_path}
