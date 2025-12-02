# Admin API endpoints
"""
Admin API module for the Shadow Puppet Interactive System.
Contains endpoints for authentication, character management, storyline management,
settings configuration, dashboard statistics, configuration export/import,
and character-specific video management.
"""
from .auth import router as auth_router, get_current_user, require_admin
from .users import router as users_router
from .characters import router as characters_router
from .storylines import router as storylines_router
from .settings import router as settings_router
from .dashboard import router as dashboard_router
from .export_import import router as export_import_router
from .character_videos import router as character_videos_router

__all__ = [
    "auth_router",
    "users_router",
    "characters_router",
    "storylines_router",
    "settings_router",
    "dashboard_router",
    "export_import_router",
    "character_videos_router",
    "get_current_user",
    "require_admin",
]
