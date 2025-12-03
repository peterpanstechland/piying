"""
Session management service for CRUD operations
"""
import uuid
import time
import logging
from typing import Optional, List
from ..models import Session, Segment, SessionStatus
from .storage_manager import StorageManager
from ..utils.logger import log_session_event

logger = logging.getLogger(__name__)


class SessionManager:
    """Manages session lifecycle and persistence"""
    
    def __init__(self, storage_manager: Optional[StorageManager] = None):
        """
        Initialize SessionManager
        
        Args:
            storage_manager: Optional StorageManager instance (creates default if None)
        """
        self.storage_manager = storage_manager or StorageManager()
    
    def create_session(
        self, 
        scene_id: str, 
        character_id: Optional[str] = None,
        video_path: Optional[str] = None
    ) -> Session:
        """
        Create a new session
        
        Args:
            scene_id: Scene identifier for this session
            character_id: Optional selected character ID for motion capture
            video_path: Optional resolved video path (character-specific or default)
            
        Returns:
            Created Session object with unique ID and pending status
        """
        session_id = str(uuid.uuid4())
        session = Session(
            id=session_id,
            scene_id=scene_id,
            character_id=character_id,
            video_path=video_path,
            status=SessionStatus.PENDING,
            segments=[],
            output_path=None,
            created_at=time.time(),
            updated_at=time.time()
        )
        self.storage_manager.save_session(session)
        
        # Log session creation
        log_session_event(
            logger,
            "created",
            session_id,
            scene_id=scene_id,
            character_id=character_id,
            video_path=video_path,
            status=session.status.value
        )
        
        return session
    
    def get_session(self, session_id: str) -> Optional[Session]:
        """
        Retrieve a session by ID
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session object if found, None otherwise
        """
        return self.storage_manager.load_session(session_id)
    
    def update_segment(self, session_id: str, segment: Segment, video_path: str = None) -> None:
        """
        Update or add a segment to a session
        
        Args:
            session_id: Session identifier
            segment: Segment data to add/update
            video_path: Optional path to recorded canvas video file
            
        Raises:
            ValueError: If session not found
        """
        session = self.get_session(session_id)
        if session is None:
            raise ValueError(f"Session {session_id} not found")
        
        # Add video path to segment if provided
        if video_path:
            segment.video_path = video_path
        
        # Find existing segment with same index or append
        existing_index = None
        for i, seg in enumerate(session.segments):
            if seg.index == segment.index:
                existing_index = i
                break
        
        if existing_index is not None:
            session.segments[existing_index] = segment
        else:
            session.segments.append(segment)
        
        # Sort segments by index
        session.segments.sort(key=lambda s: s.index)
        
        session.updated_at = time.time()
        self.storage_manager.save_session(session)
    
    def update_status(self, session_id: str, status: SessionStatus, output_path: Optional[str] = None) -> None:
        """
        Update session status
        
        Args:
            session_id: Session identifier
            status: New status
            output_path: Optional output video path (for DONE status)
            
        Raises:
            ValueError: If session not found
        """
        session = self.get_session(session_id)
        if session is None:
            raise ValueError(f"Session {session_id} not found")
        
        old_status = session.status
        session.status = status
        if output_path is not None:
            session.output_path = output_path
        session.updated_at = time.time()
        self.storage_manager.save_session(session)
        
        # Log status change
        event_type = "status_changed"
        if status == SessionStatus.DONE:
            event_type = "completed"
        elif status == SessionStatus.CANCELLED:
            event_type = "cancelled"
        elif status == SessionStatus.FAILED:
            event_type = "failed"
        
        log_session_event(
            logger,
            event_type,
            session_id,
            scene_id=session.scene_id,
            old_status=old_status.value,
            new_status=status.value,
            output_path=output_path
        )
    
    def mark_cancelled(self, session_id: str) -> None:
        """
        Mark a session as cancelled
        
        Args:
            session_id: Session identifier
            
        Raises:
            ValueError: If session not found
        """
        logger.info(f"Marking session {session_id} as cancelled")
        self.update_status(session_id, SessionStatus.CANCELLED)
    
    def list_sessions(self, status: Optional[SessionStatus] = None) -> List[Session]:
        """
        List all sessions, optionally filtered by status
        
        Args:
            status: Optional status filter
            
        Returns:
            List of Session objects
        """
        sessions = []
        for session_file in self.storage_manager.sessions_path.glob("*.json"):
            session_id = session_file.stem
            session = self.storage_manager.load_session(session_id)
            if session and (status is None or session.status == status):
                sessions.append(session)
        
        return sessions
    
    def delete_session(self, session_id: str) -> bool:
        """
        Delete a session file
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if deleted, False if not found
        """
        return self.storage_manager.delete_session(session_id)
