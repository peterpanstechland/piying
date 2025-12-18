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
from typing import Dict, Any, List, Optional, Tuple, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models.admin.character import CharacterDB, CharacterPartDB, SkeletonBindingDB
from ...models.admin.storyline import (
    StorylineDB, SegmentDB, StorylineCharacterDB, 
    TransitionDB, CharacterVideoSegmentDB
)
from .settings_service import settings_service
from ...utils.path import get_user_data_dir


# Export directory for temporary files
EXPORT_DIR = get_user_data_dir() / "exports"

# Export manifest version for compatibility checking
# Version 2.0 includes: complete character fields, transitions, character video segments
EXPORT_MANIFEST_VERSION = "2.0"

# Supported versions for backward compatibility
SUPPORTED_IMPORT_VERSIONS = ["1.0", "2.0"]


class ExportImportService:
    """Service for handling configuration export and import operations."""

    def __init__(self):
        """Initialize the export/import service."""
        # Ensure export directory exists
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    async def get_exportable_content(
        self, db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Get list of all exportable content with their dependencies.
        
        Returns:
            Dict containing characters, storylines with their dependencies, and settings availability
        """
        # Get all characters
        result = await db.execute(select(CharacterDB))
        characters = list(result.scalars().all())
        
        characters_list = [
            {
                "id": char.id,
                "name": char.name,
                "thumbnail_path": char.thumbnail_path
            }
            for char in characters
        ]
        
        # Get all storylines with their character associations
        result = await db.execute(
            select(StorylineDB)
            .options(selectinload(StorylineDB.storyline_characters))
        )
        storylines = list(result.scalars().all())
        
        storylines_list = []
        for storyline in storylines:
            # Collect all character IDs this storyline depends on
            required_character_ids = set()
            
            # Add legacy character_id if exists
            if storyline.character_id:
                required_character_ids.add(storyline.character_id)
            
            # Add all associated character IDs
            for assoc in storyline.storyline_characters:
                required_character_ids.add(assoc.character_id)
            
            storylines_list.append({
                "id": storyline.id,
                "name": storyline.name,
                "name_en": storyline.name_en,
                "icon": storyline.icon,
                "required_character_ids": list(required_character_ids)
            })
        
        return {
            "characters": characters_list,
            "storylines": storylines_list,
            "settings_available": True
        }

    def calculate_dependencies(
        self,
        exportable_content: Dict[str, Any],
        selected_character_ids: List[str],
        selected_storyline_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Calculate which items must be selected based on dependencies.
        
        Returns:
            Dict with required_character_ids (must be selected due to storyline dependencies)
        """
        required_character_ids: Set[str] = set()
        
        # For each selected storyline, find its required characters
        storyline_map = {s["id"]: s for s in exportable_content.get("storylines", [])}
        
        for storyline_id in selected_storyline_ids:
            storyline = storyline_map.get(storyline_id)
            if storyline:
                for char_id in storyline.get("required_character_ids", []):
                    required_character_ids.add(char_id)
        
        return {
            "required_character_ids": list(required_character_ids)
        }

    async def export_configuration(
        self,
        db: AsyncSession,
        character_ids: Optional[List[str]] = None,
        storyline_ids: Optional[List[str]] = None,
        include_settings: bool = True
    ) -> Tuple[bytes, str]:
        """
        Export configuration to a ZIP file with selective export support.
        
        Args:
            db: Database session
            character_ids: List of character IDs to export (None = all)
            storyline_ids: List of storyline IDs to export (None = all)
            include_settings: Whether to include system settings
        
        Includes:
        - Character data (metadata + PNG files + all joint/editor config)
        - Storyline configurations (metadata + video files + transitions + character video segments)
        - System settings (complete)
        
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
                    "settings": include_settings
                }
            }
            
            # Export characters (filtered if IDs provided)
            characters_data = await self._export_characters(db, zf, character_ids)
            manifest["contents"]["characters"] = [c["id"] for c in characters_data]
            if characters_data:
                zf.writestr("characters/characters.json", json.dumps(characters_data, indent=2, ensure_ascii=False))
            
            # Export storylines (filtered if IDs provided)
            storylines_data = await self._export_storylines(db, zf, storyline_ids)
            manifest["contents"]["storylines"] = [s["id"] for s in storylines_data]
            if storylines_data:
                zf.writestr("storylines/storylines.json", json.dumps(storylines_data, indent=2, ensure_ascii=False))
            
            # Export settings
            if include_settings:
                settings_data = self._export_settings()
                zf.writestr("settings/settings.json", json.dumps(settings_data, indent=2, ensure_ascii=False))
            
            # Write manifest
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        
        # Generate filename with timestamp
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"shadow_puppet_config_{timestamp}.zip"
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue(), filename

    async def _export_characters(
        self, 
        db: AsyncSession, 
        zf: zipfile.ZipFile,
        character_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Export characters with their parts and bindings (complete fields).
        
        Args:
            db: Database session
            zf: ZipFile to write to
            character_ids: Optional list of character IDs to export (None = all)
        """
        query = select(CharacterDB).options(
            selectinload(CharacterDB.parts),
            selectinload(CharacterDB.bindings)
        )
        
        # Filter by IDs if provided
        if character_ids is not None:
            query = query.where(CharacterDB.id.in_(character_ids))
        
        result = await db.execute(query)
        characters = list(result.scalars().all())
        
        characters_data = []
        for char in characters:
            char_data = {
                "id": char.id,
                "name": char.name,
                "description": char.description,
                "thumbnail_path": char.thumbnail_path,
                "default_facing": char.default_facing,  # Added: default facing direction
                "created_at": char.created_at.isoformat() if char.created_at else None,
                "updated_at": char.updated_at.isoformat() if char.updated_at else None,
                "parts": [],
                "bindings": []
            }
            
            # Export parts with ALL fields
            for part in char.parts:
                part_data = {
                    "name": part.name,
                    "file_path": part.file_path,
                    "pivot_x": part.pivot_x,
                    "pivot_y": part.pivot_y,
                    "z_index": part.z_index,
                    "connections": part.connections,
                    # Added: joint configuration
                    "joints": part.joints,
                    # Added: editor layout position
                    "editor_x": part.editor_x,
                    "editor_y": part.editor_y,
                    "editor_width": part.editor_width,
                    "editor_height": part.editor_height,
                    # Added: joint pivot point (rotation center)
                    "joint_pivot_x": part.joint_pivot_x,
                    "joint_pivot_y": part.joint_pivot_y,
                    # Added: rotation offset
                    "rotation_offset": part.rotation_offset,
                    # Added: rest pose offset
                    "rest_pose_offset": part.rest_pose_offset
                }
                char_data["parts"].append(part_data)
                
                # Add part file to ZIP if it exists
                if part.file_path:
                    full_path = get_user_data_dir() / part.file_path
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
                thumb_path = get_user_data_dir() / char.thumbnail_path
                if thumb_path.exists():
                    zf.write(str(thumb_path), f"characters/{char.id}/thumbnail.png")
            
            characters_data.append(char_data)
        
        return characters_data

    async def _export_storylines(
        self, 
        db: AsyncSession, 
        zf: zipfile.ZipFile,
        storyline_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Export storylines with all configurations (complete fields).
        
        Includes: segments, transitions, character videos, character video segments.
        
        Args:
            db: Database session
            zf: ZipFile to write to
            storyline_ids: Optional list of storyline IDs to export (None = all)
        """
        query = select(StorylineDB).options(
            selectinload(StorylineDB.segments),
            selectinload(StorylineDB.storyline_characters).selectinload(StorylineCharacterDB.segments),
            selectinload(StorylineDB.transitions)
        )
        
        # Filter by IDs if provided
        if storyline_ids is not None:
            query = query.where(StorylineDB.id.in_(storyline_ids))
        
        result = await db.execute(query)
        storylines = list(result.scalars().all())
        
        storylines_data = []
        for storyline in storylines:
            storyline_data = {
                "id": storyline.id,
                "name": storyline.name,
                "name_en": storyline.name_en,
                "description": storyline.description,
                "description_en": storyline.description_en,
                # Added: synopsis
                "synopsis": storyline.synopsis,
                "synopsis_en": storyline.synopsis_en,
                "icon": storyline.icon,
                "icon_image": storyline.icon_image,
                "base_video_path": storyline.base_video_path,
                "video_duration": storyline.video_duration,
                # Added: video resolution
                "video_width": storyline.video_width,
                "video_height": storyline.video_height,
                "character_id": storyline.character_id,
                # Added: status and display settings
                "status": storyline.status,
                "display_order": storyline.display_order,
                "enabled": bool(storyline.enabled),
                # Added: cover images
                "cover_original": storyline.cover_original,
                "cover_thumbnail": storyline.cover_thumbnail,
                "cover_medium": storyline.cover_medium,
                "cover_large": storyline.cover_large,
                "created_at": storyline.created_at.isoformat() if storyline.created_at else None,
                "updated_at": storyline.updated_at.isoformat() if storyline.updated_at else None,
                "segments": [],
                "transitions": [],  # Added: transitions
                "character_videos": []
            }
            
            # Export segments with ALL fields
            for segment in sorted(storyline.segments, key=lambda s: s.index):
                segment_data = {
                    "index": segment.index,
                    "duration": segment.duration,
                    "path_type": segment.path_type,
                    "offset_start_x": segment.offset_start_x,
                    "offset_start_y": segment.offset_start_y,
                    "offset_end_x": segment.offset_end_x,
                    "offset_end_y": segment.offset_end_y,
                    # Added: path waypoints and draw type
                    "path_waypoints": segment.path_waypoints,
                    "path_draw_type": segment.path_draw_type,
                    "guidance_text": segment.guidance_text,
                    "guidance_text_en": segment.guidance_text_en,
                    "guidance_image": segment.guidance_image,
                    # Added: audio playback
                    "play_audio": bool(segment.play_audio),
                    # Added: scale configuration
                    "scale_mode": segment.scale_mode,
                    "scale_start": segment.scale_start,
                    "scale_end": segment.scale_end,
                    # Added: timeline fields
                    "start_time": segment.start_time,
                    # Added: entry animation
                    "entry_type": segment.entry_type,
                    "entry_duration": segment.entry_duration,
                    "entry_delay": segment.entry_delay,
                    # Added: exit animation
                    "exit_type": segment.exit_type,
                    "exit_duration": segment.exit_duration,
                    "exit_delay": segment.exit_delay
                }
                storyline_data["segments"].append(segment_data)
                
                # Add guidance image if exists
                if segment.guidance_image:
                    img_path = get_user_data_dir() / segment.guidance_image
                    if img_path.exists():
                        zf.write(str(img_path), f"storylines/{storyline.id}/segment{segment.index}_guide.png")
            
            # Export transitions (Added)
            for transition in storyline.transitions:
                transition_data = {
                    "id": transition.id,
                    "from_segment_index": transition.from_segment_index,
                    "to_segment_index": transition.to_segment_index,
                    "type": transition.type,
                    "duration": transition.duration
                }
                storyline_data["transitions"].append(transition_data)
            
            # Export character-specific videos with segments
            for char_assoc in sorted(storyline.storyline_characters, key=lambda c: c.display_order):
                char_video_data = {
                    "character_id": char_assoc.character_id,
                    "is_default": bool(char_assoc.is_default),
                    "display_order": char_assoc.display_order,
                    "video_path": char_assoc.video_path,
                    "video_duration": char_assoc.video_duration,
                    "video_thumbnail": char_assoc.video_thumbnail,
                    "video_uploaded_at": char_assoc.video_uploaded_at.isoformat() if char_assoc.video_uploaded_at else None,
                    # Added: character video segments
                    "segments": []
                }
                
                # Export character video segments
                for seg in sorted(char_assoc.segments, key=lambda s: s.index):
                    char_seg_data = {
                        "index": seg.index,
                        "start_time": seg.start_time,
                        "duration": seg.duration,
                        "path_type": seg.path_type,
                        "offset_start_x": seg.offset_start_x,
                        "offset_start_y": seg.offset_start_y,
                        "offset_end_x": seg.offset_end_x,
                        "offset_end_y": seg.offset_end_y,
                        "path_waypoints": seg.path_waypoints,
                        "path_draw_type": seg.path_draw_type,
                        "entry_type": seg.entry_type,
                        "entry_duration": seg.entry_duration,
                        "entry_delay": seg.entry_delay,
                        "exit_type": seg.exit_type,
                        "exit_duration": seg.exit_duration,
                        "exit_delay": seg.exit_delay,
                        "guidance_text": seg.guidance_text,
                        "guidance_text_en": seg.guidance_text_en,
                        "guidance_image": seg.guidance_image,
                        "play_audio": bool(seg.play_audio),
                        "scale_mode": seg.scale_mode,
                        "scale_start": seg.scale_start,
                        "scale_end": seg.scale_end
                    }
                    char_video_data["segments"].append(char_seg_data)
                    
                    # Add character segment guidance image if exists
                    if seg.guidance_image:
                        img_path = get_user_data_dir() / seg.guidance_image
                        if img_path.exists():
                            zf.write(str(img_path), f"storylines/{storyline.id}/char_segments/{char_assoc.character_id}_segment{seg.index}_guide.png")
                
                storyline_data["character_videos"].append(char_video_data)
                
                # Add character-specific video file if exists
                if char_assoc.video_path:
                    video_path = get_user_data_dir() / char_assoc.video_path
                    if video_path.exists():
                        zf.write(str(video_path), f"storylines/{storyline.id}/videos/{char_assoc.character_id}.mp4")
                
                # Add character video thumbnail if exists
                if char_assoc.video_thumbnail:
                    thumb_path = get_user_data_dir() / char_assoc.video_thumbnail
                    if thumb_path.exists():
                        zf.write(str(thumb_path), f"storylines/{storyline.id}/videos/{char_assoc.character_id}_thumb.jpg")
            
            # Add base video if exists
            if storyline.base_video_path:
                video_path = get_user_data_dir() / storyline.base_video_path
                if video_path.exists():
                    zf.write(str(video_path), f"storylines/{storyline.id}/base_video.mp4")
            
            # Add icon image if exists
            if storyline.icon_image:
                icon_path = get_user_data_dir() / storyline.icon_image
                if icon_path.exists():
                    _, ext = os.path.splitext(storyline.icon_image)
                    zf.write(str(icon_path), f"storylines/{storyline.id}/icon{ext}")
            
            # Add cover images if exist
            for cover_field in ['cover_original', 'cover_thumbnail', 'cover_medium', 'cover_large']:
                cover_path_str = getattr(storyline, cover_field, None)
                if cover_path_str:
                    cover_path = get_user_data_dir() / cover_path_str
                    if cover_path.exists():
                        _, ext = os.path.splitext(cover_path_str)
                        zf.write(str(cover_path), f"storylines/{storyline.id}/{cover_field}{ext}")
            
            storylines_data.append(storyline_data)
        
        return storylines_data

    def _export_settings(self) -> Dict[str, Any]:
        """Export system settings (complete fields)."""
        settings = settings_service.get_settings()
        return {
            # Added: theme
            "theme": settings.theme,
            "language": settings.language,
            "fallback_language": settings.fallback_language,
            "storage": {
                "mode": settings.storage.mode,
                "local_path": settings.storage.local_path,
                # Added: auto cleanup settings
                "auto_cleanup_enabled": settings.storage.auto_cleanup_enabled,
                "auto_cleanup_threshold": settings.storage.auto_cleanup_threshold,
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
                "inactivity_show_countdown_seconds": settings.timeouts.inactivity_show_countdown_seconds,
                "segment_review_inactivity_seconds": settings.timeouts.segment_review_inactivity_seconds,
            },
            "rendering": {
                "target_fps": settings.rendering.target_fps,
                "video_codec": settings.rendering.video_codec,
                "max_render_time_seconds": settings.rendering.max_render_time_seconds,
                # Added: composition mode
                "composition_mode": settings.rendering.composition_mode,
                # Added: encoder settings
                "video_encoder": settings.rendering.video_encoder,
                "encoder_preset": settings.rendering.encoder_preset,
                "encoder_quality": settings.rendering.encoder_quality,
            }
        }

    def validate_import_file(
        self, zip_content: bytes
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Validate an import ZIP file.
        
        Supports backward compatibility with older export versions.
        
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
                
                # Check version compatibility (support older versions)
                version = manifest.get("version")
                if version not in SUPPORTED_IMPORT_VERSIONS:
                    return False, f"Incompatible backup version: {version} (supported: {', '.join(SUPPORTED_IMPORT_VERSIONS)})", None
                
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
        """Import characters from ZIP file (supports all fields including v2.0)."""
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
            
            # Create character with all fields
            character = CharacterDB(
                id=char_id,
                name=char_data["name"],
                description=char_data.get("description"),
                thumbnail_path=char_data.get("thumbnail_path"),
                # Added: default_facing
                default_facing=char_data.get("default_facing", "left"),
                created_at=datetime.fromisoformat(char_data["created_at"]) if char_data.get("created_at") else datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(character)
            await db.flush()
            
            # Create character directory
            char_dir = get_user_data_dir() / "characters" / char_id
            char_dir.mkdir(parents=True, exist_ok=True)
            
            # Import parts with all fields
            for part_data in char_data.get("parts", []):
                part = CharacterPartDB(
                    character_id=char_id,
                    name=part_data["name"],
                    file_path=part_data["file_path"],
                    pivot_x=part_data.get("pivot_x", 0.5),
                    pivot_y=part_data.get("pivot_y", 0.5),
                    z_index=part_data.get("z_index", 0),
                    connections=part_data.get("connections", "[]"),
                    # Added: joints
                    joints=part_data.get("joints", "[]"),
                    # Added: editor layout
                    editor_x=part_data.get("editor_x"),
                    editor_y=part_data.get("editor_y"),
                    editor_width=part_data.get("editor_width"),
                    editor_height=part_data.get("editor_height"),
                    # Added: joint pivot
                    joint_pivot_x=part_data.get("joint_pivot_x"),
                    joint_pivot_y=part_data.get("joint_pivot_y"),
                    # Added: rotation offset
                    rotation_offset=part_data.get("rotation_offset"),
                    # Added: rest pose offset
                    rest_pose_offset=part_data.get("rest_pose_offset")
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
            
            # Regenerate spritesheet after importing parts
            await self._regenerate_character_spritesheet(char_id, char_data.get("parts", []))
            
            stats["imported"] += 1
        
        return stats
    
    async def _regenerate_character_spritesheet(
        self,
        character_id: str,
        parts_data: List[Dict[str, Any]]
    ) -> None:
        """Regenerate spritesheet for an imported character."""
        from .spritesheet_service import spritesheet_service
        
        if not parts_data:
            return
        
        # Prepare parts data for spritesheet generation
        spritesheet_parts = []
        for part in parts_data:
            # Parse joints JSON if it's a string
            joints = part.get("joints", "[]")
            if isinstance(joints, str):
                import json as json_module
                try:
                    joints = json_module.loads(joints)
                except:
                    joints = []
            
            spritesheet_parts.append({
                "name": part.get("name"),
                "file_path": part.get("file_path"),
                "pivot_x": part.get("pivot_x", 0.5),
                "pivot_y": part.get("pivot_y", 0.5),
                "z_index": part.get("z_index", 0),
                "editor_x": part.get("editor_x"),
                "editor_y": part.get("editor_y"),
                "editor_width": part.get("editor_width"),
                "editor_height": part.get("editor_height"),
                "joints": joints,
                "joint_pivot_x": part.get("joint_pivot_x"),
                "joint_pivot_y": part.get("joint_pivot_y"),
                "rotation_offset": part.get("rotation_offset"),
                "rest_pose_offset": part.get("rest_pose_offset"),
            })
        
        try:
            await spritesheet_service.generate_spritesheet(character_id, spritesheet_parts)
        except Exception as e:
            # Log but don't fail the import - spritesheet can be regenerated manually
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to regenerate spritesheet for character {character_id}: {e}")

    async def _import_storylines(
        self,
        db: AsyncSession,
        zf: zipfile.ZipFile,
        overwrite: bool
    ) -> Dict[str, int]:
        """Import storylines from ZIP file (supports all fields including v2.0).
        
        Includes: segments, transitions, character videos, character video segments.
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
            
            # Create storyline with all fields
            storyline = StorylineDB(
                id=storyline_id,
                name=storyline_data["name"],
                name_en=storyline_data.get("name_en", ""),
                description=storyline_data.get("description", ""),
                description_en=storyline_data.get("description_en", ""),
                # Added: synopsis
                synopsis=storyline_data.get("synopsis", ""),
                synopsis_en=storyline_data.get("synopsis_en", ""),
                icon=storyline_data.get("icon", "🎭"),
                icon_image=storyline_data.get("icon_image"),
                base_video_path=storyline_data.get("base_video_path", ""),
                video_duration=storyline_data.get("video_duration", 0.0),
                # Added: video resolution
                video_width=storyline_data.get("video_width"),
                video_height=storyline_data.get("video_height"),
                character_id=storyline_data.get("character_id"),
                # Added: status and display settings
                status=storyline_data.get("status", "draft"),
                display_order=storyline_data.get("display_order", 0),
                enabled=storyline_data.get("enabled", False),
                # Added: cover images
                cover_original=storyline_data.get("cover_original"),
                cover_thumbnail=storyline_data.get("cover_thumbnail"),
                cover_medium=storyline_data.get("cover_medium"),
                cover_large=storyline_data.get("cover_large"),
                created_at=datetime.fromisoformat(storyline_data["created_at"]) if storyline_data.get("created_at") else datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(storyline)
            await db.flush()
            
            # Create storyline directory
            storyline_dir = get_user_data_dir() / "storylines" / storyline_id
            storyline_dir.mkdir(parents=True, exist_ok=True)
            
            # Import segments with all fields
            for segment_data in storyline_data.get("segments", []):
                segment = SegmentDB(
                    storyline_id=storyline_id,
                    index=segment_data["index"],
                    duration=segment_data.get("duration", 5.0),
                    path_type=segment_data.get("path_type", "static"),
                    offset_start_x=segment_data.get("offset_start_x", 0.1),
                    offset_start_y=segment_data.get("offset_start_y", 0.5),
                    offset_end_x=segment_data.get("offset_end_x", 0.9),
                    offset_end_y=segment_data.get("offset_end_y", 0.5),
                    # Added: path waypoints and draw type
                    path_waypoints=segment_data.get("path_waypoints"),
                    path_draw_type=segment_data.get("path_draw_type", "linear"),
                    guidance_text=segment_data.get("guidance_text", ""),
                    guidance_text_en=segment_data.get("guidance_text_en", ""),
                    guidance_image=segment_data.get("guidance_image"),
                    # Added: audio playback
                    play_audio=segment_data.get("play_audio", False),
                    # Added: scale configuration
                    scale_mode=segment_data.get("scale_mode", "auto"),
                    scale_start=segment_data.get("scale_start", 1.0),
                    scale_end=segment_data.get("scale_end", 1.0),
                    # Added: timeline fields
                    start_time=segment_data.get("start_time", 0.0),
                    # Added: entry animation
                    entry_type=segment_data.get("entry_type", "instant"),
                    entry_duration=segment_data.get("entry_duration", 1.0),
                    entry_delay=segment_data.get("entry_delay", 0.0),
                    # Added: exit animation
                    exit_type=segment_data.get("exit_type", "instant"),
                    exit_duration=segment_data.get("exit_duration", 1.0),
                    exit_delay=segment_data.get("exit_delay", 0.0)
                )
                db.add(segment)
                
                # Extract guidance image
                guide_zip_path = f"storylines/{storyline_id}/segment{segment_data['index']}_guide.png"
                if guide_zip_path in zf.namelist():
                    guide_path = storyline_dir / f"segment{segment_data['index']}_guide.png"
                    with open(guide_path, 'wb') as f:
                        f.write(zf.read(guide_zip_path))
            
            # Import transitions (Added)
            for transition_data in storyline_data.get("transitions", []):
                transition = TransitionDB(
                    id=transition_data.get("id", str(uuid.uuid4())),
                    storyline_id=storyline_id,
                    from_segment_index=transition_data["from_segment_index"],
                    to_segment_index=transition_data["to_segment_index"],
                    type=transition_data.get("type", "cut"),
                    duration=transition_data.get("duration", 0.5)
                )
                db.add(transition)
            
            # Import character-specific videos with segments
            videos_dir = storyline_dir / "videos"
            char_segments_dir = storyline_dir / "char_segments"
            
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
                await db.flush()
                
                # Import character video segments (Added)
                for char_seg_data in char_video_data.get("segments", []):
                    char_seg = CharacterVideoSegmentDB(
                        storyline_character_id=char_assoc.id,
                        index=char_seg_data["index"],
                        start_time=char_seg_data.get("start_time", 0.0),
                        duration=char_seg_data.get("duration", 5.0),
                        path_type=char_seg_data.get("path_type", "static"),
                        offset_start_x=char_seg_data.get("offset_start_x", 0.1),
                        offset_start_y=char_seg_data.get("offset_start_y", 0.5),
                        offset_end_x=char_seg_data.get("offset_end_x", 0.9),
                        offset_end_y=char_seg_data.get("offset_end_y", 0.5),
                        path_waypoints=char_seg_data.get("path_waypoints"),
                        path_draw_type=char_seg_data.get("path_draw_type", "linear"),
                        entry_type=char_seg_data.get("entry_type", "instant"),
                        entry_duration=char_seg_data.get("entry_duration", 1.0),
                        entry_delay=char_seg_data.get("entry_delay", 0.0),
                        exit_type=char_seg_data.get("exit_type", "instant"),
                        exit_duration=char_seg_data.get("exit_duration", 1.0),
                        exit_delay=char_seg_data.get("exit_delay", 0.0),
                        guidance_text=char_seg_data.get("guidance_text", ""),
                        guidance_text_en=char_seg_data.get("guidance_text_en", ""),
                        guidance_image=char_seg_data.get("guidance_image"),
                        play_audio=char_seg_data.get("play_audio", False),
                        scale_mode=char_seg_data.get("scale_mode", "auto"),
                        scale_start=char_seg_data.get("scale_start", 1.0),
                        scale_end=char_seg_data.get("scale_end", 1.0)
                    )
                    db.add(char_seg)
                    
                    # Extract character segment guidance image
                    char_seg_guide_path = f"storylines/{storyline_id}/char_segments/{character_id}_segment{char_seg_data['index']}_guide.png"
                    if char_seg_guide_path in zf.namelist():
                        char_segments_dir.mkdir(parents=True, exist_ok=True)
                        guide_file_path = char_segments_dir / f"{character_id}_segment{char_seg_data['index']}_guide.png"
                        with open(guide_file_path, 'wb') as f:
                            f.write(zf.read(char_seg_guide_path))
                
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
            
            # Extract cover images (Added)
            for cover_field in ['cover_original', 'cover_thumbnail', 'cover_medium', 'cover_large']:
                for ext in ['.png', '.jpg', '.jpeg']:
                    cover_zip_path = f"storylines/{storyline_id}/{cover_field}{ext}"
                    if cover_zip_path in zf.namelist():
                        cover_path = storyline_dir / f"{cover_field}{ext}"
                        with open(cover_path, 'wb') as f:
                            f.write(zf.read(cover_zip_path))
                        break
            
            stats["imported"] += 1
        
        return stats

    def _import_settings(self, zf: zipfile.ZipFile) -> None:
        """Import settings from ZIP file (supports all fields including v2.0)."""
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
            # Added: theme
            theme=settings_data.get("theme"),
            language=settings_data.get("language"),
            fallback_language=settings_data.get("fallback_language"),
        )
        
        if "storage" in settings_data:
            storage = settings_data["storage"]
            update.storage = StorageSettingsUpdate(
                mode=storage.get("mode"),
                local_path=storage.get("local_path"),
                # Added: auto cleanup settings
                auto_cleanup_enabled=storage.get("auto_cleanup_enabled"),
                auto_cleanup_threshold=storage.get("auto_cleanup_threshold"),
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
                inactivity_show_countdown_seconds=timeouts.get("inactivity_show_countdown_seconds"),
                segment_review_inactivity_seconds=timeouts.get("segment_review_inactivity_seconds"),
            )
        
        if "rendering" in settings_data:
            rendering = settings_data["rendering"]
            update.rendering = RenderingSettingsUpdate(
                target_fps=rendering.get("target_fps"),
                video_codec=rendering.get("video_codec"),
                max_render_time_seconds=rendering.get("max_render_time_seconds"),
                # Added: composition mode
                composition_mode=rendering.get("composition_mode"),
                # Added: encoder settings
                video_encoder=rendering.get("video_encoder"),
                encoder_preset=rendering.get("encoder_preset"),
                encoder_quality=rendering.get("encoder_quality"),
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
