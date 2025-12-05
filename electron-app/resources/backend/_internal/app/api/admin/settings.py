"""
Settings API endpoints for admin panel.
Handles system settings CRUD operations, storage configuration, S3 connection testing,
camera settings, and QR code configuration.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models.admin.settings import (
    SystemSettings,
    StorageSettings,
    SystemSettingsUpdate,
    StorageSettingsUpdate,
    S3ConnectionTestRequest,
    S3ConnectionTestResponse,
    LANIPResponse,
    CameraListResponse,
    CameraDevice,
)
from ...models.admin import TokenPayload
from ...services.admin.settings_service import settings_service
from .auth import get_current_user

router = APIRouter(prefix="/api/admin/settings", tags=["Admin Settings"])


# ============================================================================
# General Settings Endpoints (Task 11.1)
# ============================================================================

@router.get("", response_model=SystemSettings)
async def get_all_settings(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> SystemSettings:
    """
    Get all system settings.
    
    Returns complete system configuration including storage, QR code,
    camera, timeout, and rendering settings.
    
    Requirements: 7.1, 7.2, 8.1, 8.2, 9.1, 9.2, 9.3
    """
    return settings_service.get_settings()


@router.put("", response_model=SystemSettings)
async def update_settings(
    update_data: SystemSettingsUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> SystemSettings:
    """
    Update system settings.
    
    Accepts partial updates - only provided fields will be updated.
    Settings are applied immediately without requiring a restart.
    
    - **language**: Default language (zh/en)
    - **storage**: Storage configuration
    - **qr_code**: QR code generation settings
    - **camera**: Camera configuration
    - **timeouts**: Timeout values (must be 1-300 seconds)
    - **rendering**: Video rendering settings
    
    Requirements: 7.5, 9.1, 9.2, 9.3, 9.4
    """
    # Validate timeout values if provided
    if update_data.timeouts:
        timeout_fields = [
            update_data.timeouts.idle_to_scene_select_seconds,
            update_data.timeouts.scene_select_inactivity_seconds,
            update_data.timeouts.motion_capture_inactivity_seconds,
            update_data.timeouts.final_result_auto_reset_seconds,
            update_data.timeouts.exit_gesture_duration_seconds,
            update_data.timeouts.exit_confirmation_duration_seconds,
        ]
        for value in timeout_fields:
            if value is not None and not settings_service.validate_timeout_value(value):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Timeout value {value} is out of range. Must be between 1 and 300 seconds.",
                )
    
    # Validate S3 configuration if switching to S3 mode
    if update_data.storage and update_data.storage.mode == 's3':
        current = settings_service.get_settings()
        # Merge current storage with updates to validate
        test_storage = StorageSettings(
            mode='s3',
            local_path=update_data.storage.local_path or current.storage.local_path,
            s3_bucket=update_data.storage.s3_bucket or current.storage.s3_bucket,
            s3_region=update_data.storage.s3_region or current.storage.s3_region,
            s3_access_key=update_data.storage.s3_access_key or current.storage.s3_access_key,
            s3_secret_key=update_data.storage.s3_secret_key or current.storage.s3_secret_key,
        )
        error = settings_service.validate_s3_config(test_storage)
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
    
    return settings_service.update_settings(update_data)


# ============================================================================
# Storage Settings Endpoints (Task 11.1)
# ============================================================================

@router.get("/storage", response_model=StorageSettings)
async def get_storage_settings(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> StorageSettings:
    """
    Get storage configuration.
    
    Returns current storage mode (local/S3) and related configuration.
    
    Requirements: 7.1, 7.2
    """
    return settings_service.get_storage_settings()


@router.put("/storage", response_model=StorageSettings)
async def update_storage_settings(
    update_data: StorageSettingsUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> StorageSettings:
    """
    Update storage configuration.
    
    - **mode**: Storage mode ('local' or 's3')
    - **local_path**: Path for local storage
    - **s3_bucket**: S3 bucket name (required for S3 mode)
    - **s3_region**: S3 region (required for S3 mode)
    - **s3_access_key**: S3 access key (required for S3 mode)
    - **s3_secret_key**: S3 secret key (required for S3 mode)
    
    Settings are applied immediately without requiring a restart.
    
    Requirements: 7.1, 7.2, 7.5
    """
    # Validate S3 configuration if switching to S3 mode
    if update_data.mode == 's3':
        current = settings_service.get_storage_settings()
        # Merge current storage with updates to validate
        test_storage = StorageSettings(
            mode='s3',
            local_path=update_data.local_path or current.local_path,
            s3_bucket=update_data.s3_bucket or current.s3_bucket,
            s3_region=update_data.s3_region or current.s3_region,
            s3_access_key=update_data.s3_access_key or current.s3_access_key,
            s3_secret_key=update_data.s3_secret_key or current.s3_secret_key,
        )
        error = settings_service.validate_s3_config(test_storage)
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
    
    return settings_service.update_storage_settings(update_data)


@router.post("/storage/test", response_model=S3ConnectionTestResponse)
async def test_s3_connection(
    test_request: S3ConnectionTestRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> S3ConnectionTestResponse:
    """
    Test S3 connection with provided credentials.
    
    - **bucket**: S3 bucket name
    - **region**: S3 region
    - **access_key**: AWS access key
    - **secret_key**: AWS secret key
    
    Returns success status and message. On failure, displays the specific
    error message from AWS.
    
    Requirements: 7.3, 7.4
    """
    return settings_service.test_s3_connection(
        bucket=test_request.bucket,
        region=test_request.region,
        access_key=test_request.access_key,
        secret_key=test_request.secret_key,
    )


# ============================================================================
# Camera Settings Endpoints (Task 11.2)
# ============================================================================

@router.get("/cameras", response_model=CameraListResponse)
async def list_cameras(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> CameraListResponse:
    """
    List available camera devices.
    
    Note: Camera enumeration is typically done on the frontend using
    navigator.mediaDevices.enumerateDevices(). This endpoint returns
    the current default camera setting and any cached camera information.
    
    Requirements: 5.5
    """
    cameras = settings_service.get_available_cameras()
    settings = settings_service.get_settings()
    
    return CameraListResponse(
        cameras=cameras,
        default_camera_id=settings.camera.default_camera_id,
    )


@router.put("/default-camera")
async def set_default_camera(
    camera_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict:
    """
    Set the default camera device.
    
    - **camera_id**: Device ID of the camera to set as default
    
    The camera ID is persisted and will be used as the preferred camera
    on subsequent loads.
    
    Requirements: 5.4
    """
    settings_service.set_default_camera(camera_id)
    return {
        "message": "Default camera updated successfully",
        "camera_id": camera_id,
    }


# ============================================================================
# QR Code / LAN IP Endpoints (Task 11.2)
# ============================================================================

@router.get("/lan-ip", response_model=LANIPResponse)
async def get_lan_ip(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> LANIPResponse:
    """
    Get the current LAN IP address for QR code generation.
    
    Returns either the auto-detected IP or the manually configured IP,
    depending on the current settings.
    
    Requirements: 8.1, 8.2, 8.3, 8.4
    """
    return settings_service.get_lan_ip()
