"""
FastAPI application entry point for Shadow Puppet Interactive System
"""
import logging
import time
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from .api import sessions_router, videos_router
from .config import ConfigLoader
from .services import StorageManager, SessionManager
from .models import SessionStatus
from .utils.logger import setup_logging, log_error_with_context

# Configure structured logging
setup_logging(
    log_level="INFO",
    log_file="data/logs/app.log",
    structured=True
)
logger = logging.getLogger(__name__)

# Initialize global instances
config_loader = ConfigLoader()
storage_manager = StorageManager(
    max_age_days=config_loader.get_settings().storage.max_age_days,
    min_disk_space_gb=config_loader.get_settings().storage.min_disk_space_gb,
    emergency_threshold_gb=config_loader.get_settings().storage.emergency_cleanup_threshold_gb,
    emergency_target_gb=config_loader.get_settings().storage.emergency_cleanup_target_gb
)
session_manager = SessionManager(storage_manager)

# Initialize cleanup scheduler
scheduler = BackgroundScheduler()

def scheduled_cleanup():
    """Scheduled cleanup job that runs daily"""
    context = {"event_type": "scheduled_cleanup"}
    logger.info("Running scheduled cleanup job", extra={"context": context})
    try:
        metrics = storage_manager.cleanup_old_files()
        cleanup_context = {
            "event_type": "cleanup_completed",
            "files_deleted": metrics['files_deleted'],
            "space_freed_mb": metrics['space_freed_mb']
        }
        logger.info(
            f"Scheduled cleanup completed: {metrics['files_deleted']} files deleted, {metrics['space_freed_mb']} MB freed",
            extra={"context": cleanup_context}
        )
        
        # Check disk space after cleanup
        available_space = storage_manager.check_disk_space()
        logger.info(
            f"Available disk space after cleanup: {available_space} GB",
            extra={"context": {"available_space_gb": available_space}}
        )
        
        # Trigger emergency cleanup if still low on space
        if available_space < storage_manager.emergency_threshold_gb:
            logger.warning(
                "Disk space still low after scheduled cleanup, triggering emergency cleanup",
                extra={"context": {"available_space_gb": available_space, "threshold_gb": storage_manager.emergency_threshold_gb}}
            )
            storage_manager.ensure_space()
    except Exception as e:
        log_error_with_context(
            logger,
            "Error during scheduled cleanup",
            e,
            event_type="cleanup_failed"
        )

app = FastAPI(
    title="Shadow Puppet Interactive System API",
    description="Backend API for motion capture and video rendering",
    version="0.1.0"
)

# Configure CORS for LAN access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for LAN deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for config and assets BEFORE routers
# Get project root (parent of backend directory)
project_root = Path(__file__).parent.parent.parent
config_dir = project_root / "config"
assets_dir = project_root / "assets"

print(f"Project root: {project_root.absolute()}")
print(f"Config dir: {config_dir.absolute()}, exists: {config_dir.exists()}")
print(f"Assets dir: {assets_dir.absolute()}, exists: {assets_dir.exists()}")

if config_dir.exists():
    app.mount("/config", StaticFiles(directory=str(config_dir.absolute())), name="config")
    print(f"✓ Mounted /config -> {config_dir.absolute()}")

if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir.absolute())), name="assets")
    print(f"✓ Mounted /assets -> {assets_dir.absolute()}")

# Include routers AFTER static files
app.include_router(sessions_router)
app.include_router(videos_router)

@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logger.info("Starting Shadow Puppet Interactive System API")
    
    # Check disk space on startup
    available_space = storage_manager.check_disk_space()
    logger.info(f"Available disk space: {available_space} GB")
    
    # Trigger emergency cleanup if needed
    if available_space < storage_manager.emergency_threshold_gb:
        logger.warning(f"Low disk space detected on startup: {available_space} GB")
        storage_manager.ensure_space()
    
    # Load scenes
    scenes = config_loader.get_all_scenes()
    logger.info(f"Loaded {len(scenes)} scenes: {list(scenes.keys())}")
    
    # Start cleanup scheduler - runs daily at 3 AM
    scheduler.add_job(
        scheduled_cleanup,
        trigger=CronTrigger(hour=3, minute=0),
        id='daily_cleanup',
        name='Daily storage cleanup',
        replace_existing=True
    )
    scheduler.start()
    logger.info("Cleanup scheduler started - daily cleanup at 3:00 AM")

@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logger.info("Shutting down Shadow Puppet Interactive System API")
    
    # Shutdown scheduler
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Cleanup scheduler stopped")

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Shadow Puppet Interactive System API", "status": "running"}

@app.get("/api/health")
async def health_check():
    """
    Health check endpoint with system metrics
    
    Returns comprehensive system health information including:
    - Overall system status
    - Disk space availability
    - Session counts by status
    - Storage statistics
    """
    try:
        stats = storage_manager.get_storage_stats()
        
        # Count sessions by status
        all_sessions = session_manager.list_sessions()
        pending_count = len([s for s in all_sessions if s.status == SessionStatus.PENDING])
        processing_count = len([s for s in all_sessions if s.status == SessionStatus.PROCESSING])
        done_count = len([s for s in all_sessions if s.status == SessionStatus.DONE])
        cancelled_count = len([s for s in all_sessions if s.status == SessionStatus.CANCELLED])
        failed_count = len([s for s in all_sessions if s.status == SessionStatus.FAILED])
        
        # Determine overall health status
        health_status = "healthy"
        warnings = []
        
        if stats['available_space_gb'] < storage_manager.min_disk_space_gb:
            health_status = "degraded"
            warnings.append(f"Low disk space: {stats['available_space_gb']:.2f} GB")
        
        if stats['available_space_gb'] < storage_manager.emergency_threshold_gb:
            health_status = "critical"
            warnings.append(f"Critical disk space: {stats['available_space_gb']:.2f} GB")
        
        response = {
            "status": health_status,
            "timestamp": time.time(),
            "disk_space_gb": stats['available_space_gb'],
            "storage": {
                "session_count": stats['session_count'],
                "video_count": stats['video_count'],
                "total_size_mb": stats['total_size_mb']
            },
            "sessions": {
                "total": len(all_sessions),
                "pending": pending_count,
                "processing": processing_count,
                "done": done_count,
                "cancelled": cancelled_count,
                "failed": failed_count
            }
        }
        
        if warnings:
            response["warnings"] = warnings
        
        return response
        
    except Exception as e:
        log_error_with_context(
            logger,
            "Health check failed",
            e,
            error_type="health_check_failed"
        )
        return {
            "status": "error",
            "timestamp": time.time(),
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
