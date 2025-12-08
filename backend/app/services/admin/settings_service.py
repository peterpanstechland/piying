"""
Settings service for admin panel.
Handles system settings CRUD operations, S3 connection testing, and LAN IP detection.
"""
import json
import logging
import os
import socket
import sys
from pathlib import Path
from typing import Optional, Dict, Any

from ...models.admin.settings import (
    SystemSettings,
    StorageSettings,
    QRCodeSettings,
    TimeoutSettings,
    RenderingSettings,
    CameraSettings,
    SystemSettingsUpdate,
    StorageSettingsUpdate,
    S3ConnectionTestResponse,
    LANIPResponse,
    CameraDevice,
)


# Determine project root and settings file path
from ...utils.path import get_user_data_dir

logger = logging.getLogger(__name__)

# Settings are stored in user data/../config (RobomonPiying/config)
SETTINGS_FILE_PATH = get_user_data_dir().parent / "config" / "settings.json"


class SettingsService:
    """Service for handling system settings operations."""

    def __init__(self, settings_path: Optional[Path] = None):
        """Initialize the settings service with optional custom path."""
        self.settings_path = settings_path or SETTINGS_FILE_PATH
        self._cached_settings: Optional[SystemSettings] = None

    def _load_settings_from_file(self) -> Dict[str, Any]:
        """Load raw settings from JSON file."""
        if not self.settings_path.exists():
            return {}
        
        try:
            with open(self.settings_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}

    def _save_settings_to_file(self, settings_dict: Dict[str, Any]) -> None:
        """Save settings dictionary to JSON file."""
        # Ensure directory exists
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(self.settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings_dict, f, indent=2, ensure_ascii=False)


    def _convert_file_to_model(self, raw_settings: Dict[str, Any]) -> SystemSettings:
        """Convert raw file settings to SystemSettings model."""
        # Map the file structure to our model structure
        system = raw_settings.get("system", {})
        camera = raw_settings.get("camera", {})
        timeouts = raw_settings.get("timeouts", {})
        storage = raw_settings.get("storage", {})
        rendering = raw_settings.get("rendering", {})
        qr_code = raw_settings.get("qr_code", {})
        
        return SystemSettings(
            theme=system.get("theme", "dark"),
            language=system.get("language", "zh"),
            fallback_language=system.get("fallback_language", "en"),
            storage=StorageSettings(
                mode=storage.get("mode", "local"),
                # Default to "data" which will be resolved to user_data_dir
                # This ensures consistency with StorageManager and VideoRenderer
                local_path=storage.get("local_path", "data"),
                auto_cleanup_enabled=storage.get("auto_cleanup_enabled", False),
                auto_cleanup_threshold=storage.get("auto_cleanup_threshold", 24),
                s3_bucket=storage.get("s3_bucket"),
                s3_region=storage.get("s3_region"),
                s3_access_key=storage.get("s3_access_key"),
                s3_secret_key=storage.get("s3_secret_key"),
            ),
            qr_code=QRCodeSettings(
                auto_detect_ip=qr_code.get("auto_detect_ip", True),
                manual_ip=qr_code.get("manual_ip"),
                port=qr_code.get("port", 8000),
            ),
            camera=CameraSettings(
                default_camera_id=camera.get("default_camera_id"),
                min_fps=camera.get("min_fps", 20),
                detection_confidence=camera.get("detection_confidence", 0.5),
            ),
            timeouts=TimeoutSettings(
                idle_to_scene_select_seconds=timeouts.get("idle_to_scene_select_seconds", 1),
                scene_select_inactivity_seconds=timeouts.get("scene_select_inactivity_seconds", 10),
                motion_capture_inactivity_seconds=timeouts.get("motion_capture_inactivity_seconds", 15),
                final_result_auto_reset_seconds=timeouts.get("final_result_auto_reset_seconds", 30),
                exit_gesture_duration_seconds=timeouts.get("exit_gesture_duration_seconds", 3),
                exit_confirmation_duration_seconds=timeouts.get("exit_confirmation_duration_seconds", 2),
            ),
            rendering=RenderingSettings(
                target_fps=rendering.get("target_fps", 30),
                video_codec=rendering.get("video_codec", "H264"),
                max_render_time_seconds=rendering.get("max_render_time_seconds", 20),
                composition_mode=rendering.get("composition_mode", "side_by_side"),
                video_encoder=rendering.get("video_encoder", "h264_nvenc"),
                encoder_preset=rendering.get("encoder_preset", "slow"),
                encoder_quality=rendering.get("encoder_quality", 19),
            ),
        )

    def _convert_model_to_file(self, settings: SystemSettings) -> Dict[str, Any]:
        """Convert SystemSettings model to file structure."""
        return {
            "system": {
                "theme": settings.theme,
                "language": settings.language,
                "fallback_language": settings.fallback_language,
            },
            "camera": {
                "default_camera_id": settings.camera.default_camera_id,
                "min_fps": settings.camera.min_fps,
                "detection_confidence": settings.camera.detection_confidence,
            },
            "timeouts": {
                "idle_to_scene_select_seconds": settings.timeouts.idle_to_scene_select_seconds,
                "scene_select_inactivity_seconds": settings.timeouts.scene_select_inactivity_seconds,
                "motion_capture_inactivity_seconds": settings.timeouts.motion_capture_inactivity_seconds,
                "final_result_auto_reset_seconds": settings.timeouts.final_result_auto_reset_seconds,
                "exit_gesture_duration_seconds": settings.timeouts.exit_gesture_duration_seconds,
                "exit_confirmation_duration_seconds": settings.timeouts.exit_confirmation_duration_seconds,
            },
            "storage": {
                "mode": settings.storage.mode,
                "local_path": settings.storage.local_path,
                "auto_cleanup_enabled": settings.storage.auto_cleanup_enabled,
                "auto_cleanup_threshold": settings.storage.auto_cleanup_threshold,
                "s3_bucket": settings.storage.s3_bucket,
                "s3_region": settings.storage.s3_region,
                "s3_access_key": settings.storage.s3_access_key,
                "s3_secret_key": settings.storage.s3_secret_key,
                # Keep existing storage settings that aren't in our model
                "max_age_days": 7,
                "min_disk_space_gb": 5,
                "emergency_cleanup_threshold_gb": 2,
                "emergency_cleanup_target_gb": 3,
            },
            "rendering": {
                "target_fps": settings.rendering.target_fps,
                "video_codec": settings.rendering.video_codec,
                "max_render_time_seconds": settings.rendering.max_render_time_seconds,
                "composition_mode": settings.rendering.composition_mode,
                "video_encoder": settings.rendering.video_encoder,
                "encoder_preset": settings.rendering.encoder_preset,
                "encoder_quality": settings.rendering.encoder_quality,
            },
            "qr_code": {
                "auto_detect_ip": settings.qr_code.auto_detect_ip,
                "manual_ip": settings.qr_code.manual_ip,
                "port": settings.qr_code.port,
            },
            # Keep existing settings that aren't in our model
            "interaction": {
                "hover_selection_duration_seconds": 5,
                "countdown_duration_seconds": 5,
                "cursor_latency_ms": 100,
                "state_transition_max_ms": 1000,
            },
            "api": {
                "retry_attempts": 3,
                "retry_backoff_base_ms": 1000,
                "polling_interval_ms": 2000,
            },
        }


    def get_settings(self) -> SystemSettings:
        """Get current system settings."""
        raw_settings = self._load_settings_from_file()
        settings = self._convert_file_to_model(raw_settings)
        
        # Auto-fix: If local_path points to a non-existent or invalid location,
        # reset it to default "data" which will resolve to user_data_dir
        if settings.storage.local_path and settings.storage.local_path != "data":
            from ...utils.path import resolve_relative_path
            try:
                resolved_path = resolve_relative_path(settings.storage.local_path)
                # If resolved path doesn't exist or is in a weird location (like dist_v4),
                # reset to default
                if not resolved_path.exists() or "dist_v" in str(resolved_path) or "win-unpacked" in str(resolved_path):
                    logger.warning(f"Invalid storage path detected: {settings.storage.local_path} -> {resolved_path}, resetting to default")
                    settings.storage.local_path = "data"
                    # Save the fixed settings
                    file_dict = self._convert_model_to_file(settings)
                    self._save_settings_to_file(file_dict)
            except Exception as e:
                logger.warning(f"Error validating storage path {settings.storage.local_path}: {e}, resetting to default")
                settings.storage.local_path = "data"
                file_dict = self._convert_model_to_file(settings)
                self._save_settings_to_file(file_dict)
        
        return settings

    def update_settings(self, update: SystemSettingsUpdate) -> SystemSettings:
        """
        Update system settings with partial update.
        Only updates fields that are provided (not None).
        Settings are applied immediately without restart.
        """
        current = self.get_settings()
        
        # Update top-level fields
        if update.theme is not None:
            current.theme = update.theme
        if update.language is not None:
            current.language = update.language
        if update.fallback_language is not None:
            current.fallback_language = update.fallback_language
        
        # Update storage settings
        if update.storage is not None:
            if update.storage.mode is not None:
                current.storage.mode = update.storage.mode
            if update.storage.local_path is not None:
                current.storage.local_path = update.storage.local_path
            if update.storage.auto_cleanup_enabled is not None:
                current.storage.auto_cleanup_enabled = update.storage.auto_cleanup_enabled
            if update.storage.auto_cleanup_threshold is not None:
                current.storage.auto_cleanup_threshold = update.storage.auto_cleanup_threshold
            if update.storage.s3_bucket is not None:
                current.storage.s3_bucket = update.storage.s3_bucket
            if update.storage.s3_region is not None:
                current.storage.s3_region = update.storage.s3_region
            if update.storage.s3_access_key is not None:
                current.storage.s3_access_key = update.storage.s3_access_key
            if update.storage.s3_secret_key is not None:
                current.storage.s3_secret_key = update.storage.s3_secret_key
        
        # Update QR code settings
        if update.qr_code is not None:
            if update.qr_code.auto_detect_ip is not None:
                current.qr_code.auto_detect_ip = update.qr_code.auto_detect_ip
            if update.qr_code.manual_ip is not None:
                current.qr_code.manual_ip = update.qr_code.manual_ip
            if update.qr_code.port is not None:
                current.qr_code.port = update.qr_code.port
        
        # Update camera settings
        if update.camera is not None:
            if update.camera.default_camera_id is not None:
                current.camera.default_camera_id = update.camera.default_camera_id
            if update.camera.min_fps is not None:
                current.camera.min_fps = update.camera.min_fps
            if update.camera.detection_confidence is not None:
                current.camera.detection_confidence = update.camera.detection_confidence
        
        # Update timeout settings
        if update.timeouts is not None:
            if update.timeouts.idle_to_scene_select_seconds is not None:
                current.timeouts.idle_to_scene_select_seconds = update.timeouts.idle_to_scene_select_seconds
            if update.timeouts.scene_select_inactivity_seconds is not None:
                current.timeouts.scene_select_inactivity_seconds = update.timeouts.scene_select_inactivity_seconds
            if update.timeouts.motion_capture_inactivity_seconds is not None:
                current.timeouts.motion_capture_inactivity_seconds = update.timeouts.motion_capture_inactivity_seconds
            if update.timeouts.final_result_auto_reset_seconds is not None:
                current.timeouts.final_result_auto_reset_seconds = update.timeouts.final_result_auto_reset_seconds
            if update.timeouts.exit_gesture_duration_seconds is not None:
                current.timeouts.exit_gesture_duration_seconds = update.timeouts.exit_gesture_duration_seconds
            if update.timeouts.exit_confirmation_duration_seconds is not None:
                current.timeouts.exit_confirmation_duration_seconds = update.timeouts.exit_confirmation_duration_seconds
        
        # Update rendering settings
        if update.rendering is not None:
            if update.rendering.target_fps is not None:
                current.rendering.target_fps = update.rendering.target_fps
            if update.rendering.video_codec is not None:
                current.rendering.video_codec = update.rendering.video_codec
            if update.rendering.max_render_time_seconds is not None:
                current.rendering.max_render_time_seconds = update.rendering.max_render_time_seconds
            if update.rendering.composition_mode is not None:
                current.rendering.composition_mode = update.rendering.composition_mode
            if update.rendering.video_encoder is not None:
                current.rendering.video_encoder = update.rendering.video_encoder
            if update.rendering.encoder_preset is not None:
                current.rendering.encoder_preset = update.rendering.encoder_preset
            if update.rendering.encoder_quality is not None:
                current.rendering.encoder_quality = update.rendering.encoder_quality
        
        # Save to file
        file_dict = self._convert_model_to_file(current)
        self._save_settings_to_file(file_dict)
        
        # Clear cache
        self._cached_settings = None
        
        return current

    def get_storage_settings(self) -> StorageSettings:
        """Get storage configuration."""
        settings = self.get_settings()
        return settings.storage

    def update_storage_settings(self, update: StorageSettingsUpdate) -> StorageSettings:
        """Update storage configuration."""
        settings_update = SystemSettingsUpdate(storage=update)
        updated = self.update_settings(settings_update)
        return updated.storage

    def validate_s3_config(self, storage: StorageSettings) -> Optional[str]:
        """
        Validate S3 configuration when S3 mode is selected.
        Returns error message if invalid, None if valid.
        """
        if storage.mode != 's3':
            return None
        
        missing_fields = []
        if not storage.s3_bucket:
            missing_fields.append("s3_bucket")
        if not storage.s3_region:
            missing_fields.append("s3_region")
        if not storage.s3_access_key:
            missing_fields.append("s3_access_key")
        if not storage.s3_secret_key:
            missing_fields.append("s3_secret_key")
        
        if missing_fields:
            return f"S3 mode requires: {', '.join(missing_fields)}"
        
        return None


    def test_s3_connection(
        self, 
        bucket: str, 
        region: str, 
        access_key: str, 
        secret_key: str
    ) -> S3ConnectionTestResponse:
        """
        Test S3 connection with provided credentials.
        Returns success status and message.
        """
        try:
            import boto3
            from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError
            
            # Create S3 client with provided credentials
            s3_client = boto3.client(
                's3',
                region_name=region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
            )
            
            # Try to head the bucket to verify access
            s3_client.head_bucket(Bucket=bucket)
            
            return S3ConnectionTestResponse(
                success=True,
                message=f"Successfully connected to S3 bucket '{bucket}' in region '{region}'"
            )
            
        except ImportError:
            return S3ConnectionTestResponse(
                success=False,
                message="boto3 library is not installed. Please install it with: pip install boto3"
            )
        except NoCredentialsError:
            return S3ConnectionTestResponse(
                success=False,
                message="Invalid AWS credentials provided"
            )
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            return S3ConnectionTestResponse(
                success=False,
                message=f"AWS Error ({error_code}): {error_message}"
            )
        except EndpointConnectionError as e:
            return S3ConnectionTestResponse(
                success=False,
                message=f"Could not connect to S3 endpoint: {str(e)}"
            )
        except Exception as e:
            return S3ConnectionTestResponse(
                success=False,
                message=f"Connection test failed: {str(e)}"
            )

    def detect_lan_ip(self) -> str:
        """
        Auto-detect the machine's LAN IP address.
        Returns a valid IPv4 address.
        """
        try:
            # Create a socket to determine the local IP
            # This doesn't actually send any data, just determines the route
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                # Connect to a public DNS server (doesn't actually connect)
                s.connect(('8.8.8.8', 80))
                ip = s.getsockname()[0]
            finally:
                s.close()
            return ip
        except Exception:
            # Fallback to localhost if detection fails
            return '127.0.0.1'

    def get_lan_ip(self) -> LANIPResponse:
        """
        Get the current LAN IP address based on settings.
        Uses manual IP if configured, otherwise auto-detects.
        """
        settings = self.get_settings()
        
        if not settings.qr_code.auto_detect_ip and settings.qr_code.manual_ip:
            return LANIPResponse(
                ip=settings.qr_code.manual_ip,
                auto_detected=False
            )
        
        detected_ip = self.detect_lan_ip()
        return LANIPResponse(
            ip=detected_ip,
            auto_detected=True
        )

    def set_default_camera(self, camera_id: str) -> SystemSettings:
        """Set the default camera device ID."""
        from ...models.admin.settings import CameraSettingsUpdate
        settings_update = SystemSettingsUpdate(
            camera=CameraSettingsUpdate(default_camera_id=camera_id)
        )
        return self.update_settings(settings_update)

    def get_available_cameras(self) -> list[CameraDevice]:
        """
        Get list of available camera devices.
        Note: This is a placeholder - actual camera enumeration
        would require platform-specific code or frontend detection.
        """
        # In practice, camera enumeration is typically done on the frontend
        # using navigator.mediaDevices.enumerateDevices()
        # This returns a placeholder for API consistency
        settings = self.get_settings()
        default_id = settings.camera.default_camera_id
        
        # Return empty list - cameras should be enumerated on frontend
        return []

    def validate_timeout_value(self, value: int) -> bool:
        """
        Validate that a timeout value is within acceptable range (1-300 seconds).
        """
        return 1 <= value <= 300


# Singleton instance
settings_service = SettingsService()
