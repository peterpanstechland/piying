from fastapi import APIRouter
from pydantic import BaseModel
from ..services.admin.settings_service import settings_service

router = APIRouter(prefix="/api/system", tags=["Public System"])

class PublicSettings(BaseModel):
    theme: str
    language: str

@router.get("/settings", response_model=PublicSettings)
async def get_public_settings():
    """
    Get public system settings (theme, language).
    Safe for public consumption (no secrets).
    """
    settings = settings_service.get_settings()
    return PublicSettings(
        theme=settings.theme,
        language=settings.language
    )
