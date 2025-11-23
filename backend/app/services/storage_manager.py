"""
Storage management service for file operations and cleanup
"""
import os
import shutil
import time
from pathlib import Path
from typing import Optional, Dict, List
from datetime import datetime, timedelta
import logging

from ..models import Session

logger = logging.getLogger(__name__)


class StorageManager:
    """Manages file storage, cleanup, and disk space monitoring"""
    
    def __init__(
        self, 
        base_path: str = "data",
        max_age_days: int = 7,
        min_disk_space_gb: int = 5,
        emergency_threshold_gb: int = 2,
        emergency_target_gb: int = 3
    ):
        """
        Initialize StorageManager
        
        Args:
            base_path: Base directory for all data storage
            max_age_days: Maximum age of files before cleanup (default: 7 days)
            min_disk_space_gb: Minimum disk space threshold for warnings
            emergency_threshold_gb: Disk space threshold for emergency cleanup
            emergency_target_gb: Target disk space after emergency cleanup
        """
        self.base_path = Path(base_path)
        self.sessions_path = self.base_path / "sessions"
        self.outputs_path = self.base_path / "outputs"
        self.logs_path = self.base_path / "logs"
        
        self.max_age_days = max_age_days
        self.min_disk_space_gb = min_disk_space_gb
        self.emergency_threshold_gb = emergency_threshold_gb
        self.emergency_target_gb = emergency_target_gb
        
        # Create directories if they don't exist
        self._ensure_directories()
    
    def _ensure_directories(self) -> None:
        """Create storage directories if they don't exist"""
        self.sessions_path.mkdir(parents=True, exist_ok=True)
        self.outputs_path.mkdir(parents=True, exist_ok=True)
        self.logs_path.mkdir(parents=True, exist_ok=True)
    
    def save_session(self, session: Session) -> None:
        """
        Save session to file
        
        Args:
            session: Session object to save
        """
        import json
        session_file = self.sessions_path / f"{session.id}.json"
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(session.model_dump(), f, indent=2, ensure_ascii=False)
        logger.info(f"Saved session {session.id} to {session_file}")
    
    def load_session(self, session_id: str) -> Optional[Session]:
        """
        Load session from file
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session object if found, None otherwise
        """
        import json
        session_file = self.sessions_path / f"{session_id}.json"
        if not session_file.exists():
            logger.warning(f"Session file not found: {session_file}")
            return None
        
        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return Session(**data)
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Error loading session {session_id}: {e}")
            return None
    
    def delete_session(self, session_id: str) -> bool:
        """
        Delete session file and associated video
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if deleted, False if not found
        """
        deleted = False
        
        # Delete session JSON file
        session_file = self.sessions_path / f"{session_id}.json"
        if session_file.exists():
            session_file.unlink()
            logger.info(f"Deleted session file: {session_file}")
            deleted = True
        
        # Delete associated video file
        video_file = self.outputs_path / f"final_{session_id}.mp4"
        if video_file.exists():
            video_file.unlink()
            logger.info(f"Deleted video file: {video_file}")
            deleted = True
        
        return deleted
    
    def cleanup_old_files(self) -> Dict[str, int]:
        """
        Clean up files older than max_age_days
        
        Returns:
            Dictionary with cleanup metrics: {
                'files_deleted': int,
                'space_freed_mb': int
            }
        """
        cutoff_time = time.time() - (self.max_age_days * 24 * 60 * 60)
        files_deleted = 0
        space_freed = 0
        
        # Clean up old session files
        for session_file in self.sessions_path.glob("*.json"):
            if session_file.stat().st_mtime < cutoff_time:
                file_size = session_file.stat().st_size
                session_id = session_file.stem
                
                # Delete session and associated video
                if self.delete_session(session_id):
                    files_deleted += 1
                    space_freed += file_size
        
        # Clean up orphaned video files
        for video_file in self.outputs_path.glob("final_*.mp4"):
            if video_file.stat().st_mtime < cutoff_time:
                file_size = video_file.stat().st_size
                video_file.unlink()
                logger.info(f"Deleted orphaned video file: {video_file}")
                files_deleted += 1
                space_freed += file_size
        
        space_freed_mb = space_freed // (1024 * 1024)
        logger.info(f"Cleanup completed: {files_deleted} files deleted, {space_freed_mb} MB freed")
        
        return {
            'files_deleted': files_deleted,
            'space_freed_mb': space_freed_mb
        }
    
    def check_disk_space(self) -> int:
        """
        Check available disk space
        
        Returns:
            Available disk space in GB
        """
        stat = shutil.disk_usage(self.base_path)
        available_gb = stat.free // (1024 ** 3)
        
        if available_gb < self.min_disk_space_gb:
            logger.warning(f"Low disk space: {available_gb} GB available (threshold: {self.min_disk_space_gb} GB)")
        
        return available_gb
    
    def ensure_space(self, required_gb: Optional[int] = None) -> None:
        """
        Ensure sufficient disk space, trigger emergency cleanup if needed
        
        Args:
            required_gb: Required disk space in GB (default: emergency_target_gb)
        """
        if required_gb is None:
            required_gb = self.emergency_target_gb
        
        available_gb = self.check_disk_space()
        
        if available_gb < self.emergency_threshold_gb:
            logger.warning(f"Emergency cleanup triggered: {available_gb} GB available")
            self._emergency_cleanup(required_gb)
    
    def _emergency_cleanup(self, target_gb: int) -> None:
        """
        Perform emergency cleanup by deleting oldest files
        
        Args:
            target_gb: Target available disk space in GB
        """
        # Get all files with their modification times
        files_to_delete: List[tuple[Path, float, int]] = []
        
        # Collect session files
        for session_file in self.sessions_path.glob("*.json"):
            mtime = session_file.stat().st_mtime
            size = session_file.stat().st_size
            files_to_delete.append((session_file, mtime, size))
        
        # Collect video files
        for video_file in self.outputs_path.glob("final_*.mp4"):
            mtime = video_file.stat().st_mtime
            size = video_file.stat().st_size
            files_to_delete.append((video_file, mtime, size))
        
        # Sort by modification time (oldest first)
        files_to_delete.sort(key=lambda x: x[1])
        
        # Delete oldest files until we reach target space
        files_deleted = 0
        space_freed = 0
        
        for file_path, _, file_size in files_to_delete:
            available_gb = self.check_disk_space()
            if available_gb >= target_gb:
                break
            
            # If it's a session file, delete both session and video
            if file_path.suffix == '.json':
                session_id = file_path.stem
                if self.delete_session(session_id):
                    files_deleted += 1
                    space_freed += file_size
            else:
                # Orphaned video file
                file_path.unlink()
                logger.info(f"Emergency cleanup: deleted {file_path}")
                files_deleted += 1
                space_freed += file_size
        
        space_freed_mb = space_freed // (1024 * 1024)
        logger.info(f"Emergency cleanup completed: {files_deleted} files deleted, {space_freed_mb} MB freed")
    
    def get_storage_stats(self) -> Dict[str, int]:
        """
        Get storage statistics
        
        Returns:
            Dictionary with storage stats: {
                'session_count': int,
                'video_count': int,
                'total_size_mb': int,
                'available_space_gb': int
            }
        """
        session_count = len(list(self.sessions_path.glob("*.json")))
        video_count = len(list(self.outputs_path.glob("final_*.mp4")))
        
        total_size = 0
        for file_path in self.sessions_path.glob("*.json"):
            total_size += file_path.stat().st_size
        for file_path in self.outputs_path.glob("final_*.mp4"):
            total_size += file_path.stat().st_size
        
        total_size_mb = total_size // (1024 * 1024)
        available_space_gb = self.check_disk_space()
        
        return {
            'session_count': session_count,
            'video_count': video_count,
            'total_size_mb': total_size_mb,
            'available_space_gb': available_space_gb
        }

