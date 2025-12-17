from fastapi import APIRouter
from pydantic import BaseModel
from ..services.admin.settings_service import settings_service

router = APIRouter(prefix="/api/system", tags=["Public System"])


class PublicTimeoutSettings(BaseModel):
    """Public timeout settings for frontend use."""
    idle_to_scene_select_seconds: int
    scene_select_inactivity_seconds: int
    motion_capture_inactivity_seconds: int
    final_result_auto_reset_seconds: int
    exit_gesture_duration_seconds: int
    exit_confirmation_duration_seconds: int
    inactivity_show_countdown_seconds: int
    segment_review_inactivity_seconds: int


class PublicSettings(BaseModel):
    """Public settings safe for frontend consumption (no secrets)."""
    theme: str
    language: str
    timeouts: PublicTimeoutSettings


@router.get("/settings", response_model=PublicSettings)
async def get_public_settings():
    """
    Get public system settings (theme, language, timeouts).
    Safe for public consumption (no secrets).
    
    The timeout settings are used by the frontend for:
    - idle_to_scene_select_seconds: Time before transitioning from idle to scene select
    - scene_select_inactivity_seconds: Inactivity timeout on scene selection page
    - motion_capture_inactivity_seconds: Inactivity timeout during motion capture
    - final_result_auto_reset_seconds: Auto-reset time on final result page
    - exit_gesture_duration_seconds: Duration to hold exit gesture
    - exit_confirmation_duration_seconds: Exit confirmation display time
    """
    settings = settings_service.get_settings()
    return PublicSettings(
        theme=settings.theme,
        language=settings.language,
        timeouts=PublicTimeoutSettings(
            idle_to_scene_select_seconds=settings.timeouts.idle_to_scene_select_seconds,
            scene_select_inactivity_seconds=settings.timeouts.scene_select_inactivity_seconds,
            motion_capture_inactivity_seconds=settings.timeouts.motion_capture_inactivity_seconds,
            final_result_auto_reset_seconds=settings.timeouts.final_result_auto_reset_seconds,
            exit_gesture_duration_seconds=settings.timeouts.exit_gesture_duration_seconds,
            exit_confirmation_duration_seconds=settings.timeouts.exit_confirmation_duration_seconds,
            inactivity_show_countdown_seconds=settings.timeouts.inactivity_show_countdown_seconds,
            segment_review_inactivity_seconds=settings.timeouts.segment_review_inactivity_seconds,
        )
    )
