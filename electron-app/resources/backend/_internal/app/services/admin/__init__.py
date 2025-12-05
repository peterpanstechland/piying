# Admin services
"""
Admin services for the Shadow Puppet Interactive System.
Contains business logic for authentication, character management,
storyline management, settings configuration, dashboard statistics,
configuration export/import, and character-specific video management.
"""
from .auth_service import AuthService, auth_service
from .character_service import CharacterService, character_service
from .storyline_service import StorylineService, storyline_service
from .settings_service import SettingsService, settings_service
from .dashboard_service import DashboardService, dashboard_service
from .export_import_service import ExportImportService, export_import_service
from .image_processor import ImageProcessor, image_processor
from .character_video_service import CharacterVideoService, character_video_service

__all__ = [
    "AuthService",
    "auth_service",
    "CharacterService",
    "character_service",
    "StorylineService",
    "storyline_service",
    "SettingsService",
    "settings_service",
    "DashboardService",
    "dashboard_service",
    "ExportImportService",
    "export_import_service",
    "ImageProcessor",
    "image_processor",
    "CharacterVideoService",
    "character_video_service",
]
