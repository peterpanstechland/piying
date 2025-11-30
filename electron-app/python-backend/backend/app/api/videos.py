"""
Video serving API endpoints
"""
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from ..models import SessionStatus
from ..services import SessionManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/videos", tags=["videos"])

# Initialize session manager
session_manager = SessionManager()


@router.get("/{session_id}")
async def get_video(session_id: str):
    """
    Serve rendered video file
    
    Args:
        session_id: Session identifier
        
    Returns:
        Video file response with correct content-type header
        
    Raises:
        HTTPException: 404 if session or video not found, 400 if video not ready
    """
    # Get session
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    # Check if video is ready
    if session.status != SessionStatus.DONE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Video not ready. Current status: {session.status.value}"
        )
    
    # Check if output path exists
    if not session.output_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video output path not set"
        )
    
    # Check if file exists
    video_path = Path(session.output_path)
    if not video_path.exists():
        logger.error(f"Video file not found: {video_path}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video file not found"
        )
    
    # Serve video file with correct content-type
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"shadow_puppet_{session_id}.mp4"
    )
