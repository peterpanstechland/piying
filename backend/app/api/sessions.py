"""
Session management API endpoints
"""
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from ..models import (
    CreateSessionRequest,
    CreateSessionResponse,
    SessionStatusResponse,
    Segment,
    UploadSegmentResponse,
    SessionStatus,
)
from ..services import SessionManager
from ..services.video_renderer import VideoRenderer
from ..config import ConfigLoader, SceneConfig, SegmentConfig
from ..utils.logger import log_error_with_context
from ..database import async_session_maker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# Initialize session manager and config loader
session_manager = SessionManager()
config_loader = ConfigLoader()


async def _get_scene_config_from_storyline(scene_id: str) -> SceneConfig | None:
    """
    Try to load scene configuration from database storyline.
    
    Args:
        scene_id: Storyline ID (UUID format)
        
    Returns:
        SceneConfig if found, None otherwise
    """
    from ..services.admin.storyline_service import storyline_service
    
    try:
        async with async_session_maker() as db:
            storyline = await storyline_service.get_storyline_by_id(db, scene_id)
            
            if storyline is None:
                return None
            
            # Check if storyline has a base video
            if not storyline.base_video_path:
                logger.error(f"Storyline {scene_id} has no base video")
                return None
            
            # Convert storyline segments to SegmentConfig format
            segment_configs = []
            if storyline.segments:
                for seg in sorted(storyline.segments, key=lambda x: x.index):
                    segment_configs.append(SegmentConfig(
                        duration=seg.duration,
                        path_type=seg.path_type or "static",
                        offset_start=[seg.offset_start_x or 0, seg.offset_start_y or 0],
                        offset_end=[seg.offset_end_x or 0, seg.offset_end_y or 0],
                    ))
            
            # If no segments, create a default one based on video duration
            if not segment_configs:
                segment_configs.append(SegmentConfig(
                    duration=storyline.video_duration or 30.0,
                    path_type="static",
                    offset_start=[0, 0],
                    offset_end=[0, 0],
                ))
            
            # Fix video path: storyline paths are stored as "storylines/{id}/base_video.mp4"
            # but actual files are in "backend/data/storylines/{id}/base_video.mp4"
            base_video_path = storyline.base_video_path
            if base_video_path.startswith("storylines/"):
                base_video_path = f"backend/data/{base_video_path}"
            
            # Create SceneConfig from storyline
            return SceneConfig(
                id=storyline.id,
                name=storyline.name,
                name_en=storyline.name_en or storyline.name,
                description=storyline.description or "",
                description_en=storyline.description_en or "",
                base_video_path=base_video_path,
                icon=storyline.icon or "⛏️",
                segments=segment_configs,
            )
    except Exception as e:
        logger.error(f"Failed to load storyline {scene_id}: {e}")
        return None


@router.post("", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(request: CreateSessionRequest):
    """
    Create a new session
    
    Args:
        request: Session creation request with scene_id, optional character_id and video_path
        
    Returns:
        Created session information
        
    Requirements 3.4:
    - Session stores selected character ID and corresponding video path
    """
    session = session_manager.create_session(
        scene_id=request.scene_id,
        character_id=request.character_id,
        video_path=request.video_path
    )
    return CreateSessionResponse(
        session_id=session.id,
        scene_id=session.scene_id,
        status=session.status
    )


@router.get("/{session_id}", response_model=SessionStatusResponse)
async def get_session_status(session_id: str):
    """
    Get session status and information
    
    Args:
        session_id: Session identifier
        
    Returns:
        Session status information
        
    Raises:
        HTTPException: 404 if session not found
    """
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    return SessionStatusResponse(
        id=session.id,
        scene_id=session.scene_id,
        status=session.status,
        output_path=session.output_path,
        segment_count=len(session.segments)
    )


@router.post("/{session_id}/segments/{segment_index}", response_model=UploadSegmentResponse)
async def upload_segment(session_id: str, segment_index: int, segment: Segment):
    """
    Upload segment data for a session
    
    Args:
        session_id: Session identifier
        segment_index: Segment index (must match segment.index)
        segment: Segment data with frames
        
    Returns:
        Upload success response
        
    Raises:
        HTTPException: 404 if session not found, 400 if segment index mismatch
    """
    # Verify session exists
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    # Verify segment index matches URL parameter
    if segment.index != segment_index:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Segment index mismatch: URL has {segment_index}, body has {segment.index}"
        )
    
    # Update segment
    try:
        session_manager.update_segment(session_id, segment)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    
    return UploadSegmentResponse(
        success=True,
        message="Segment uploaded successfully"
    )


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """
    Delete/cancel a session
    
    Marks the session as cancelled before deletion to maintain proper lifecycle tracking.
    This is used when a user abandons a session or explicitly exits.
    
    Args:
        session_id: Session identifier
        
    Returns:
        Success response
        
    Raises:
        HTTPException: 404 if session not found
    """
    # Verify session exists
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    # Mark as cancelled before deletion (per Requirements 17.5)
    try:
        session_manager.mark_cancelled(session_id)
        logger.info(f"Session {session_id} marked as cancelled")
    except Exception as e:
        logger.error(f"Failed to mark session {session_id} as cancelled: {str(e)}")
        # Continue with deletion even if marking fails
    
    # Delete the session file
    deleted = session_manager.delete_session(session_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    return {"success": True, "message": "Session cancelled and deleted successfully"}


async def _render_video_background(session_id: str):
    """
    Background task to render video
    
    Args:
        session_id: Session identifier
    """
    try:
        logger.info(
            f"Starting background video rendering for session {session_id}",
            extra={"context": {"session_id": session_id, "event_type": "render_started"}}
        )
        
        # Get session
        session = session_manager.get_session(session_id)
        if session is None:
            logger.error(
                f"Session {session_id} not found for rendering",
                extra={"context": {"session_id": session_id, "error_type": "session_not_found"}}
            )
            return
        
        # Update status to processing
        session_manager.update_status(session_id, SessionStatus.PROCESSING)
        logger.info(
            f"Session {session_id} status updated to PROCESSING",
            extra={"context": {"session_id": session_id, "status": "processing"}}
        )
        
        # Get scene configuration - try static config first, then database storyline
        scene_config = config_loader.get_scene(session.scene_id)
        
        if scene_config is None:
            # Try to load from database storyline (UUID format scene_id)
            logger.info(f"Scene {session.scene_id} not found in static config, trying database storyline")
            scene_config = await _get_scene_config_from_storyline(session.scene_id)
        
        if scene_config is None:
            log_error_with_context(
                logger,
                f"Scene configuration not found for scene {session.scene_id}",
                ValueError(f"Scene {session.scene_id} not found in config or database"),
                session_id=session_id,
                scene_id=session.scene_id,
                error_type="scene_not_found"
            )
            session_manager.update_status(session_id, SessionStatus.FAILED)
            return
        
        # Initialize renderer
        renderer = VideoRenderer(scene_config)
        
        # Render video
        output_path = renderer.render_video(session)
        logger.info(
            f"Video rendering completed for session {session_id}: {output_path}",
            extra={"context": {"session_id": session_id, "output_path": output_path}}
        )
        
        # Update session status to done with output path
        session_manager.update_status(session_id, SessionStatus.DONE, output_path)
        logger.info(
            f"Session {session_id} status updated to DONE",
            extra={"context": {"session_id": session_id, "status": "done"}}
        )
        
    except Exception as e:
        log_error_with_context(
            logger,
            f"Video rendering failed for session {session_id}",
            e,
            session_id=session_id,
            error_type="render_failed"
        )
        try:
            session_manager.update_status(session_id, SessionStatus.FAILED)
        except Exception as update_error:
            log_error_with_context(
                logger,
                "Failed to update session status to FAILED",
                update_error,
                session_id=session_id,
                error_type="status_update_failed"
            )


@router.post("/{session_id}/render")
async def trigger_render(session_id: str, background_tasks: BackgroundTasks):
    """
    Trigger video rendering for a session
    
    Args:
        session_id: Session identifier
        background_tasks: FastAPI background tasks
        
    Returns:
        Success response with status
        
    Raises:
        HTTPException: 404 if session not found, 400 if session not ready
    """
    # Verify session exists
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    # Check if session has segments
    if not session.segments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has no segments to render"
        )
    
    # Check if already processing or done
    if session.status in [SessionStatus.PROCESSING, SessionStatus.DONE]:
        return {
            "success": True,
            "status": session.status.value,
            "message": f"Session is already {session.status.value}"
        }
    
    # Add rendering task to background
    background_tasks.add_task(_render_video_background, session_id)
    
    logger.info(f"Render task queued for session {session_id}")
    
    return {
        "success": True,
        "status": "processing",
        "message": "Rendering started"
    }



