"""
Session management API endpoints
"""
from fastapi import APIRouter, HTTPException, status
from ..models import (
    CreateSessionRequest,
    CreateSessionResponse,
    SessionStatusResponse,
    Segment,
    UploadSegmentResponse,
)
from ..services import SessionManager

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# Initialize session manager
session_manager = SessionManager()


@router.post("", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(request: CreateSessionRequest):
    """
    Create a new session
    
    Args:
        request: Session creation request with scene_id
        
    Returns:
        Created session information
    """
    session = session_manager.create_session(request.scene_id)
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
    Delete a session (for cleanup/cancellation)
    
    Args:
        session_id: Session identifier
        
    Returns:
        Success response
        
    Raises:
        HTTPException: 404 if session not found
    """
    deleted = session_manager.delete_session(session_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    return {"success": True, "message": "Session deleted successfully"}
