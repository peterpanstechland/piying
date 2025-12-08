"""
FastAPI application entry point for Shadow Puppet Interactive System
"""
import logging
import time
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from .api import sessions_router, videos_router, public_storylines_router, characters_router as public_characters_router
from .api.system import router as public_system_router
from .api.admin import auth_router, users_router, characters_router, storylines_router, settings_router, dashboard_router, export_import_router, character_videos_router
from .config import ConfigLoader
from .database import init_db
from .services.admin.auth_service import auth_service
from .services.admin.settings_service import settings_service
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
settings = config_loader.get_settings()

# Determine base path for storage
# If local_path is "data" (default), we rely on StorageManager's robust default (get_user_data_dir)
# Otherwise, we use the configured path
base_storage_path = None
if settings.storage.local_path and settings.storage.local_path != "data":
    base_storage_path = settings.storage.local_path

storage_manager = StorageManager(
    base_path=base_storage_path,
    max_age_days=settings.storage.max_age_days,
    min_disk_space_gb=settings.storage.min_disk_space_gb,
    emergency_threshold_gb=settings.storage.emergency_cleanup_threshold_gb,
    emergency_target_gb=settings.storage.emergency_cleanup_target_gb
)
session_manager = SessionManager(storage_manager)

# Initialize cleanup scheduler
scheduler = BackgroundScheduler()

def scheduled_cleanup():
    """Scheduled cleanup job that checks for auto-cleanup and disk space"""
    context = {"event_type": "scheduled_cleanup"}
    # logger.info("Running scheduled cleanup check", extra={"context": context})
    try:
        # Check auto-cleanup settings
        settings = settings_service.get_settings()
        if settings.storage.auto_cleanup_enabled:
            threshold = settings.storage.auto_cleanup_threshold
            logger.info(f"Auto-cleanup enabled, cleaning files older than {threshold} hours")
            
            metrics = storage_manager.cleanup_old_files(max_age_hours=threshold)
            
            if metrics['files_deleted'] > 0:
                cleanup_context = {
                    "event_type": "auto_cleanup_completed",
                    "files_deleted": metrics['files_deleted'],
                    "space_freed_mb": metrics['space_freed_mb']
                }
                logger.info(
                    f"Auto-cleanup completed: {metrics['files_deleted']} files deleted, {metrics['space_freed_mb']} MB freed",
                    extra={"context": cleanup_context}
                )

        # Regular check for max_age_days (legacy/fallback) if we want to enforce it? 
        # Actually, if auto_cleanup is disabled, do we still want to clean up very old files? 
        # The prompt implies the user wants control.
        # But storage_manager has defaults. 
        # For now, let's assume the user controls cleanup via the new settings.
        # But if disk space is critical, emergency cleanup still runs.
        
        # Check disk space after cleanup
        available_space = storage_manager.check_disk_space()
        # logger.info(
        #     f"Available disk space: {available_space} GB",
        #     extra={"context": {"available_space_gb": available_space}}
        # )
        
        # Trigger emergency cleanup if still low on space
        if available_space < storage_manager.emergency_threshold_gb:
            logger.warning(
                "Disk space still low after cleanup, triggering emergency cleanup",
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
# Get project root and user data dir
from .utils.path import get_project_root, get_user_data_dir, ensure_user_data

# Ensure user data exists on startup
ensure_user_data()

project_root = get_project_root()
user_data_dir = get_user_data_dir()

# Config is in user_data_dir/../config (i.e., RobomonPiying/config)
config_dir = user_data_dir.parent / "config"
# Assets are bundled with app
assets_dir = project_root / "assets"

print(f"Project root: {project_root.absolute()}")
print(f"Config dir: {config_dir.absolute()}, exists: {config_dir.exists()}")
print(f"Assets dir: {assets_dir.absolute()}, exists: {assets_dir.exists()}")

if config_dir.exists():
    app.mount("/config", StaticFiles(directory=str(config_dir.absolute())), name="config")
    print(f"[OK] Mounted /config -> {config_dir.absolute()}")

if assets_dir.exists():
    app.mount("/scene-assets", StaticFiles(directory=str(assets_dir.absolute())), name="scene_assets")
    print(f"[OK] Mounted /scene-assets -> {assets_dir.absolute()}")

# Mount user frontend static files
frontend_dist = project_root / "frontend" / "dist"
print(f"Frontend dist: {frontend_dist.absolute()}, exists: {frontend_dist.exists()}")

if frontend_dist.exists():
    # Mount user frontend assets (JS, CSS, etc.)
    frontend_assets_dir = frontend_dist / "assets"
    if frontend_assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_assets_dir.absolute())), name="frontend_assets")
        print(f"[OK] Mounted /assets -> {frontend_assets_dir.absolute()}")

# Mount admin frontend static files
admin_frontend_dist = project_root / "admin-frontend" / "dist"
print(f"Admin frontend dist: {admin_frontend_dist.absolute()}, exists: {admin_frontend_dist.exists()}")

if admin_frontend_dist.exists():
    # Mount admin frontend assets (JS, CSS, etc.)
    admin_assets_dir = admin_frontend_dist / "assets"
    if admin_assets_dir.exists():
        app.mount("/admin/assets", StaticFiles(directory=str(admin_assets_dir.absolute())), name="admin_assets")
        print(f"[OK] Mounted /admin/assets -> {admin_assets_dir.absolute()}")

# Include routers AFTER static files
app.include_router(sessions_router)
app.include_router(videos_router)
app.include_router(public_system_router) # Public system settings API (no auth required)
app.include_router(public_storylines_router)  # Public storylines API (no auth required)
app.include_router(public_characters_router)  # Public characters API (no auth required)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(characters_router)
app.include_router(storylines_router)
app.include_router(settings_router)
app.include_router(dashboard_router)
app.include_router(export_import_router)
app.include_router(character_videos_router)  # Character-specific video management

@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logger.info("Starting Shadow Puppet Interactive System API")
    
    # Initialize admin database
    try:
        await init_db()
        logger.info("Admin database initialized")
        
        # Ensure default admin user exists
        from .database import async_session_maker
        async with async_session_maker() as db:
            await auth_service.ensure_default_admin(db)
            logger.info("Default admin user ensured")
    except Exception as e:
        logger.error(f"Failed to initialize admin database: {e}")
    
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
    
    # Start cleanup scheduler - runs every 5 minutes to check for auto-cleanup
    scheduler.add_job(
        scheduled_cleanup,
        trigger=IntervalTrigger(minutes=5),
        id='cleanup_job',
        name='Storage cleanup job',
        replace_existing=True
    )
    scheduler.start()
    logger.info("Cleanup scheduler started - running every 5 minutes")

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
    """Serve user frontend"""
    frontend_index = project_root / "frontend" / "dist" / "index.html"
    if frontend_index.exists():
        return FileResponse(str(frontend_index.absolute()))
    return HTMLResponse(
        content="<h1>Frontend Not Built</h1><p>Please run 'npm run build' in frontend directory.</p>",
        status_code=404
    )

# Admin panel routes - serve the React SPA
@app.get("/admin")
@app.get("/admin/")
async def admin_root():
    """Redirect to admin panel"""
    admin_index = project_root / "admin-frontend" / "dist" / "index.html"
    if admin_index.exists():
        return FileResponse(str(admin_index.absolute()))
    return HTMLResponse(
        content="<h1>Admin Panel Not Built</h1><p>Please run 'npm run build' in admin-frontend directory.</p>",
        status_code=404
    )

@app.get("/admin/{full_path:path}")
async def admin_spa(full_path: str):
    """
    Serve admin panel SPA for all routes.
    This enables client-side routing in the React app.
    """
    admin_dist = project_root / "admin-frontend" / "dist"
    
    # First, try to serve the exact file if it exists (for static assets)
    requested_file = admin_dist / full_path
    if requested_file.exists() and requested_file.is_file():
        return FileResponse(str(requested_file.absolute()))
    
    # Otherwise, serve index.html for client-side routing
    admin_index = admin_dist / "index.html"
    if admin_index.exists():
        return FileResponse(str(admin_index.absolute()))
    
    return HTMLResponse(
        content="<h1>Admin Panel Not Built</h1><p>Please run 'npm run build' in admin-frontend directory.</p>",
        status_code=404
    )

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

# Catch-all route for user frontend SPA (must be last)
# This handles client-side routing for the React app
@app.get("/{full_path:path}")
async def frontend_spa(full_path: str, request: Request):
    """
    Serve user frontend SPA for all non-API routes.
    This enables client-side routing in the React app.
    """
    # Skip if this is an API request
    if full_path.startswith("api/") or full_path.startswith("admin"):
        return HTMLResponse(content="Not Found", status_code=404)
    
    frontend_dist = project_root / "frontend" / "dist"
    
    # First, try to serve the exact file if it exists (for static assets)
    requested_file = frontend_dist / full_path
    if requested_file.exists() and requested_file.is_file():
        return FileResponse(str(requested_file.absolute()))
    
    # Otherwise, serve index.html for client-side routing
    frontend_index = frontend_dist / "index.html"
    if frontend_index.exists():
        return FileResponse(str(frontend_index.absolute()))
    
    return HTMLResponse(
        content="<h1>Frontend Not Built</h1><p>Please run 'npm run build' in frontend directory.</p>",
        status_code=404
    )

if __name__ == "__main__":
    import uvicorn
    import socket
    
    def find_free_port(start_port=8000, max_attempts=10):
        """Find a free port starting from start_port"""
        for port in range(start_port, start_port + max_attempts):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('0.0.0.0', port))
                    return port
            except OSError:
                continue
        raise RuntimeError(f"Could not find a free port in range {start_port}-{start_port + max_attempts - 1}")
    
    port = find_free_port(8000)
    if port != 8000:
        print(f"Port 8000 is in use, using port {port} instead", file=sys.stderr)
    uvicorn.run(app, host="0.0.0.0", port=port)
