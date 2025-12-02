"""
Export/Import service for admin panel.
Handles configuration export to ZIP file and import with validation.
"""
import io
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models.admin.character import CharacterDB, CharacterPartDB, SkeletonBindingDB
from ...models.admin.storyline import StorylineDB, SegmentDB, StorylineCharacterDB
from .settings_service import settings_service


# Export directory for temporary files
EXPORT_DIR = Path("data/exports")

# Export manifest version for compatibility checking
EXPORT_MANIFEST_VERSION = "1.0"


class ExportImportService:
    """Service for handling configuration export and import operations."""

    def __init__(self):
        """Initialize the export/import service."""
        # Ensure export directory exists
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    async def export_configuration(
        self, db: AsyncSession
    ) -> Tuple[bytes, str]:
        """
        Export all configuration to a ZIP file.
        
        Includes:
        - Character data (metadata + PNG files)
        - Storyline configurations (metadata + video files)
        - System settings
        
        Returns:
            Tuple of (zip_bytes, filename)
        """
        # Create a BytesIO buffer for the ZIP file
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Export manifest with version and timestamp
            manifest = {
                "version": EXPORT_MANIFEST_VERSION,
                "exported_at": datetime.utcnow().isoformat(),
                "contents": {
                    "characters": [],
                    "storylines": [],
                    "settings": True
                }
            }
            
            # Export characters
            characters_data = await self._export_characters(db, zf)
            manifest["contents"]["characters"] = [c["id"] for c in characters_data]
            zf.writestr("characters/characters.json", json.dumps(characters_data, indent=2))
            
            # Export storylines
            storylines_data = await self._export_storylines(db, zf)
            manifest["contents"]["storylines"] = [s["id"] for s in storylines_data]
            zf.writestr("storylines/storylines.json", json.dumps(storylines_data, indent=2))
            
            # Export settings
            settings_data = self._export_settings()
            zf.writestr("settings/settings.json", json.dumps(settings_data, indent=2))
            
            # Write manifest
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        
        # Generate filename with timestamp
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"shadow_puppet_config_{timestamp}.zip"
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue(), filename

    async def _export_characters(
        self, db: AsyncSession, zf: zipfile.ZipFile
    ) -> List[Dict[str, Any]]:
        """Export all characters with their parts and bindings."""
        result = await db.execute(
            select(CharacterDB)
            .options(
                selectinload(CharacterDB.parts),
                selectinload(CharacterDB.bindings)
            )
        )
        characters = list(result.scalars().all())
        
        characters_data = []
        for char in characters:
            char_data = {
                "id": char.id,
                "name": char.name,
                "description": char.description,
                "thumbnail_path": char.thumbnail_path,
                "created_at": char.created_at.isoformat() if char.created_at else None,
                "updated_at": char.updated_at.isoformat() if char.updated_at else None,
                "parts": [],
                "bindings": []
            }
            
            # Export parts
            for part in char.parts:
                part_data = {
                    "name": part.name,
                    "file_path": part.file_path,
                    "pivot_x": part.pivot_x,
                    "pivot_y": part.pivot_y,
                    "z_index": part.z_index,
                    "connections": part.connections
                }
                char_data["parts"].append(part_data)
                
                # Add part file to ZIP if it exists
                if part.file_path:
                    full_path = Path("data") / part.file_path
                    if full_path.exists():
                        zf.write(str(full_path), f"characters/{char.id}/{part.name}.png")
            
            # Export bindings
            for binding in char.bindings:
                binding_data = {
                    "part_name": binding.part_name,
                    "landmarks": binding.landmarks,
                    "rotation_landmark": binding.rotation_landmark,
                    "scale_landmarks": binding.scale_landmarks
                }
                char_data["bindings"].append(binding_data)
            
            # Add thumbnail if exists
            if char.thumbnail_path:
                thumb_path = Path("data") / char.thumbnail_path
                if thumb_path.exists():
                    zf.write(str(thumb_path), f"characters/{char.id}/thumbnail.png")
            
            characters_data.append(char_data)
        
        return characters_data

    async def _export_storylines(
        self, db: AsyncSession, zf: zipfile.ZipFile
    ) -> List[Dict[str, Any]]:
        """Export all storylines with their segments and character-specific videos.
        
        Requirements 6.3: Include character-specific videos in export package.
        """
        result = await db.execute(
            select(StorylineDB)
            .options(
                selectinload(StorylineDB.segments),
                selectinload(StorylineDB.storyline_characters)
            )
        )
        storylines = list(result.scalars().all())
        
        storylines_data = []
        for storyline in storylines:
            storyline_data = {
                "id": storyline.id,
                "name": storyline.name,
                "name_en": storyline.name_en,
                "description": storyline.description,
                "description_en": storyline.description_en,
                "icon": storyline.icon,
                "icon_image": storyline.icon_image,
                "base_video_path": storyline.base_video_path,
                "video_duration": storyline.video_duration,
                "character_id": storyline.character_id,
                "created_at": storyline.created_at.isoformat() if storyline.created_at else None,
                "updated_at": storyline.updated_at.isoformat() if storyline.updated_at else None,
                "segments": [],
                "character_videos": []  # New field for character-specific videos
            }
            
            # Export segments
            for segment in sorted(storyline.segments, key=lambda s: s.index):
                segment_data = {
                    "index": segment.index,
                    "duration": segment.duration,
                    "path_type": segment.path_type,
                    "offset_start_x": segment.offset_start_x,
                    "offset_start_y": segment.offset_start_y,
                    "offset_end_x": segment.offset_end_x,
                    "offset_end_y": segment.offset_end_y,
                    "guidance_text": segment.guidance_text,
                    "guidance_text_en": segment.guidance_text_en,
                    "guidance_image": segment.guidance_image
                }
                storyline_data["segments"].append(segment_data)
                
                # Add guidance image if exists
                if segment.guidance_image:
                    img_path = Path("data") / segment.guidance_image
                    if img_path.exists():
                        zf.write(str(img_path), f"storylines/{storyline.id}/segment{segment.index}_guide.png")
            
            # Export character-specific videos (Requirements 6.3)
            for char_assoc in sorted(storyline.storyline_characters, key=lambda c: c.display_order):
                char_video_data = {
                    "character_id": char_assoc.character_id,
                    "is_default": bool(char_assoc.is_default),
                    "display_order": char_assoc.display_order,
                    "video_path": char_assoc.video_path,
                    "video_duration": char_assoc.video_duration,
                    "video_thumbnail": char_assoc.video_thumbnail,
                    "video_uploaded_at": char_assoc.video_uploaded_at.isoformat() if char_assoc.video_uploaded_at else None
                }
                storyline_data["character_videos"].append(char_video_data)
                
                # Add character-specific video file if exists
                if char_assoc.video_path:
                    video_path = Path("data") / char_assoc.video_path
                    if video_path.exists():
                        zf.write(str(video_path), f"storylines/{storyline.id}/videos/{char_assoc.character_id}.mp4")
                
                # Add character video thumbnail if exists
                if char_assoc.video_thumbnail:
                    thumb_path = Path("data") / char_assoc.video_thumbnail
                    if thumb_path.exists():
                        zf.write(str(thumb_path), f"storylines/{storyline.id}/videos/{char_assoc.character_id}_thumb.jpg")
            
            # Add base video if exists
            if storyline.base_video_path:
                video_path = Path("data") / storyline.base_video_path
                if video_path.exists():
                    zf.write(str(video_path), f"storylines/{storyline.id}/base_video.mp4")
            
            # Add icon image if exists
            if storyline.icon_image:
                icon_path = Path("data") / storyline.icon_image
                if icon_path.exists():
                    _, ext = os.path.splitext(storyline.icon_image)
                    zf.write(str(icon_path), f"storylines/{storyline.id}/icon{ext}")
            
            storylines_data.append(storyline_data)
        
        return storylines_data

    def _export_settings(self) -> Dict[str, Any]:
        """Export system settings."""
        settings = settings_service.get_settings()
        return {
            "language": settings.language,
            "fallback_language": settings.fallback_language,
            "storage": {
                "mode": settings.storage.mode,
                "local_path": settings.storage.local_path,
                # Note: S3 credentials are NOT exported for security
            },
            "qr_code": {
                "auto_detect_ip": settings.qr_code.auto_detect_ip,
                "manual_ip": settings.qr_code.manual_ip,
                "port": settings.qr_code.port,
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
            "rendering": {
                "target_fps": settings.rendering.target_fps,
                "video_codec": settings.rendering.video_codec,
                "max_render_time_seconds": settings.rendering.max_render_time_seconds,
            }
        }

    def validate_import_file(
        self, zip_content: bytes
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Validate an import ZIP file.
        
        Returns:
            Tuple of (is_valid, error_message, manifest_data)
        """
        try:
            zip_buffer = io.BytesIO(zip_content)
            
            with zipfile.ZipFile(zip_buffer, 'r') as zf:
                # Check for manifest
                if "manifest.json" not in zf.namelist():
                    return False, "Invalid backup: missing manifest.json", None
                
                # Read and validate manifest
                manifest_content = zf.read("manifest.json")
                manifest = json.loads(manifest_content.decode('utf-8'))
                
                # Check version compatibility
                version = manifest.get("version")
                if version != EXPORT_MANIFEST_VERSION:
                    return False, f"Incompatible backup version: {version} (expected {EXPORT_MANIFEST_VERSION})", None
                
                # Validate required files exist
                contents = manifest.get("contents", {})
                
                if contents.get("characters"):
                    if "characters/characters.json" not in zf.namelist():
                        return False, "Invalid backup: missing characters/characters.json", None
                
                if contents.get("storylines"):
                    if "storylines/storylines.json" not in zf.namelist():
                        return False, "Invalid backup: missing storylines/storylines.json", None
                
                if contents.get("settings"):
                    if "settings/settings.json" not in zf.namelist():
                        return False, "Invalid backup: missing settings/settings.json", None
                
                return True, "", manifest
                
        except zipfile.BadZipFile:
            return False, "Invalid ZIP file format", None
        except json.JSONDecodeError as e:
            return False, f"Invalid JSON in backup: {str(e)}", None
        except Exception as e:
            return False, f"Error validating backup: {str(e)}", None

    def get_import_preview(
        self, zip_content: bytes
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Get a preview of what will be imported/overwritten.
        
        Returns:
            Tuple of (is_valid, error_message, preview_data)
        """
        is_valid, error, manifest = self.validate_import_file(zip_content)
        if not is_valid:
            return False, error, {}
        
        try:
            zip_buffer = io.BytesIO(zip_content)
            preview = {
                "characters": [],
                "storylines": [],
                "settings": False
            }
            
            with zipfile.ZipFile(zip_buffer, 'r') as zf:
                # Preview characters
                if "characters/characters.json" in zf.namelist():
                    chars_content = zf.read("characters/characters.json")
                    chars_data = json.loads(chars_content.decode('utf-8'))
                    preview["characters"] = [
                        {"id": c["id"], "name": c["name"]}
                        for c in chars_data
                    ]
                
                # Preview storylines (including character video count)
                if "storylines/storylines.json" in zf.namelist():
                    storylines_content = zf.read("storylines/storylines.json")
                    storylines_data = json.loads(storylines_content.decode('utf-8'))
                    preview["storylines"] = [
                        {
                            "id": s["id"],
                            "name": s["name"],
                            "character_video_count": len([
                                cv for cv in s.get("character_videos", [])
                                if cv.get("video_path")
                            ])
                        }
                        for s in storylines_data
                    ]
                
                # Preview settings
                if "settings/settings.json" in zf.namelist():
                    preview["settings"] = True
            
            return True, "", preview
            
        except Exception as e:
            return False, f"Error reading backup preview: {str(e)}", {}

    async def import_configuration(
        self,
        db: AsyncSession,
        zip_content: bytes,
        overwrite: bool = False
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Import configuration from a ZIP file.
        
        Args:
            db: Database session
            zip_content: ZIP file content
            overwrite: Whether to overwrite existing data
            
        Returns:
            Tuple of (success, error_message, import_stats)
        """
        # Validate first
        is_valid, error, manifest = self.validate_import_file(zip_content)
        if not is_valid:
            return False, error, {}
        
        stats = {
            "characters_imported": 0,
            "characters_skipped": 0,
            "storylines_imported": 0,
            "storylines_skipped": 0,
            "settings_imported": False
        }
        
        try:
            zip_buffer = io.BytesIO(zip_content)
            
            with zipfile.ZipFile(zip_buffer, 'r') as zf:
                # Import characters
                if "characters/characters.json" in zf.namelist():
                    char_stats = await self._import_characters(db, zf, overwrite)
                    stats["characters_imported"] = char_stats["imported"]
                    stats["characters_skipped"] = char_stats["skipped"]
                
                # Import storylines
                if "storylines/storylines.json" in zf.namelist():
                    storyline_stats = await self._import_storylines(db, zf, overwrite)
                    stats["storylines_imported"] = storyline_stats["imported"]
                    stats["storylines_skipped"] = storyline_stats["skipped"]
                
                # Import settings
                if "settings/settings.json" in zf.namelist():
                    self._import_settings(zf)
                    stats["settings_imported"] = True
            
            await db.commit()
            return True, "", stats
            
        except Exception as e:
            await db.rollback()
            return False, f"Import failed: {str(e)}", stats

    async def _import_characters(
        self,
        db: AsyncSession,
        zf: zipfile.ZipFile,
        overwrite: bool
    ) -> Dict[str, int]:
        """Import characters from ZIP file."""
        stats = {"imported": 0, "skipped": 0}
        
        chars_content = zf.read("characters/characters.json")
        chars_data = json.loads(chars_content.decode('utf-8'))
        
        for char_data in chars_data:
            char_id = char_data["id"]
            
            # Check if character exists
            result = await db.execute(
                select(CharacterDB).where(CharacterDB.id == char_id)
            )
            existing = result.scalar_one_or_none()
            
            if existing and not overwrite:
                stats["skipped"] += 1
                continue
            
            if existing:
                # Delete existing character and related data
                await db.delete(existing)
                await db.flush()
            
            # Create character
            character = CharacterDB(
                id=char_id,
                name=char_data["name"],
                description=char_data.get("description"),
                thumbnail_path=char_data.get("thumbnail_path"),
                created_at=datetime.fromisoformat(char_data["created_at"]) if char_data.get("created_at") else datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(character)
            await db.flush()
            
            # Create character directory
            char_dir = Path("data/characters") / char_id
            char_dir.mkdir(parents=True, exist_ok=True)
            
            # Import parts
            for part_data in char_data.get("parts", []):
                part = CharacterPartDB(
                    character_id=char_id,
                    name=part_data["name"],
                    file_path=part_data["file_path"],
                    pivot_x=part_data.get("pivot_x", 0.5),
                    pivot_y=part_data.get("pivot_y", 0.5),
                    z_index=part_data.get("z_index", 0),
                    connections=part_data.get("connections", "[]")
                )
                db.add(part)
                
                # Extract part file
                part_zip_path = f"characters/{char_id}/{part_data['name']}.png"
                if part_zip_path in zf.namelist():
                    part_file_path = char_dir / f"{part_data['name']}.png"
                    with open(part_file_path, 'wb') as f:
                        f.write(zf.read(part_zip_path))
            
            # Import bindings
            for binding_data in char_data.get("bindings", []):
                binding = SkeletonBindingDB(
                    character_id=char_id,
                    part_name=binding_data["part_name"],
                    landmarks=binding_data.get("landmarks", "[]"),
                    rotation_landmark=binding_data.get("rotation_landmark"),
                    scale_landmarks=binding_data.get("scale_landmarks", "[]")
                )
                db.add(binding)
            
            # Extract thumbnail
            thumb_zip_path = f"characters/{char_id}/thumbnail.png"
            if thumb_zip_path in zf.namelist():
                thumb_path = char_dir / "thumbnail.png"
                with open(thumb_path, 'wb') as f:
                    f.write(zf.read(thumb_zip_path))
            
            stats["imported"] += 1
        
        return stats

    async def _import_storylines(
        self,
        db: AsyncSession,
        zf: zipfile.ZipFile,
        overwrite: bool
    ) -> Dict[str, int]:
        """Import storylines from ZIP file.
        
        Requirements 6.4: Restore character-specific videos from import package.
        """
        stats = {"imported": 0, "skipped": 0}
        
        storylines_content = zf.read("storylines/storylines.json")
        storylines_data = json.loads(storylines_content.decode('utf-8'))
        
        for storyline_data in storylines_data:
            storyline_id = storyline_data["id"]
            
            # Check if storyline exists
            result = await db.execute(
                select(StorylineDB).where(StorylineDB.id == storyline_id)
            )
            existing = result.scalar_one_or_none()
            
            if existing and not overwrite:
                stats["skipped"] += 1
                continue
            
            if existing:
                # Delete existing storyline and related data
                await db.delete(existing)
                await db.flush()
            
            # Create storyline
            storyline = StorylineDB(
                id=storyline_id,
                name=storyline_data["name"],
                name_en=storyline_data.get("name_en", ""),
                description=storyline_data.get("description", ""),
                description_en=storyline_data.get("description_en", ""),
                icon=storyline_data.get("icon", "🎭"),
                icon_image=storyline_data.get("icon_image"),
                base_video_path=storyline_data.get("base_video_path", ""),
                video_duration=storyline_data.get("video_duration", 0.0),
                character_id=storyline_data.get("character_id"),
                created_at=datetime.fromisoformat(storyline_data["created_at"]) if storyline_data.get("created_at") else datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(storyline)
            await db.flush()
            
            # Create storyline directory
            storyline_dir = Path("data/storylines") / storyline_id
            storyline_dir.mkdir(parents=True, exist_ok=True)
            
            # Import segments
            for segment_data in storyline_data.get("segments", []):
                segment = SegmentDB(
                    storyline_id=storyline_id,
                    index=segment_data["index"],
                    duration=segment_data.get("duration", 5.0),
                    path_type=segment_data.get("path_type", "static"),
                    offset_start_x=segment_data.get("offset_start_x", 0),
                    offset_start_y=segment_data.get("offset_start_y", 0),
                    offset_end_x=segment_data.get("offset_end_x", 0),
                    offset_end_y=segment_data.get("offset_end_y", 0),
                    guidance_text=segment_data.get("guidance_text", ""),
                    guidance_text_en=segment_data.get("guidance_text_en", ""),
                    guidance_image=segment_data.get("guidance_image")
                )
                db.add(segment)
                
                # Extract guidance image
                guide_zip_path = f"storylines/{storyline_id}/segment{segment_data['index']}_guide.png"
                if guide_zip_path in zf.namelist():
                    guide_path = storyline_dir / f"segment{segment_data['index']}_guide.png"
                    with open(guide_path, 'wb') as f:
                        f.write(zf.read(guide_zip_path))
            
            # Import character-specific videos (Requirements 6.4)
            videos_dir = storyline_dir / "videos"
            for char_video_data in storyline_data.get("character_videos", []):
                character_id = char_video_data["character_id"]
                
                # Check if character exists in database
                char_result = await db.execute(
                    select(CharacterDB).where(CharacterDB.id == character_id)
                )
                character_exists = char_result.scalar_one_or_none() is not None
                
                if not character_exists:
                    # Skip character video if character doesn't exist
                    continue
                
                # Create storyline-character association
                char_assoc = StorylineCharacterDB(
                    storyline_id=storyline_id,
                    character_id=character_id,
                    is_default=char_video_data.get("is_default", False),
                    display_order=char_video_data.get("display_order", 0),
                    video_path=char_video_data.get("video_path"),
                    video_duration=char_video_data.get("video_duration"),
                    video_thumbnail=char_video_data.get("video_thumbnail"),
                    video_uploaded_at=datetime.fromisoformat(char_video_data["video_uploaded_at"]) if char_video_data.get("video_uploaded_at") else None
                )
                db.add(char_assoc)
                
                # Extract character-specific video file if exists
                video_zip_path = f"storylines/{storyline_id}/videos/{character_id}.mp4"
                if video_zip_path in zf.namelist():
                    videos_dir.mkdir(parents=True, exist_ok=True)
                    video_file_path = videos_dir / f"{character_id}.mp4"
                    with open(video_file_path, 'wb') as f:
                        f.write(zf.read(video_zip_path))
                
                # Extract character video thumbnail if exists
                thumb_zip_path = f"storylines/{storyline_id}/videos/{character_id}_thumb.jpg"
                if thumb_zip_path in zf.namelist():
                    videos_dir.mkdir(parents=True, exist_ok=True)
                    thumb_file_path = videos_dir / f"{character_id}_thumb.jpg"
                    with open(thumb_file_path, 'wb') as f:
                        f.write(zf.read(thumb_zip_path))
            
            # Extract base video
            video_zip_path = f"storylines/{storyline_id}/base_video.mp4"
            if video_zip_path in zf.namelist():
                video_path = storyline_dir / "base_video.mp4"
                with open(video_path, 'wb') as f:
                    f.write(zf.read(video_zip_path))
            
            # Extract icon image
            for ext in ['.png', '.jpg', '.jpeg', '.gif']:
                icon_zip_path = f"storylines/{storyline_id}/icon{ext}"
                if icon_zip_path in zf.namelist():
                    icon_path = storyline_dir / f"icon{ext}"
                    with open(icon_path, 'wb') as f:
                        f.write(zf.read(icon_zip_path))
                    break
            
            stats["imported"] += 1
        
        return stats

    def _import_settings(self, zf: zipfile.ZipFile) -> None:
        """Import settings from ZIP file."""
        settings_content = zf.read("settings/settings.json")
        settings_data = json.loads(settings_content.decode('utf-8'))
        
        # Build update object
        from ...models.admin.settings import (
            SystemSettingsUpdate,
            StorageSettingsUpdate,
            QRCodeSettingsUpdate,
            CameraSettingsUpdate,
            TimeoutSettingsUpdate,
            RenderingSettingsUpdate,
        )
        
        update = SystemSettingsUpdate(
            language=settings_data.get("language"),
            fallback_language=settings_data.get("fallback_language"),
        )
        
        if "storage" in settings_data:
            storage = settings_data["storage"]
            update.storage = StorageSettingsUpdate(
                mode=storage.get("mode"),
                local_path=storage.get("local_path"),
            )
        
        if "qr_code" in settings_data:
            qr = settings_data["qr_code"]
            update.qr_code = QRCodeSettingsUpdate(
                auto_detect_ip=qr.get("auto_detect_ip"),
                manual_ip=qr.get("manual_ip"),
                port=qr.get("port"),
            )
        
        if "camera" in settings_data:
            camera = settings_data["camera"]
            update.camera = CameraSettingsUpdate(
                default_camera_id=camera.get("default_camera_id"),
                min_fps=camera.get("min_fps"),
                detection_confidence=camera.get("detection_confidence"),
            )
        
        if "timeouts" in settings_data:
            timeouts = settings_data["timeouts"]
            update.timeouts = TimeoutSettingsUpdate(
                idle_to_scene_select_seconds=timeouts.get("idle_to_scene_select_seconds"),
                scene_select_inactivity_seconds=timeouts.get("scene_select_inactivity_seconds"),
                motion_capture_inactivity_seconds=timeouts.get("motion_capture_inactivity_seconds"),
                final_result_auto_reset_seconds=timeouts.get("final_result_auto_reset_seconds"),
                exit_gesture_duration_seconds=timeouts.get("exit_gesture_duration_seconds"),
                exit_confirmation_duration_seconds=timeouts.get("exit_confirmation_duration_seconds"),
            )
        
        if "rendering" in settings_data:
            rendering = settings_data["rendering"]
            update.rendering = RenderingSettingsUpdate(
                target_fps=rendering.get("target_fps"),
                video_codec=rendering.get("video_codec"),
                max_render_time_seconds=rendering.get("max_render_time_seconds"),
            )
        
        settings_service.update_settings(update)

    def save_export_file(self, zip_content: bytes, filename: str) -> str:
        """
        Save export file to disk and return the download path.
        
        Returns:
            Relative path to the export file
        """
        export_path = EXPORT_DIR / filename
        with open(export_path, 'wb') as f:
            f.write(zip_content)
        return str(export_path)

    def get_export_file(self, filename: str) -> Optional[bytes]:
        """
        Get export file content by filename.
        
        Returns:
            File content or None if not found
        """
        export_path = EXPORT_DIR / filename
        if not export_path.exists():
            return None
        
        with open(export_path, 'rb') as f:
            return f.read()

    def cleanup_old_exports(self, max_age_hours: int = 24) -> int:
        """
        Clean up export files older than max_age_hours.
        
        Returns:
            Number of files deleted
        """
        import time
        
        deleted = 0
        cutoff_time = time.time() - (max_age_hours * 3600)
        
        for file_path in EXPORT_DIR.glob("*.zip"):
            if file_path.stat().st_mtime < cutoff_time:
                file_path.unlink()
                deleted += 1
        
        return deleted


# Singleton instance
export_import_service = ExportImportService()
