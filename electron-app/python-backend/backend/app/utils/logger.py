"""
Structured logging utility for Shadow Puppet Interactive System
"""
import logging
import sys
import json
from datetime import datetime
from typing import Any, Dict, Optional
from pathlib import Path


class StructuredFormatter(logging.Formatter):
    """Custom formatter that outputs structured JSON logs"""
    
    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record as structured JSON
        
        Args:
            record: Log record to format
            
        Returns:
            JSON string with structured log data
        """
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": self.formatException(record.exc_info) if record.exc_info else None
            }
        
        # Add extra context if present
        if hasattr(record, 'context'):
            log_data["context"] = record.context
        
        return json.dumps(log_data)


class SessionContextFilter(logging.Filter):
    """Filter that adds session context to log records"""
    
    def __init__(self):
        super().__init__()
        self.session_id = None
        self.scene_id = None
    
    def set_context(self, session_id: Optional[str] = None, scene_id: Optional[str] = None):
        """Set session context for subsequent log records"""
        self.session_id = session_id
        self.scene_id = scene_id
    
    def clear_context(self):
        """Clear session context"""
        self.session_id = None
        self.scene_id = None
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Add session context to record"""
        if not hasattr(record, 'context'):
            record.context = {}
        
        if self.session_id:
            record.context['session_id'] = self.session_id
        if self.scene_id:
            record.context['scene_id'] = self.scene_id
        
        return True


def setup_logging(
    log_level: str = "INFO",
    log_file: Optional[str] = None,
    structured: bool = True
) -> logging.Logger:
    """
    Set up application logging with structured output
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional path to log file
        structured: Whether to use structured JSON logging
        
    Returns:
        Configured root logger
    """
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Create formatter
    if structured:
        formatter = StructuredFormatter()
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, log_level.upper()))
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # File handler if specified
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(getattr(logging, log_level.upper()))
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
    
    return root_logger


def log_session_event(
    logger: logging.Logger,
    event_type: str,
    session_id: str,
    scene_id: Optional[str] = None,
    **kwargs
):
    """
    Log a session lifecycle event
    
    Args:
        logger: Logger instance
        event_type: Type of event (created, completed, cancelled, failed)
        session_id: Session identifier
        scene_id: Optional scene identifier
        **kwargs: Additional context data
    """
    context = {
        "event_type": event_type,
        "session_id": session_id
    }
    
    if scene_id:
        context["scene_id"] = scene_id
    
    context.update(kwargs)
    
    # Create log record with context
    extra = {"context": context}
    
    if event_type == "created":
        logger.info(f"Session created: {session_id}", extra=extra)
    elif event_type == "completed":
        logger.info(f"Session completed: {session_id}", extra=extra)
    elif event_type == "cancelled":
        logger.info(f"Session cancelled: {session_id}", extra=extra)
    elif event_type == "failed":
        logger.error(f"Session failed: {session_id}", extra=extra)
    else:
        logger.info(f"Session event '{event_type}': {session_id}", extra=extra)


def log_render_performance(
    logger: logging.Logger,
    session_id: str,
    duration_seconds: float,
    output_file_size_mb: float,
    frame_count: int,
    **kwargs
):
    """
    Log video rendering performance metrics
    
    Args:
        logger: Logger instance
        session_id: Session identifier
        duration_seconds: Rendering duration in seconds
        output_file_size_mb: Output file size in MB
        frame_count: Number of frames rendered
        **kwargs: Additional metrics
    """
    context = {
        "event_type": "render_completed",
        "session_id": session_id,
        "duration_seconds": duration_seconds,
        "output_file_size_mb": output_file_size_mb,
        "frame_count": frame_count,
        "frames_per_second": frame_count / duration_seconds if duration_seconds > 0 else 0
    }
    
    context.update(kwargs)
    
    extra = {"context": context}
    logger.info(
        f"Video rendering completed for session {session_id} in {duration_seconds:.2f}s",
        extra=extra
    )


def log_error_with_context(
    logger: logging.Logger,
    message: str,
    error: Exception,
    **context
):
    """
    Log an error with full context and stack trace
    
    Args:
        logger: Logger instance
        message: Error message
        error: Exception object
        **context: Additional context data
    """
    extra = {"context": context}
    logger.error(message, exc_info=error, extra=extra)
