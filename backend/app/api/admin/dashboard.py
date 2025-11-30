"""
Dashboard API endpoints for admin panel.
Handles dashboard statistics, activity logs, and storage monitoring.
"""
from typing import Annotated, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ...models.admin import TokenPayload
from ...services.admin.dashboard_service import (
    dashboard_service,
    DashboardStats,
    SessionStats,
    VideoStats,
    StorageStats,
    ActivityLogEntry,
)
from .auth import get_current_user

router = APIRouter(prefix="/api/admin/dashboard", tags=["Admin Dashboard"])


class ActivityLogsResponse(BaseModel):
    """Response model for activity logs endpoint."""
    logs: List[ActivityLogEntry]
    total: int
    limit: int
    offset: int


class StorageWarningResponse(BaseModel):
    """Response model for storage with warning information."""
    storage: StorageStats
    warning_message: Optional[str] = None


# ============================================================================
# Dashboard Statistics Endpoints (Task 13.2)
# ============================================================================

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> DashboardStats:
    """
    Get dashboard statistics.
    
    Returns combined statistics including:
    - Today's session count
    - Video generation success rate
    - Storage usage with warning status
    
    Requirements: 10.1, 10.3
    """
    return dashboard_service.get_dashboard_stats()


@router.get("/sessions", response_model=SessionStats)
async def get_session_stats(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> SessionStats:
    """
    Get session statistics.
    
    Returns session counts aggregated by status and today's sessions.
    
    Requirements: 10.1
    """
    return dashboard_service.get_session_stats()


@router.get("/videos", response_model=VideoStats)
async def get_video_stats(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> VideoStats:
    """
    Get video generation statistics.
    
    Returns video generation success/failure counts and success rate.
    
    Requirements: 10.1
    """
    return dashboard_service.get_video_stats()



@router.get("/storage", response_model=StorageWarningResponse)
async def get_storage_usage(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> StorageWarningResponse:
    """
    Get storage usage with warning detection.
    
    Returns storage statistics including:
    - Total, used, and available disk space
    - Usage percentage
    - Warning status when usage exceeds 80%
    - File counts and data size
    
    Requirements: 10.3
    """
    storage = dashboard_service.get_storage_stats()
    
    warning_message = None
    if storage.is_warning:
        warning_message = (
            f"Storage usage is at {storage.usage_percentage:.1f}%, "
            f"which exceeds the {storage.warning_threshold:.0f}% warning threshold. "
            f"Only {storage.available_space_gb:.2f} GB available."
        )
    
    return StorageWarningResponse(
        storage=storage,
        warning_message=warning_message,
    )


@router.get("/logs", response_model=ActivityLogsResponse)
async def get_activity_logs(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum number of logs to return"),
    offset: int = Query(default=0, ge=0, description="Number of logs to skip"),
    level: Optional[str] = Query(default=None, description="Filter by log level (INFO, WARNING, ERROR)"),
    start_date: Optional[datetime] = Query(default=None, description="Filter logs after this date"),
    end_date: Optional[datetime] = Query(default=None, description="Filter logs before this date"),
) -> ActivityLogsResponse:
    """
    Get activity logs with filtering and pagination.
    
    Returns recent system events with timestamps and details.
    Click on a log entry to view full details including error stack traces.
    
    - **limit**: Maximum number of logs to return (1-1000, default 100)
    - **offset**: Number of logs to skip for pagination
    - **level**: Filter by log level (INFO, WARNING, ERROR, etc.)
    - **start_date**: Filter logs after this date
    - **end_date**: Filter logs before this date
    
    Requirements: 10.2, 10.4
    """
    logs = dashboard_service.get_activity_logs(
        limit=limit,
        offset=offset,
        level=level,
        start_date=start_date,
        end_date=end_date,
    )
    
    # Get total count (without pagination) for UI
    # For efficiency, we estimate based on returned results
    total = len(logs) + offset
    if len(logs) == limit:
        # There might be more logs
        total = offset + limit + 1  # Indicate there are more
    
    return ActivityLogsResponse(
        logs=logs,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/logs/{index}", response_model=ActivityLogEntry)
async def get_log_entry(
    index: int,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> ActivityLogEntry:
    """
    Get a specific log entry by index.
    
    Returns full details of the log entry including any error stack traces.
    
    Requirements: 10.4
    """
    logs = dashboard_service.get_activity_logs(limit=index + 1, offset=0)
    
    if index >= len(logs):
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Log entry at index {index} not found",
        )
    
    return logs[index]
