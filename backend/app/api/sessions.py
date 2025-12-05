"""
Session management API endpoints
"""
import logging
import json
import aiofiles
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, status, BackgroundTasks, File, UploadFile, Form
from fastapi.responses import FileResponse
from ..models import (
    CreateSessionRequest,
    CreateSessionResponse,
    SessionStatusResponse,
    Segment,
    PoseFrame,
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


async def _get_scene_config_from_storyline(scene_id: str, character_id: str = None) -> SceneConfig | None:
    """
    Try to load scene configuration from database storyline.
    If character_id is provided and has character-specific video segments, use those.
    Otherwise, use base storyline segments.
    
    Args:
        scene_id: Storyline ID (UUID format)
        character_id: Optional character ID for character-specific video segments
        
    Returns:
        SceneConfig if found, None otherwise
    """
    from ..services.admin.storyline_service import storyline_service
    from sqlalchemy import select
    from ..models.admin.storyline import StorylineCharacterDB, CharacterVideoSegmentDB
    
    try:
        async with async_session_maker() as db:
            storyline = await storyline_service.get_storyline_by_id(db, scene_id)
            
            if storyline is None:
                return None
            
            # Check if storyline has a base video
            if not storyline.base_video_path:
                logger.error(f"Storyline {scene_id} has no base video")
                return None
            
            # Try to load character-specific video segments if character_id provided
            segment_configs = []
            if character_id:
                try:
                    from sqlalchemy.orm import selectinload
                    
                    logger.info(f"[SceneConfig] Attempting to load character-specific segments for character_id={character_id}, scene_id={scene_id}")
                    
                    # Get storyline_character association with segments eagerly loaded
                    result = await db.execute(
                        select(StorylineCharacterDB)
                        .options(selectinload(StorylineCharacterDB.segments))
                        .where(
                            (StorylineCharacterDB.storyline_id == scene_id) &
                            (StorylineCharacterDB.character_id == character_id)
                        )
                    )
                    storyline_character = result.scalar_one_or_none()
                    
                    if storyline_character:
                        logger.info(f"[SceneConfig] Found storyline_character, segments: {len(storyline_character.segments) if storyline_character.segments else 0}")
                    else:
                        logger.info(f"[SceneConfig] No storyline_character found")
                    
                    if storyline_character and storyline_character.segments:
                        # Load character-specific video segments
                        logger.info(f"[SceneConfig] Loading {len(storyline_character.segments)} character-specific video segments for {character_id}")
                        for seg in sorted(storyline_character.segments, key=lambda x: x.index):
                            # Parse waypoints if available
                            waypoints = []
                            if seg.path_waypoints:
                                try:
                                    import json
                                    waypoints = json.loads(seg.path_waypoints)
                                except (json.JSONDecodeError, TypeError):
                                    waypoints = []
                            
                            segment_configs.append(SegmentConfig(
                                start_time=seg.start_time or 0.0,  # 关键：包含 start_time
                                duration=seg.duration,
                                path_type=seg.path_type or "static",
                                offset_start=[int(seg.offset_start_x * 100) if seg.offset_start_x else 0, int(seg.offset_start_y * 100) if seg.offset_start_y else 0],
                                offset_end=[int(seg.offset_end_x * 100) if seg.offset_end_x else 0, int(seg.offset_end_y * 100) if seg.offset_end_y else 0],
                                path_waypoints=waypoints,
                                path_draw_type=seg.path_draw_type or "linear",
                                entry_type=seg.entry_type or "instant",
                                entry_duration=seg.entry_duration or 1.0,
                                entry_delay=seg.entry_delay or 0.0,
                                exit_type=seg.exit_type or "instant",
                                exit_duration=seg.exit_duration or 1.0,
                                exit_delay=seg.exit_delay or 0.0,
                            ))
                            logger.info(f"[SceneConfig] Loaded segment {seg.index}: start_time={seg.start_time}, duration={seg.duration}")
                        logger.info(f"[SceneConfig] Character-specific segments loaded: {len(segment_configs)} configs")
                except Exception as e:
                    logger.warning(f"[SceneConfig] Failed to load character-specific segments: {e}")
            
            # If no character-specific segments, use base storyline segments
            if not segment_configs and storyline.segments:
                logger.info(f"[SceneConfig] No character-specific segments found, using base storyline segments: {len(storyline.segments)} segments")
                for seg in sorted(storyline.segments, key=lambda x: x.index):
                    # Parse waypoints if available
                    waypoints = []
                    if seg.path_waypoints:
                        try:
                            import json
                            waypoints = json.loads(seg.path_waypoints)
                        except (json.JSONDecodeError, TypeError):
                            waypoints = []
                    
                    segment_configs.append(SegmentConfig(
                        start_time=seg.start_time or 0.0,  # 包含 start_time
                        duration=seg.duration,
                        path_type=seg.path_type or "static",
                        offset_start=[int(seg.offset_start_x or 0), int(seg.offset_start_y or 0)],
                        offset_end=[int(seg.offset_end_x or 0), int(seg.offset_end_y or 0)],
                        path_waypoints=waypoints,
                        path_draw_type=seg.path_draw_type or "linear",
                        entry_type=seg.entry_type or "instant",
                        entry_duration=seg.entry_duration or 1.0,
                        entry_delay=seg.entry_delay or 0.0,
                        exit_type=seg.exit_type or "instant",
                        exit_duration=seg.exit_duration or 1.0,
                        exit_delay=seg.exit_delay or 0.0,
                    ))
                    logger.info(f"[SceneConfig] Loaded base segment {seg.index}: start_time={seg.start_time}, duration={seg.duration}")
                logger.info(f"[SceneConfig] Base storyline segments loaded: {len(segment_configs)} configs")
            
            # If still no segments, create a default one based on video duration
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
            scene_config = SceneConfig(
                id=storyline.id,
                name=storyline.name,
                name_en=storyline.name_en or storyline.name,
                description=storyline.description or "",
                description_en=storyline.description_en or "",
                base_video_path=base_video_path,
                icon=storyline.icon or "⛏️",
                segments=segment_configs,
            )
            
            logger.info(f"[SceneConfig] Created SceneConfig with {len(scene_config.segments)} segments for scene_id={scene_id}, character_id={character_id}")
            
            return scene_config
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
        video_url=getattr(session, 'video_url', None),
        segment_count=len(session.segments)
    )


@router.post("/{session_id}/segments/{segment_index}", response_model=UploadSegmentResponse)
async def upload_segment(
    session_id: str, 
    segment_index: int, 
    segment: Optional[Segment] = None,
    segment_data: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None)
):
    """
    Upload segment data for a session
    
    Supports two modes:
    1. JSON body (legacy): segment data as JSON body
    2. Multipart form (new): segment_data as JSON string + video file
    
    Args:
        session_id: Session identifier
        segment_index: Segment index (must match segment.index)
        segment: Segment data with frames (JSON body mode)
        segment_data: Segment data as JSON string (form mode)
        video: Optional recorded video file from frontend canvas
        
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
    
    # Parse segment data from either JSON body or form data
    if segment is None and segment_data is not None:
        try:
            data = json.loads(segment_data)
            segment = Segment(
                index=data["index"],
                duration=data["duration"],
                frames=[PoseFrame(
                    timestamp=f["timestamp"],
                    landmarks=f["landmarks"]
                ) for f in data.get("frames", [])]
            )
        except (json.JSONDecodeError, KeyError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid segment data: {e}"
            )
    
    if segment is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No segment data provided"
        )
    
    # Verify segment index matches URL parameter
    if segment.index != segment_index:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Segment index mismatch: URL has {segment_index}, body has {segment.index}"
        )
    
    # Save video file if provided
    video_path = None
    if video is not None:
        try:
            # Create session videos directory
            project_root = Path(__file__).parent.parent.parent.parent
            videos_dir = project_root / "data" / "session_videos" / session_id
            videos_dir.mkdir(parents=True, exist_ok=True)
            
            # Save video file
            video_path = videos_dir / f"segment_{segment_index}.webm"
            async with aiofiles.open(video_path, 'wb') as f:
                content = await video.read()
                await f.write(content)
            
            logger.info(f"Saved segment video: {video_path} ({len(content) / 1024 / 1024:.2f} MB)")
        except Exception as e:
            logger.error(f"Failed to save segment video: {e}")
            # Continue without video - we still have pose data
    
    # Update segment with video path
    try:
        session_manager.update_segment(session_id, segment, video_path=str(video_path) if video_path else None)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    
    return UploadSegmentResponse(
        success=True,
        message="Segment uploaded successfully" + (" with video" if video_path else "")
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
            # Pass character_id to load character-specific video segments if available
            logger.info(f"Scene {session.scene_id} not found in static config, trying database storyline")
            scene_config = await _get_scene_config_from_storyline(session.scene_id, session.character_id)
        
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
        
        # Initialize renderer with character_id for spritesheet-based rendering
        renderer = VideoRenderer(scene_config, character_id=session.character_id)
        
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


