"""
Dashboard service for admin panel.
Handles session statistics, video generation metrics, storage monitoring, and activity logs.
"""
import os
import json
import shutil
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class SessionStats(BaseModel):
    """Session statistics model."""
    total_sessions: int
    today_sessions: int
    pending_count: int
    processing_count: int
    done_count: int
    cancelled_count: int
    failed_count: int


class VideoStats(BaseModel):
    """Video generation statistics model."""
    total_generated: int
    success_count: int
    failed_count: int
    success_rate: float  # Percentage 0-100


class StorageStats(BaseModel):
    """Storage usage statistics model."""
    total_space_gb: float
    used_space_gb: float
    available_space_gb: float
    usage_percentage: float  # Percentage 0-100
    warning_threshold: float  # 80%
    is_warning: bool
    session_files_count: int
    video_files_count: int
    total_data_size_mb: float


class ActivityLogEntry(BaseModel):
    """Activity log entry model."""
    timestamp: str
    level: str
    logger_name: str
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None
    context: Optional[Dict[str, Any]] = None
    exception: Optional[Dict[str, Any]] = None


class DashboardStats(BaseModel):
    """Combined dashboard statistics model."""
    sessions: SessionStats
    videos: VideoStats
    storage: StorageStats
    timestamp: str



class DashboardService:
    """Service for dashboard statistics and monitoring."""

    def __init__(self, base_path: Optional[str] = None):
        """
        Initialize DashboardService.
        
        Args:
            base_path: Base directory for data storage (default: project_root/data)
        """
        if base_path:
            self.base_path = Path(base_path)
        else:
            # Default to project root's data directory
            project_root = Path(__file__).parent.parent.parent.parent
            self.base_path = project_root / "data"
        
        self.sessions_path = self.base_path / "sessions"
        self.outputs_path = self.base_path / "outputs"
        self.logs_path = self.base_path / "logs"
        
        # Storage warning threshold (80%)
        self.warning_threshold = 80.0

    def get_session_stats(self) -> SessionStats:
        """
        Get session count aggregation.
        
        Returns:
            SessionStats with counts by status and today's sessions.
        """
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_timestamp = today_start.timestamp()
        
        total_sessions = 0
        today_sessions = 0
        pending_count = 0
        processing_count = 0
        done_count = 0
        cancelled_count = 0
        failed_count = 0
        
        if not self.sessions_path.exists():
            return SessionStats(
                total_sessions=0,
                today_sessions=0,
                pending_count=0,
                processing_count=0,
                done_count=0,
                cancelled_count=0,
                failed_count=0
            )
        
        for session_file in self.sessions_path.glob("*.json"):
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                
                total_sessions += 1
                
                # Check if created today
                created_at = session_data.get('created_at', 0)
                if created_at >= today_timestamp:
                    today_sessions += 1
                
                # Count by status
                status = session_data.get('status', '').lower()
                if status == 'pending':
                    pending_count += 1
                elif status == 'processing':
                    processing_count += 1
                elif status == 'done':
                    done_count += 1
                elif status == 'cancelled':
                    cancelled_count += 1
                elif status == 'failed':
                    failed_count += 1
                    
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Error reading session file {session_file}: {e}")
                continue
        
        return SessionStats(
            total_sessions=total_sessions,
            today_sessions=today_sessions,
            pending_count=pending_count,
            processing_count=processing_count,
            done_count=done_count,
            cancelled_count=cancelled_count,
            failed_count=failed_count
        )

    def get_video_stats(self) -> VideoStats:
        """
        Calculate video generation success rate.
        
        Returns:
            VideoStats with success/failure counts and rate.
        """
        done_count = 0
        failed_count = 0
        
        if not self.sessions_path.exists():
            return VideoStats(
                total_generated=0,
                success_count=0,
                failed_count=0,
                success_rate=0.0
            )
        
        for session_file in self.sessions_path.glob("*.json"):
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                
                status = session_data.get('status', '').lower()
                if status == 'done':
                    done_count += 1
                elif status == 'failed':
                    failed_count += 1
                    
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Error reading session file {session_file}: {e}")
                continue
        
        total_generated = done_count + failed_count
        success_rate = (done_count / total_generated * 100) if total_generated > 0 else 0.0
        
        return VideoStats(
            total_generated=total_generated,
            success_count=done_count,
            failed_count=failed_count,
            success_rate=round(success_rate, 2)
        )


    def get_storage_stats(self) -> StorageStats:
        """
        Monitor storage usage.
        
        Returns:
            StorageStats with disk usage and warning status.
        """
        # Get disk usage for the base path
        try:
            disk_usage = shutil.disk_usage(self.base_path)
            total_space_gb = disk_usage.total / (1024 ** 3)
            used_space_gb = disk_usage.used / (1024 ** 3)
            available_space_gb = disk_usage.free / (1024 ** 3)
            usage_percentage = (disk_usage.used / disk_usage.total * 100) if disk_usage.total > 0 else 0.0
        except OSError as e:
            logger.error(f"Error getting disk usage: {e}")
            total_space_gb = 0.0
            used_space_gb = 0.0
            available_space_gb = 0.0
            usage_percentage = 0.0
        
        # Count files and calculate data size
        session_files_count = 0
        video_files_count = 0
        total_data_size = 0
        
        if self.sessions_path.exists():
            for session_file in self.sessions_path.glob("*.json"):
                session_files_count += 1
                total_data_size += session_file.stat().st_size
        
        if self.outputs_path.exists():
            for video_file in self.outputs_path.glob("*.mp4"):
                video_files_count += 1
                total_data_size += video_file.stat().st_size
        
        total_data_size_mb = total_data_size / (1024 ** 2)
        
        # Check if warning threshold exceeded
        is_warning = usage_percentage >= self.warning_threshold
        
        return StorageStats(
            total_space_gb=round(total_space_gb, 2),
            used_space_gb=round(used_space_gb, 2),
            available_space_gb=round(available_space_gb, 2),
            usage_percentage=round(usage_percentage, 2),
            warning_threshold=self.warning_threshold,
            is_warning=is_warning,
            session_files_count=session_files_count,
            video_files_count=video_files_count,
            total_data_size_mb=round(total_data_size_mb, 2)
        )

    def get_activity_logs(
        self,
        limit: int = 100,
        offset: int = 0,
        level: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[ActivityLogEntry]:
        """
        Retrieve activity logs with filtering and pagination.
        
        Args:
            limit: Maximum number of log entries to return
            offset: Number of entries to skip
            level: Filter by log level (INFO, WARNING, ERROR, etc.)
            start_date: Filter logs after this date
            end_date: Filter logs before this date
            
        Returns:
            List of ActivityLogEntry objects
        """
        log_file = self.logs_path / "app.log"
        
        if not log_file.exists():
            return []
        
        logs: List[ActivityLogEntry] = []
        
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    
                    try:
                        log_data = json.loads(line)
                        
                        # Apply level filter
                        if level and log_data.get('level', '').upper() != level.upper():
                            continue
                        
                        # Apply date filters
                        log_timestamp = log_data.get('timestamp', '')
                        if log_timestamp:
                            try:
                                log_dt = datetime.fromisoformat(log_timestamp)
                                if start_date and log_dt < start_date:
                                    continue
                                if end_date and log_dt > end_date:
                                    continue
                            except ValueError:
                                pass
                        
                        entry = ActivityLogEntry(
                            timestamp=log_data.get('timestamp', ''),
                            level=log_data.get('level', 'INFO'),
                            logger_name=log_data.get('logger', ''),
                            message=log_data.get('message', ''),
                            module=log_data.get('module'),
                            function=log_data.get('function'),
                            line=log_data.get('line'),
                            context=log_data.get('context'),
                            exception=log_data.get('exception')
                        )
                        logs.append(entry)
                        
                    except json.JSONDecodeError:
                        # Skip non-JSON log lines
                        continue
                        
        except IOError as e:
            logger.error(f"Error reading log file: {e}")
            return []
        
        # Sort by timestamp descending (most recent first)
        logs.sort(key=lambda x: x.timestamp, reverse=True)
        
        # Apply pagination
        return logs[offset:offset + limit]

    def get_dashboard_stats(self) -> DashboardStats:
        """
        Get combined dashboard statistics.
        
        Returns:
            DashboardStats with all statistics combined.
        """
        return DashboardStats(
            sessions=self.get_session_stats(),
            videos=self.get_video_stats(),
            storage=self.get_storage_stats(),
            timestamp=datetime.now().isoformat()
        )


# Singleton instance
dashboard_service = DashboardService()
