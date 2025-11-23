"""
FastAPI application entry point for Shadow Puppet Interactive System
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import sessions_router
from .config import ConfigLoader
from .services import StorageManager, SessionManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
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

# Include routers
app.include_router(sessions_router)

@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logger.info("Starting Shadow Puppet Interactive System API")
    
    # Check disk space on startup
    available_space = storage_manager.check_disk_space()
    logger.info(f"Available disk space: {available_space} GB")
    
    # Load scenes
    scenes = config_loader.get_all_scenes()
    logger.info(f"Loaded {len(scenes)} scenes: {list(scenes.keys())}")

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Shadow Puppet Interactive System API", "status": "running"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    stats = storage_manager.get_storage_stats()
    active_sessions = len(session_manager.list_sessions())
    
    return {
        "status": "healthy",
        "disk_space_gb": stats['available_space_gb'],
        "active_sessions": active_sessions,
        "session_count": stats['session_count'],
        "video_count": stats['video_count'],
        "total_size_mb": stats['total_size_mb']
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
