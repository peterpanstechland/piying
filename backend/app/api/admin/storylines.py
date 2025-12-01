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
    FrameExtractionResponse,
    StorylineExtendedCreate,
    StorylineExtendedUpdate,
    StorylineExtended,
    StorylineExtendedListResponse,
    TimelineSegment,
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


@router.post("/extended", response_model=StorylineExtended, status_code=status.HTTP_201_CREATED)
async def create_storyline_extended(
    storyline_data: StorylineExtendedCreate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StorylineExtended:
    """
    Create a new storyline with extended fields (Requirements 1.1).
    
    - **name**: Display name for the storyline (Chinese, required)
    - **name_en**: Display name (English, optional)
    - **synopsis**: Story synopsis (Chinese, optional)
    - **synopsis_en**: Story synopsis (English, optional)
    - **description**: Description (Chinese, optional)
    - **description_en**: Description (English, optional)
    - **icon**: Emoji icon (optional, defaults to ⛏️)
    
    Creates a new storyline with status defaulting to 'draft'.
    """
    storyline = await storyline_service.create_storyline_extended(db, storyline_data)
    return storyline_service.to_storyline_extended_response(storyline)


@router.get("/extended/list", response_model=List[StorylineExtendedListResponse])
async def list_storylines_extended(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[StorylineExtendedListResponse]:
    """
    List all storylines with extended fields sorted by display_order (Requirements 10.3).
    
    Returns a list of all storylines with cover images, status, and synopsis.
    """
    storylines = await storyline_service.get_all_storylines_sorted(db)
    return [storyline_service.to_storyline_extended_list_response(s) for s in storylines]


@router.get("/extended/{storyline_id}", response_model=StorylineExtended)
async def get_storyline_extended(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StorylineExtended:
    """
    Get storyline details with extended fields by ID.
    
    Returns complete storyline information including segments, transitions, and character config.
    """
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    return storyline_service.to_storyline_extended_response(storyline)


@router.put("/extended/{storyline_id}", response_model=StorylineExtended)
async def update_storyline_extended(
    storyline_id: str,
    update_data: StorylineExtendedUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StorylineExtended:
    """
    Update a storyline's extended information (Requirements 1.1, 1.5).
    
    - **name**: New display name (Chinese, optional)
    - **name_en**: New display name (English, optional)
    - **synopsis**: New synopsis (Chinese, optional)
    - **synopsis_en**: New synopsis (English, optional)
    - **description**: New description (Chinese, optional)
    - **description_en**: New description (English, optional)
    - **icon**: New emoji icon (optional)
    - **display_order**: New display order (optional)
    """
    storyline = await storyline_service.update_storyline_extended(db, storyline_id, update_data)
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    return storyline_service.to_storyline_extended_response(storyline)


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
    Implements cascade deletion (Requirements 1.4).
    """
    success, error, deleted_files = await storyline_service.delete_storyline(db, storyline_id)
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
    return {
        "message": f"Storyline '{storyline_id}' deleted successfully",
        "deleted_files_count": len(deleted_files)
    }


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


@router.get("/{storyline_id}/video/frame", response_model=FrameExtractionResponse)
async def extract_video_frame(
    storyline_id: str,
    timestamp: float = 0.0,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> FrameExtractionResponse:
    """
    Extract a frame from the storyline's background video at a specific timestamp.
    
    Requirements 9.2, 12.2: Extract frame at specific timestamp.
    
    - **timestamp**: Time in seconds to extract frame from (default: 0.0)
    
    Returns the frame as a base64 encoded JPEG image.
    """
    from ...services.admin.video_processor import video_processor
    import os
    
    # Get storyline
    storyline = await storyline_service.get_storyline_by_id(db, storyline_id)
    if storyline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Storyline with ID '{storyline_id}' not found",
        )
    
    # Check if video exists
    if not storyline.base_video_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Storyline does not have a background video",
        )
    
    # Get full video path
    storyline_dir = storyline_service.get_storyline_dir(storyline_id)
    video_full_path = os.path.join(
        os.path.dirname(os.path.dirname(storyline_dir)),
        storyline.base_video_path
    )
    
    if not os.path.exists(video_full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video file not found on disk",
        )
    
    # Validate timestamp
    if timestamp < 0:
        timestamp = 0
    elif storyline.video_duration > 0 and timestamp > storyline.video_duration:
        timestamp = storyline.video_duration
    
    # Extract frame
    frame_data, error = video_processor.extract_frame(
        video_full_path,
        timestamp,
        output_format="base64"
    )
    
    if frame_data is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extract frame: {error}",
        )
    
    return FrameExtractionResponse(
        frame_data=frame_data,
        timestamp=timestamp,
        format="jpeg",
        message="Frame extracted successfully"
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


@router.put("/{storyline_id}/timeline-segments", status_code=status.HTTP_200_OK)
async def update_timeline_segments(
    storyline_id: str,
    segments: List[TimelineSegment],
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Update timeline segment configuration for a storyline.
    
    Requirements 4.1, 4.2, 4.6: Handle start_time, duration, animation configs,
    validate segment non-overlap, and validate total duration.
    
    - **segments**: List of TimelineSegment configurations
    
    Each segment should include:
    - index: Segment order (0-based)
    - start_time: Start time in seconds
    - duration: Duration in seconds
    - path_type: Movement type (static, enter_left, etc.)
    - entry_animation: Entry animation configuration
    - exit_animation: Exit animation configuration
    - guidance_text: Chinese guidance text
    - guidance_text_en: English guidance text
    - guidance_image: Path to guidance image (optional)
    
    Validates:
    - Segment non-overlap (Property 8)
    - Segment bounds within video (Property 9)
    - Total duration <= video duration (Property 11)
    - Re-indexes segments for continuity (Property 10)
    """
    from ...models.admin.storyline import TimelineSegment as TimelineSegmentModel
    
    success, error = await storyline_service.update_timeline_segments(
        db, storyline_id, segments
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
    
    return {"message": "Timeline segments updated successfully"}


@router.delete("/{storyline_id}/segments/{segment_index}", status_code=status.HTTP_200_OK)
async def delete_segment(
    storyline_id: str,
    segment_index: int,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Delete a segment and re-index remaining segments.
    
    Requirements 4.5: Remove segment and update indices to ensure sequential
    indices from 0 with no gaps.
    
    - **segment_index**: Index of the segment to delete (0-based)
    """
    success, error = await storyline_service.delete_segment(
        db, storyline_id, segment_index
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
    
    return {"message": f"Segment {segment_index} deleted and remaining segments re-indexed"}


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
    
    Requirements 12.1: Upload guidance image for segment.
    
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


@router.post("/{storyline_id}/segments/{segment_index}/capture-guidance", status_code=status.HTTP_200_OK)
async def capture_segment_guidance_from_video(
    storyline_id: str,
    segment_index: int,
    timestamp: float = 0.0,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Capture a video frame and use it as guidance image for a segment.
    
    Requirements 12.2: Capture video frame as guidance image.
    
    - **segment_index**: Index of the segment (0-based)
    - **timestamp**: Time in seconds to capture frame from (default: 0.0)
    
    Captures the frame at the specified timestamp and saves it as the
    guidance image for the segment.
    """
    image_path, error = await storyline_service.capture_guidance_from_video(
        db, storyline_id, segment_index, timestamp
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
    
    return {
        "message": "Guidance image captured from video successfully",
        "image_path": image_path,
        "timestamp": timestamp
    }


@router.put("/{storyline_id}/publish", status_code=status.HTTP_200_OK)
async def publish_storyline(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Publish a storyline (Requirements 1.2, 10.1, 10.2).
    
    Validates that video exists before publishing.
    Published storylines are visible in the frontend scene selection.
    """
    success, error = await storyline_service.publish_storyline(db, storyline_id)
    
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
    
    return {"message": f"Storyline '{storyline_id}' published successfully"}


@router.put("/{storyline_id}/unpublish", status_code=status.HTTP_200_OK)
async def unpublish_storyline(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Unpublish a storyline (set to draft) (Requirements 10.1, 10.2).
    
    Draft storylines are hidden from the frontend scene selection.
    """
    success, error = await storyline_service.unpublish_storyline(db, storyline_id)
    
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
    
    return {"message": f"Storyline '{storyline_id}' set to draft"}


@router.put("/{storyline_id}/order", status_code=status.HTTP_200_OK)
async def update_storyline_order(
    storyline_id: str,
    order: int,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Update a storyline's display order (Requirements 10.3).
    
    - **order**: New display order value (0-based)
    
    Storylines are displayed sorted by display_order in ascending order.
    """
    success, error = await storyline_service.update_storyline_order(db, storyline_id, order)
    
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
    
    return {"message": f"Storyline '{storyline_id}' order updated to {order}"}


@router.put("/batch/reorder", status_code=status.HTTP_200_OK)
async def batch_reorder_storylines(
    orders: List[dict],
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Batch update storyline display orders (Requirements 10.3).
    
    - **orders**: List of {id, order} objects
    
    Updates multiple storyline display orders in a single request.
    Useful for drag-to-reorder functionality.
    """
    storyline_orders = [(item["id"], item["order"]) for item in orders]
    success, error = await storyline_service.reorder_storylines(db, storyline_orders)
    
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
    
    return {"message": f"Successfully reordered {len(orders)} storylines"}


@router.post("/{storyline_id}/cover", status_code=status.HTTP_200_OK)
async def upload_cover_image(
    storyline_id: str,
    file: UploadFile = File(..., description="Cover image (PNG, JPG, or WebP)"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Upload a cover image for a storyline.
    
    Requirements 9.1, 9.3: Validate format and generate multiple sizes.
    
    - **file**: PNG, JPG, or WebP image file (minimum 400x300 pixels)
    
    Generates thumbnail (200x150), medium (400x300), and large (800x600) versions.
    """
    from ...models.admin.storyline import CoverImage
    
    # Read file content
    file_content = await file.read()
    
    # Upload and process cover image
    cover_image, error = await storyline_service.upload_cover_image(
        db, storyline_id, file_content, file.filename
    )
    
    if cover_image is None:
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
    
    return {
        "message": "Cover image uploaded successfully",
        "cover_image": {
            "original_path": cover_image.original_path,
            "thumbnail_path": cover_image.thumbnail_path,
            "medium_path": cover_image.medium_path,
            "large_path": cover_image.large_path,
        }
    }


@router.post("/{storyline_id}/cover/capture", status_code=status.HTTP_200_OK)
async def capture_cover_from_video(
    storyline_id: str,
    timestamp: float = 0.0,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Capture a video frame and use it as cover image.
    
    Requirements 9.2: Capture video frame as cover image.
    
    - **timestamp**: Time in seconds to capture frame from (default: 0.0)
    
    Generates thumbnail (200x150), medium (400x300), and large (800x600) versions.
    """
    # Capture frame and generate cover images
    cover_image, error = await storyline_service.capture_cover_from_video(
        db, storyline_id, timestamp
    )
    
    if cover_image is None:
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
    
    return {
        "message": "Cover image captured from video successfully",
        "timestamp": timestamp,
        "cover_image": {
            "original_path": cover_image.original_path,
            "thumbnail_path": cover_image.thumbnail_path,
            "medium_path": cover_image.medium_path,
            "large_path": cover_image.large_path,
        }
    }


@router.delete("/{storyline_id}/cover", status_code=status.HTTP_200_OK)
async def delete_cover_image(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Delete cover image and revert to default.
    
    Requirements 9.4: Delete cover (revert to default).
    
    When no cover image is set, the frontend will use the first frame of the video as default.
    """
    success, error = await storyline_service.delete_cover_image(db, storyline_id)
    
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
    
    return {"message": "Cover image deleted successfully"}


# ==================== Transition Management Endpoints ====================
# Requirements 6.2, 6.3: CRUD operations for transitions

@router.get("/{storyline_id}/transitions", status_code=status.HTTP_200_OK)
async def get_transitions(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Get all transitions for a storyline.
    
    Requirements 6.2, 6.3: Get transitions between segments.
    
    Returns a list of transitions with their type and duration.
    """
    from ...models.admin.storyline import Transition
    
    transitions, error = await storyline_service.get_transitions(db, storyline_id)
    
    if transitions is None:
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
    
    return {
        "transitions": [
            {
                "id": t.id,
                "from_segment_index": t.from_segment_index,
                "to_segment_index": t.to_segment_index,
                "type": t.type.value,
                "duration": t.duration
            }
            for t in transitions
        ]
    }


@router.put("/{storyline_id}/transitions", status_code=status.HTTP_200_OK)
async def update_transitions(
    storyline_id: str,
    transitions: List[dict],
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Update transitions for a storyline (batch update).
    
    Requirements 6.2, 6.3: CRUD operations for transitions.
    
    - **transitions**: List of transition configurations
    
    Each transition should include:
    - id: Unique transition identifier (optional, will be generated if not provided)
    - from_segment_index: Source segment index
    - to_segment_index: Target segment index
    - type: Transition type (cut, crossfade, fade_to_black, wipe_left, wipe_right)
    - duration: Transition duration in seconds (0.1-3.0)
    """
    from ...models.admin.storyline import Transition, TransitionType
    
    # Convert dict list to Transition objects
    transition_objects = []
    for t in transitions:
        try:
            transition_type = TransitionType(t.get("type", "cut"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid transition type: {t.get('type')}. Must be one of: cut, crossfade, fade_to_black, wipe_left, wipe_right"
            )
        
        transition_objects.append(Transition(
            id=t.get("id", ""),
            from_segment_index=t.get("from_segment_index", 0),
            to_segment_index=t.get("to_segment_index", 0),
            type=transition_type,
            duration=t.get("duration", 0.5)
        ))
    
    success, error = await storyline_service.update_transitions(
        db, storyline_id, transition_objects
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
    
    return {"message": "Transitions updated successfully"}


# ==================== Character Configuration Endpoints ====================
# Requirements 7.2, 7.3, 7.4: Character configuration for storylines

@router.get("/{storyline_id}/characters", status_code=status.HTTP_200_OK)
async def get_storyline_characters(
    storyline_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Get character configuration for a storyline.
    
    Requirements 7.2, 7.3, 7.4: Get available characters for storyline.
    
    Returns the list of character IDs, default character, and display order.
    """
    from ...models.admin.storyline import StorylineCharacterConfig
    
    config, error = await storyline_service.get_storyline_characters(db, storyline_id)
    
    if error and "not found" in error.lower():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error,
        )
    
    if config is None:
        return {
            "character_ids": [],
            "default_character_id": None,
            "display_order": []
        }
    
    return {
        "character_ids": config.character_ids,
        "default_character_id": config.default_character_id,
        "display_order": config.display_order
    }


@router.put("/{storyline_id}/characters", status_code=status.HTTP_200_OK)
async def update_storyline_characters(
    storyline_id: str,
    character_config: dict,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Update character configuration for a storyline.
    
    Requirements 7.2, 7.3, 7.4: Manage character associations.
    
    - **character_ids**: List of character IDs (1-10 characters)
    - **default_character_id**: ID of the default character (must be in character_ids)
    - **display_order**: Optional ordered list of character IDs for display
    
    Property 16: Character count must be between 1 and 10.
    Property 17: Default character must be in the character_ids list.
    """
    from ...models.admin.storyline import StorylineCharacterConfig
    
    # Validate required fields
    character_ids = character_config.get("character_ids", [])
    default_character_id = character_config.get("default_character_id")
    display_order = character_config.get("display_order", character_ids)
    
    if not character_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="character_ids is required and must contain at least 1 character"
        )
    
    if not default_character_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="default_character_id is required"
        )
    
    # Create config object
    try:
        config = StorylineCharacterConfig(
            character_ids=character_ids,
            default_character_id=default_character_id,
            display_order=display_order
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    success, error = await storyline_service.update_storyline_characters(
        db, storyline_id, config
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
    
    return {"message": "Character configuration updated successfully"}
