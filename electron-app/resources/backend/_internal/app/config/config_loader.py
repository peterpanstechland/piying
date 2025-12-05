"""
Configuration loader for scene and system settings
"""
import json
import logging
import sys
from pathlib import Path
from typing import Dict, Optional, Any
from pydantic import BaseModel, Field, ValidationError, field_validator

logger = logging.getLogger(__name__)


class SegmentConfig(BaseModel):
    """Configuration for a single segment"""
    start_time: float = Field(default=0.0, ge=0, description="Start time in video (seconds)")
    duration: float = Field(..., gt=0, description="Segment duration in seconds")
    path_type: str = Field(default="static", description="Movement path type")
    offset_start: list[int] = Field(default_factory=lambda: [0, 0], description="Starting offset [x, y]")
    offset_end: list[int] = Field(default_factory=lambda: [0, 0], description="Ending offset [x, y]")
    
    # Path configuration
    path_waypoints: list[list[int]] = Field(default_factory=list, description="Path waypoints [[x1,y1], [x2,y2], ...]")
    path_draw_type: str = Field(default="linear", description="Path draw type: linear, bezier, freehand")
    
    # Entry animation
    entry_type: str = Field(default="instant", description="Entry animation type")
    entry_duration: float = Field(default=1.0, ge=0, description="Entry animation duration in seconds")
    entry_delay: float = Field(default=0.0, ge=0, description="Entry animation delay in seconds")
    
    # Exit animation
    exit_type: str = Field(default="instant", description="Exit animation type")
    exit_duration: float = Field(default=1.0, ge=0, description="Exit animation duration in seconds")
    exit_delay: float = Field(default=0.0, ge=0, description="Exit animation delay in seconds")
    
    @field_validator('offset_start', 'offset_end')
    @classmethod
    def validate_offset(cls, v):
        if len(v) != 2:
            raise ValueError("Offset must be a list of 2 integers [x, y]")
        return v


class SceneConfig(BaseModel):
    """Configuration for a single scene"""
    id: str = Field(..., description="Scene identifier")
    name: str = Field(..., description="Scene name (Chinese)")
    name_en: str = Field(..., description="Scene name (English)")
    description: str = Field(..., description="Scene description (Chinese)")
    description_en: str = Field(..., description="Scene description (English)")
    base_video_path: str = Field(..., description="Path to base video file")
    icon: str = Field(..., description="Scene icon (emoji or path)")
    segments: list[SegmentConfig] = Field(..., min_length=1, description="Segment configurations")
    
    @field_validator('segments')
    @classmethod
    def validate_segments(cls, v):
        if not v:
            raise ValueError("Scene must have at least one segment")
        return v


class SystemConfig(BaseModel):
    """System-wide configuration"""
    language: str = Field(default="zh", description="Default language")
    fallback_language: str = Field(default="en", description="Fallback language")


class CameraConfig(BaseModel):
    """Camera configuration"""
    min_fps: int = Field(default=20, ge=1, description="Minimum FPS")
    detection_confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="Detection confidence threshold")


class TimeoutsConfig(BaseModel):
    """Timeout configuration"""
    idle_to_scene_select_seconds: int = Field(default=1, ge=0)
    scene_select_inactivity_seconds: int = Field(default=10, ge=0)
    motion_capture_inactivity_seconds: int = Field(default=15, ge=0)
    final_result_auto_reset_seconds: int = Field(default=30, ge=0)
    exit_gesture_duration_seconds: int = Field(default=3, ge=0)
    exit_confirmation_duration_seconds: int = Field(default=2, ge=0)


class InteractionConfig(BaseModel):
    """Interaction configuration"""
    hover_selection_duration_seconds: int = Field(default=5, ge=1)
    countdown_duration_seconds: int = Field(default=5, ge=1)
    cursor_latency_ms: int = Field(default=100, ge=0)
    state_transition_max_ms: int = Field(default=1000, ge=0)


class StorageConfig(BaseModel):
    """Storage configuration"""
    max_age_days: int = Field(default=7, ge=1)
    min_disk_space_gb: int = Field(default=5, ge=1)
    emergency_cleanup_threshold_gb: int = Field(default=2, ge=1)
    emergency_cleanup_target_gb: int = Field(default=3, ge=1)
    
    # S3 Configuration
    mode: str = Field(default="local", description="Storage mode: 'local' or 's3'")
    s3_bucket: Optional[str] = Field(default=None)
    s3_region: Optional[str] = Field(default=None)
    s3_access_key: Optional[str] = Field(default=None)
    s3_secret_key: Optional[str] = Field(default=None)


class RenderingConfig(BaseModel):
    """Rendering configuration"""
    target_fps: int = Field(default=30, ge=1)
    video_codec: str = Field(default="H264")
    max_render_time_seconds: int = Field(default=20, ge=1)


class APIConfig(BaseModel):
    """API configuration"""
    retry_attempts: int = Field(default=3, ge=0)
    retry_backoff_base_ms: int = Field(default=1000, ge=0)
    polling_interval_ms: int = Field(default=2000, ge=100)


class Settings(BaseModel):
    """Complete settings configuration"""
    system: SystemConfig = Field(default_factory=SystemConfig)
    camera: CameraConfig = Field(default_factory=CameraConfig)
    timeouts: TimeoutsConfig = Field(default_factory=TimeoutsConfig)
    interaction: InteractionConfig = Field(default_factory=InteractionConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)
    rendering: RenderingConfig = Field(default_factory=RenderingConfig)
    api: APIConfig = Field(default_factory=APIConfig)


class ConfigLoader:
    """Loads and validates scene and system configurations"""
    
    def __init__(self, config_dir: str = None):
        """
        Initialize ConfigLoader
        
        Args:
            config_dir: Directory containing configuration files (default: project_root/config)
        """
        if config_dir:
            self.config_dir = Path(config_dir)
        else:
            # Determine project root
            if getattr(sys, 'frozen', False):
                # Running in PyInstaller bundle
                # sys.executable is in project_root/backend.exe (one-file) or project_root/ (one-dir)
                # But typically we put config folder alongside the executable
                project_root = Path(sys.executable).parent
            else:
                # Default to project root's config directory (dev mode)
                # __file__ is backend/app/config/config_loader.py
                # project root is 3 levels up: backend/
                project_root = Path(__file__).parent.parent.parent.parent
            
            self.config_dir = project_root / "config"
        
        self.scenes_file = self.config_dir / "scenes.json"
        self.settings_file = self.config_dir / "settings.json"
        
        self._scenes: Dict[str, SceneConfig] = {}
        self._settings: Settings = Settings()
        
        # Load configurations
        self.reload()
    
    def load_scenes(self, config_path: Optional[str] = None) -> Dict[str, SceneConfig]:
        """
        Load scene configurations from JSON file
        
        Args:
            config_path: Optional path to scenes.json (default: config/scenes.json)
            
        Returns:
            Dictionary mapping scene IDs to SceneConfig objects
        """
        if config_path:
            scenes_file = Path(config_path)
        else:
            scenes_file = self.scenes_file
        
        if not scenes_file.exists():
            logger.error(f"Scenes configuration file not found: {scenes_file}")
            return self._get_default_scenes()
        
        try:
            with open(scenes_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if 'scenes' not in data:
                logger.error("Invalid scenes.json format: missing 'scenes' key")
                return self._get_default_scenes()
            
            scenes = {}
            for scene_id, scene_data in data['scenes'].items():
                try:
                    scene_config = SceneConfig(**scene_data)
                    scenes[scene_id] = scene_config
                except ValidationError as e:
                    logger.error(f"Validation error for scene {scene_id}: {e}")
                    continue
            
            if not scenes:
                logger.warning("No valid scenes found, using defaults")
                return self._get_default_scenes()
            
            logger.info(f"Loaded {len(scenes)} scene configurations")
            return scenes
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in {scenes_file}: {e}")
            return self._get_default_scenes()
        except Exception as e:
            logger.error(f"Error loading scenes configuration: {e}")
            return self._get_default_scenes()
    
    def load_settings(self, config_path: Optional[str] = None) -> Settings:
        """
        Load system settings from JSON file
        
        Args:
            config_path: Optional path to settings.json (default: config/settings.json)
            
        Returns:
            Settings object with system configuration
        """
        if config_path:
            settings_file = Path(config_path)
        else:
            settings_file = self.settings_file
        
        if not settings_file.exists():
            logger.warning(f"Settings file not found: {settings_file}, using defaults")
            return Settings()
        
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            settings = Settings(**data)
            logger.info("Loaded system settings")
            return settings
            
        except ValidationError as e:
            logger.error(f"Validation error in settings: {e}")
            logger.warning("Using default settings")
            return Settings()
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in {settings_file}: {e}")
            logger.warning("Using default settings")
            return Settings()
        except Exception as e:
            logger.error(f"Error loading settings: {e}")
            logger.warning("Using default settings")
            return Settings()
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate a configuration dictionary
        
        Args:
            config: Configuration dictionary to validate
            
        Returns:
            True if valid, False otherwise
        """
        try:
            if 'scenes' in config:
                # Validate scenes configuration
                for scene_id, scene_data in config['scenes'].items():
                    SceneConfig(**scene_data)
            else:
                # Validate settings configuration
                Settings(**config)
            return True
        except ValidationError as e:
            logger.error(f"Configuration validation failed: {e}")
            return False
    
    def reload(self) -> None:
        """Reload all configurations from files"""
        self._scenes = self.load_scenes()
        self._settings = self.load_settings()
        logger.info("Configuration reloaded")
    
    def get_scene(self, scene_id: str) -> Optional[SceneConfig]:
        """
        Get configuration for a specific scene
        
        Args:
            scene_id: Scene identifier
            
        Returns:
            SceneConfig if found, None otherwise
        """
        return self._scenes.get(scene_id)
    
    def get_all_scenes(self) -> Dict[str, SceneConfig]:
        """
        Get all scene configurations
        
        Returns:
            Dictionary mapping scene IDs to SceneConfig objects
        """
        return self._scenes.copy()
    
    def get_settings(self) -> Settings:
        """
        Get system settings
        
        Returns:
            Settings object
        """
        return self._settings
    
    def _get_default_scenes(self) -> Dict[str, SceneConfig]:
        """
        Get default fallback scene configurations
        
        Returns:
            Dictionary with default scenes
        """
        logger.info("Using default fallback scene configurations")
        
        default_scenes = {
            "sceneA": SceneConfig(
                id="sceneA",
                name="默认场景A",
                name_en="Default Scene A",
                description="默认场景描述",
                description_en="Default scene description",
                base_video_path="assets/scenes/sceneA_base.mp4",
                icon="🎭",
                segments=[
                    SegmentConfig(
                        duration=10.0,
                        path_type="static",
                        offset_start=[0, 0],
                        offset_end=[0, 0]
                    )
                ]
            )
        }
        
        return default_scenes
