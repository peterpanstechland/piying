"""
Settings models for admin panel.
Defines StorageSettings, QRCodeSettings, and SystemSettings models.
"""
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator
import re


class StorageSettings(BaseModel):
    """Settings for video storage configuration."""
    mode: str = Field(default="local", description="Storage mode: 'local' or 's3'")
    local_path: str = Field(default="data", description="Local storage path")
    auto_cleanup_enabled: bool = Field(default=False, description="Enable automatic file cleanup")
    auto_cleanup_threshold: int = Field(default=24, ge=1, description="Cleanup files older than X hours")
    s3_bucket: Optional[str] = Field(default=None, description="S3 bucket name")
    s3_region: Optional[str] = Field(default=None, description="S3 region")
    s3_access_key: Optional[str] = Field(default=None, description="S3 access key")
    s3_secret_key: Optional[str] = Field(default=None, description="S3 secret key (encrypted)")

    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ['local', 's3']:
            raise ValueError("Storage mode must be 'local' or 's3'")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "mode": "local",
                "local_path": "data/outputs",
                "auto_cleanup_enabled": False,
                "auto_cleanup_threshold": 24,
                "s3_bucket": None,
                "s3_region": None,
                "s3_access_key": None,
                "s3_secret_key": None
            }
        }


class QRCodeSettings(BaseModel):
    """Settings for QR code generation."""
    auto_detect_ip: bool = Field(default=True, description="Auto-detect LAN IP")
    manual_ip: Optional[str] = Field(default=None, description="Manual IP override")
    port: int = Field(default=8000, ge=1, le=65535, description="Server port")

    @field_validator('manual_ip')
    @classmethod
    def validate_manual_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != "":
            # Validate IPv4 format
            ipv4_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
            if not re.match(ipv4_pattern, v):
                raise ValueError("Invalid IPv4 address format")
            # Validate each octet is 0-255
            octets = v.split('.')
            for octet in octets:
                if not 0 <= int(octet) <= 255:
                    raise ValueError("Invalid IPv4 address: octets must be 0-255")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "auto_detect_ip": True,
                "manual_ip": None,
                "port": 8000
            }
        }


class TimeoutSettings(BaseModel):
    """Settings for various timeout configurations."""
    idle_to_scene_select_seconds: int = Field(default=1, ge=1, le=300, description="Idle to scene select timeout")
    scene_select_inactivity_seconds: int = Field(default=10, ge=1, le=300, description="Scene selection inactivity timeout")
    motion_capture_inactivity_seconds: int = Field(default=15, ge=1, le=300, description="Motion capture inactivity timeout")
    final_result_auto_reset_seconds: int = Field(default=30, ge=1, le=300, description="Final result auto-reset timeout")
    exit_gesture_duration_seconds: int = Field(default=3, ge=1, le=300, description="Exit gesture duration")
    exit_confirmation_duration_seconds: int = Field(default=2, ge=1, le=300, description="Exit confirmation duration")
    segment_review_inactivity_seconds: int = Field(default=30, ge=1, le=300, description="Segment review page inactivity timeout")
    calibration_timeout_seconds: int = Field(default=60, ge=10, le=300, description="Calibration action timeout")

    class Config:
        json_schema_extra = {
            "example": {
                "idle_to_scene_select_seconds": 1,
                "scene_select_inactivity_seconds": 10,
                "motion_capture_inactivity_seconds": 15,
                "final_result_auto_reset_seconds": 30,
                "exit_gesture_duration_seconds": 3,
                "exit_confirmation_duration_seconds": 2,
                "segment_review_inactivity_seconds": 30,
                "calibration_timeout_seconds": 60
            }
        }


class RenderingSettings(BaseModel):
    """Settings for video rendering configuration."""
    target_fps: int = Field(default=30, ge=15, le=60, description="Target frames per second")
    video_codec: str = Field(default="H264", description="Video codec")
    max_render_time_seconds: int = Field(default=20, ge=5, le=120, description="Maximum render time")
    composition_mode: str = Field(default="side_by_side", description="Video composition mode: 'chromakey' or 'side_by_side'")
    video_encoder: str = Field(default="h264_nvenc", description="FFmpeg video encoder")
    encoder_preset: str = Field(default="slow", description="Encoder preset (speed/quality trade-off)")
    encoder_quality: int = Field(default=19, ge=0, le=51, description="Encoder quality (CQ/CRF)")

    @field_validator('video_codec')
    @classmethod
    def validate_codec(cls, v: str) -> str:
        valid_codecs = ['H264', 'H265', 'VP9']
        if v not in valid_codecs:
            raise ValueError(f"Video codec must be one of: {valid_codecs}")
        return v
    
    @field_validator('composition_mode')
    @classmethod
    def validate_composition_mode(cls, v: str) -> str:
        valid_modes = ['chromakey', 'side_by_side']
        if v not in valid_modes:
            raise ValueError(f"Composition mode must be one of: {valid_modes}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "target_fps": 30,
                "video_codec": "H264",
                "max_render_time_seconds": 20,
                "composition_mode": "side_by_side",
                "video_encoder": "h264_nvenc",
                "encoder_preset": "slow",
                "encoder_quality": 19
            }
        }


class CameraSettings(BaseModel):
    """Settings for camera configuration."""
    default_camera_id: Optional[str] = Field(default=None, description="Default camera device ID")
    min_fps: int = Field(default=20, ge=10, le=60, description="Minimum FPS requirement")
    detection_confidence: float = Field(default=0.5, ge=0.1, le=1.0, description="Detection confidence threshold")

    class Config:
        json_schema_extra = {
            "example": {
                "default_camera_id": None,
                "min_fps": 20,
                "detection_confidence": 0.5
            }
        }


class OTASettings(BaseModel):
    """Settings for OTA (Over-The-Air) update configuration."""
    enabled: bool = Field(default=True, description="Enable OTA update checking")
    check_on_startup: bool = Field(default=True, description="Check for updates on app startup")
    source_type: str = Field(default="github", description="Update source type: 'github' or 'custom'")
    github_owner: str = Field(default="peterpanstechland", description="GitHub repository owner")
    github_repo: str = Field(default="piying", description="GitHub repository name")
    custom_update_url: Optional[str] = Field(default=None, description="Custom update server URL")
    custom_release_url: Optional[str] = Field(default=None, description="Custom release info URL")

    @field_validator('source_type')
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        valid_types = ['github', 'custom']
        if v not in valid_types:
            raise ValueError(f"OTA source type must be one of: {valid_types}")
        return v

    @field_validator('custom_update_url', 'custom_release_url')
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != "":
            # Basic URL validation
            if not (v.startswith('http://') or v.startswith('https://')):
                raise ValueError("URL must start with http:// or https://")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "enabled": True,
                "check_on_startup": True,
                "source_type": "github",
                "github_owner": "peterpanstechland",
                "github_repo": "piying",
                "custom_update_url": None,
                "custom_release_url": None
            }
        }


class SystemSettings(BaseModel):
    """Complete system settings model."""
    theme: str = Field(default="dark", description="UI Theme")
    language: str = Field(default="zh", description="Default language")
    fallback_language: str = Field(default="en", description="Fallback language")
    storage: StorageSettings = Field(default_factory=StorageSettings, description="Storage configuration")
    qr_code: QRCodeSettings = Field(default_factory=QRCodeSettings, description="QR code configuration")
    camera: CameraSettings = Field(default_factory=CameraSettings, description="Camera configuration")
    timeouts: TimeoutSettings = Field(default_factory=TimeoutSettings, description="Timeout configurations")
    rendering: RenderingSettings = Field(default_factory=RenderingSettings, description="Rendering settings")
    ota: OTASettings = Field(default_factory=OTASettings, description="OTA update settings")

    @field_validator('theme')
    @classmethod
    def validate_theme(cls, v: str) -> str:
        valid_themes = ['light', 'dark']
        if v not in valid_themes:
            raise ValueError(f"Theme must be one of: {valid_themes}")
        return v

    @field_validator('language', 'fallback_language')
    @classmethod
    def validate_language(cls, v: str) -> str:
        valid_languages = ['zh', 'en']
        if v not in valid_languages:
            raise ValueError(f"Language must be one of: {valid_languages}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "language": "zh",
                "fallback_language": "en",
                "storage": {
                    "mode": "local",
                    "local_path": "data/outputs"
                },
                "qr_code": {
                    "auto_detect_ip": True,
                    "port": 8000
                },
                "camera": {
                    "min_fps": 20,
                    "detection_confidence": 0.5
                },
                "timeouts": {
                    "idle_to_scene_select_seconds": 1,
                    "scene_select_inactivity_seconds": 10
                },
                "rendering": {
                    "target_fps": 30,
                    "video_codec": "H264"
                }
            }
        }


# API Request/Response Models

class StorageSettingsUpdate(BaseModel):
    """Schema for updating storage settings."""
    mode: Optional[str] = Field(default=None, description="Storage mode: 'local' or 's3'")
    local_path: Optional[str] = Field(default=None, description="Local storage path")
    auto_cleanup_enabled: Optional[bool] = Field(default=None, description="Enable automatic file cleanup")
    auto_cleanup_threshold: Optional[int] = Field(default=None, ge=1, description="Cleanup files older than X hours")
    s3_bucket: Optional[str] = Field(default=None, description="S3 bucket name")
    s3_region: Optional[str] = Field(default=None, description="S3 region")
    s3_access_key: Optional[str] = Field(default=None, description="S3 access key")
    s3_secret_key: Optional[str] = Field(default=None, description="S3 secret key")

    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ['local', 's3']:
            raise ValueError("Storage mode must be 'local' or 's3'")
        return v


class QRCodeSettingsUpdate(BaseModel):
    """Schema for updating QR code settings."""
    auto_detect_ip: Optional[bool] = Field(default=None, description="Auto-detect LAN IP")
    manual_ip: Optional[str] = Field(default=None, description="Manual IP override")
    port: Optional[int] = Field(default=None, ge=1, le=65535, description="Server port")


class TimeoutSettingsUpdate(BaseModel):
    """Schema for updating timeout settings."""
    idle_to_scene_select_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    scene_select_inactivity_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    motion_capture_inactivity_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    final_result_auto_reset_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    exit_gesture_duration_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    exit_confirmation_duration_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    segment_review_inactivity_seconds: Optional[int] = Field(default=None, ge=1, le=300)
    calibration_timeout_seconds: Optional[int] = Field(default=None, ge=10, le=300)


class RenderingSettingsUpdate(BaseModel):
    """Schema for updating rendering settings."""
    target_fps: Optional[int] = Field(default=None, ge=15, le=60)
    video_codec: Optional[str] = Field(default=None)
    max_render_time_seconds: Optional[int] = Field(default=None, ge=5, le=120)
    composition_mode: Optional[str] = Field(default=None)
    video_encoder: Optional[str] = Field(default=None)
    encoder_preset: Optional[str] = Field(default=None)
    encoder_quality: Optional[int] = Field(default=None, ge=0, le=51)


class CameraSettingsUpdate(BaseModel):
    """Schema for updating camera settings."""
    default_camera_id: Optional[str] = Field(default=None)
    min_fps: Optional[int] = Field(default=None, ge=10, le=60)
    detection_confidence: Optional[float] = Field(default=None, ge=0.1, le=1.0)


class OTASettingsUpdate(BaseModel):
    """Schema for updating OTA settings."""
    enabled: Optional[bool] = Field(default=None, description="Enable OTA update checking")
    check_on_startup: Optional[bool] = Field(default=None, description="Check for updates on app startup")
    source_type: Optional[str] = Field(default=None, description="Update source type: 'github' or 'custom'")
    github_owner: Optional[str] = Field(default=None, description="GitHub repository owner")
    github_repo: Optional[str] = Field(default=None, description="GitHub repository name")
    custom_update_url: Optional[str] = Field(default=None, description="Custom update server URL")
    custom_release_url: Optional[str] = Field(default=None, description="Custom release info URL")

    @field_validator('source_type')
    @classmethod
    def validate_source_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ['github', 'custom']:
            raise ValueError("OTA source type must be 'github' or 'custom'")
        return v


class SystemSettingsUpdate(BaseModel):
    """Schema for updating system settings."""
    theme: Optional[str] = Field(default=None, description="UI Theme")
    language: Optional[str] = Field(default=None, description="Default language")
    fallback_language: Optional[str] = Field(default=None, description="Fallback language")
    storage: Optional[StorageSettingsUpdate] = Field(default=None)
    qr_code: Optional[QRCodeSettingsUpdate] = Field(default=None)
    camera: Optional[CameraSettingsUpdate] = Field(default=None)
    timeouts: Optional[TimeoutSettingsUpdate] = Field(default=None)
    rendering: Optional[RenderingSettingsUpdate] = Field(default=None)
    ota: Optional[OTASettingsUpdate] = Field(default=None)


class S3ConnectionTestRequest(BaseModel):
    """Schema for S3 connection test request."""
    bucket: str = Field(..., description="S3 bucket name")
    region: str = Field(..., description="S3 region")
    access_key: str = Field(..., description="S3 access key")
    secret_key: str = Field(..., description="S3 secret key")


class S3ConnectionTestResponse(BaseModel):
    """Schema for S3 connection test response."""
    success: bool = Field(..., description="Whether connection test succeeded")
    message: str = Field(..., description="Result message or error details")


class LANIPResponse(BaseModel):
    """Schema for LAN IP response."""
    ip: str = Field(..., description="Current LAN IP address")
    auto_detected: bool = Field(..., description="Whether IP was auto-detected")


class CameraDevice(BaseModel):
    """Schema for camera device information."""
    device_id: str = Field(..., description="Camera device ID")
    name: str = Field(..., description="Camera device name")
    is_default: bool = Field(default=False, description="Whether this is the default camera")


class CameraListResponse(BaseModel):
    """Schema for camera list response."""
    cameras: list[CameraDevice] = Field(default_factory=list, description="Available cameras")
    default_camera_id: Optional[str] = Field(default=None, description="Current default camera ID")
