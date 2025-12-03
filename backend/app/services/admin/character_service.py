"""
Character service for admin panel.
Handles character CRUD operations, PNG validation, and part management.
"""
import json
import os
import uuid
from datetime import datetime
from io import BytesIO
from typing import List, Optional, Tuple

from PIL import Image
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models.admin.character import (
    CharacterDB,
    CharacterPartDB,
    SkeletonBindingDB,
    CharacterCreate,
    CharacterUpdate,
    CharacterPart,
    SkeletonBinding,
    CharacterResponse,
    CharacterListResponse,
    BASE_REQUIRED_PARTS,
    LOWER_BODY_SKIRT,
    LOWER_BODY_THIGHS,
)


# Minimum PNG resolution
MIN_PNG_WIDTH = 256
MIN_PNG_HEIGHT = 256

# Character assets directory
CHARACTERS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "data", "characters"
)


class CharacterService:
    """Service for handling character operations."""

    def __init__(self):
        """Initialize the character service."""
        # Ensure characters directory exists
        os.makedirs(CHARACTERS_DIR, exist_ok=True)

    @staticmethod
    def validate_png_file(file_content: bytes) -> Tuple[bool, str]:
        """
        Validate a PNG file for transparency and minimum resolution.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            image = Image.open(BytesIO(file_content))
            
            # Check format
            if image.format != "PNG":
                return False, "File must be PNG format"
            
            # Check resolution
            width, height = image.size
            if width < MIN_PNG_WIDTH or height < MIN_PNG_HEIGHT:
                return False, f"Image must be at least {MIN_PNG_WIDTH}x{MIN_PNG_HEIGHT} pixels (got {width}x{height})"
            
            # Check for transparency (alpha channel)
            if image.mode not in ("RGBA", "LA", "PA"):
                return False, "Image must have transparent background (alpha channel)"
            
            # Check if image actually has transparent pixels
            if image.mode == "RGBA":
                alpha = image.getchannel("A")
                # Check if there are any transparent pixels (alpha < 255)
                if alpha.getextrema()[0] == 255:
                    return False, "Image must have transparent background (no transparent pixels found)"
            
            return True, ""
            
        except Exception as e:
            return False, f"Invalid image file: {str(e)}"


    @staticmethod
    def validate_required_parts(part_names: List[str]) -> Tuple[bool, List[str]]:
        """
        Validate that all required parts are present.
        
        Required parts:
        - All BASE_REQUIRED_PARTS (head, body, arms, hands, feet)
        - Lower body: EITHER skirt OR (left-thigh AND right-thigh)
        
        Returns:
            Tuple of (is_valid, missing_parts)
        """
        missing = []
        
        # Check base required parts
        for part in BASE_REQUIRED_PARTS:
            if part not in part_names:
                missing.append(part)
        
        # Check lower body: need skirt OR both thighs
        has_skirt = LOWER_BODY_SKIRT[0] in part_names  # "skirt"
        has_left_thigh = LOWER_BODY_THIGHS[0] in part_names  # "left-thigh"
        has_right_thigh = LOWER_BODY_THIGHS[1] in part_names  # "right-thigh"
        has_both_thighs = has_left_thigh and has_right_thigh
        
        if not has_skirt and not has_both_thighs:
            # Missing lower body
            if has_left_thigh and not has_right_thigh:
                missing.append("right-thigh")
            elif has_right_thigh and not has_left_thigh:
                missing.append("left-thigh")
            else:
                missing.append("skirt 或 left-thigh+right-thigh")
        
        return len(missing) == 0, missing

    def get_character_dir(self, character_id: str) -> str:
        """Get the directory path for a character's assets."""
        return os.path.join(CHARACTERS_DIR, character_id)

    async def create_character(
        self, db: AsyncSession, character_data: CharacterCreate
    ) -> CharacterDB:
        """Create a new character."""
        character_id = str(uuid.uuid4())
        
        # Create character directory
        char_dir = self.get_character_dir(character_id)
        os.makedirs(char_dir, exist_ok=True)
        
        character = CharacterDB(
            id=character_id,
            name=character_data.name,
            description=character_data.description,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(character)
        await db.commit()
        await db.refresh(character)
        return character

    async def get_character_by_id(
        self, db: AsyncSession, character_id: str
    ) -> Optional[CharacterDB]:
        """Get a character by ID with all related data."""
        result = await db.execute(
            select(CharacterDB)
            .where(CharacterDB.id == character_id)
            .options(
                selectinload(CharacterDB.parts),
                selectinload(CharacterDB.bindings)
            )
        )
        return result.scalar_one_or_none()

    async def get_all_characters(self, db: AsyncSession) -> List[CharacterDB]:
        """Get all characters with their parts."""
        result = await db.execute(
            select(CharacterDB)
            .options(selectinload(CharacterDB.parts))
            .order_by(CharacterDB.created_at.desc())
        )
        return list(result.scalars().all())

    async def update_character(
        self, db: AsyncSession, character_id: str, update_data: CharacterUpdate
    ) -> Optional[CharacterDB]:
        """Update a character's basic info."""
        character = await self.get_character_by_id(db, character_id)
        if character is None:
            return None
        
        if update_data.name is not None:
            character.name = update_data.name
        if update_data.description is not None:
            character.description = update_data.description
        if update_data.default_facing is not None:
            character.default_facing = update_data.default_facing
        
        character.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(character)
        return character

    async def check_storyline_bindings(
        self, db: AsyncSession, character_id: str
    ) -> List[str]:
        """
        Check if a character is bound to any storylines (legacy character_id field).
        Returns list of storyline IDs that reference this character.
        """
        from ...models.admin.storyline import StorylineDB
        
        result = await db.execute(
            select(StorylineDB.id).where(StorylineDB.character_id == character_id)
        )
        return list(result.scalars().all())

    async def check_storyline_character_configs(
        self, db: AsyncSession, character_id: str
    ) -> List[str]:
        """
        Check if a character is in any storyline character configurations.
        Returns list of storyline IDs that include this character.
        
        Requirements 7.5: Character Deletion Cascade
        """
        from ...models.admin.storyline import StorylineCharacterDB
        
        result = await db.execute(
            select(StorylineCharacterDB.storyline_id).where(
                StorylineCharacterDB.character_id == character_id
            )
        )
        return list(set(result.scalars().all()))

    async def delete_character(
        self, db: AsyncSession, character_id: str, force_cascade: bool = False
    ) -> Tuple[bool, str]:
        """
        Delete a character, optionally cascading removal from storyline configs.
        
        Requirements 7.5: Character Deletion Cascade
        *For any* character deleted from the system, that character SHALL be 
        removed from all storyline character configurations.
        
        Property 8: Character Cascade Delete
        *For any* character deletion, all video associations for that character
        across all storylines SHALL be removed.
        
        Requirements 5.4
        
        Args:
            db: Database session
            character_id: Character ID to delete
            force_cascade: If True, remove character from storyline configs before deleting
        
        Returns:
            Tuple of (success, error_message)
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None:
            return False, "Character not found"
        
        # Check for legacy storyline bindings (character_id field)
        bound_storylines = await self.check_storyline_bindings(db, character_id)
        if bound_storylines:
            return False, f"Character is bound to storylines: {', '.join(bound_storylines)}"
        
        # Check for storyline character configurations
        config_storylines = await self.check_storyline_character_configs(db, character_id)
        
        if config_storylines:
            if force_cascade:
                # Delete all character-specific videos for this character (Property 8, Requirements 5.4)
                from .character_video_service import character_video_service
                await character_video_service.delete_all_videos_for_character(db, character_id)
                
                # Remove character from all storyline configurations
                from .storyline_service import storyline_service
                affected_count, error = await storyline_service.remove_character_from_all_storylines(
                    db, character_id
                )
                if error:
                    return False, f"Failed to remove character from storyline configs: {error}"
            else:
                return False, f"Character is configured in {len(config_storylines)} storyline(s). Use force_cascade=True to remove from configs."
        
        # Delete character directory and files
        char_dir = self.get_character_dir(character_id)
        if os.path.exists(char_dir):
            import shutil
            shutil.rmtree(char_dir)
        
        # Delete from database (cascade will delete parts and bindings)
        await db.delete(character)
        await db.commit()
        return True, ""


    async def add_character_part(
        self,
        db: AsyncSession,
        character_id: str,
        part_name: str,
        file_content: bytes,
        filename: str,
    ) -> Tuple[Optional[CharacterPartDB], str]:
        """
        Add or update a character part with PNG file.
        
        Returns:
            Tuple of (part, error_message)
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None:
            return None, "Character not found"
        
        # Validate PNG file
        is_valid, error = self.validate_png_file(file_content)
        if not is_valid:
            return None, error
        
        # Save file
        char_dir = self.get_character_dir(character_id)
        os.makedirs(char_dir, exist_ok=True)
        
        # Use part name as filename with .png extension
        file_path = os.path.join(char_dir, f"{part_name}.png")
        relative_path = f"characters/{character_id}/{part_name}.png"
        
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        # Check if part already exists
        existing_part = None
        for part in character.parts:
            if part.name == part_name:
                existing_part = part
                break
        
        if existing_part:
            # Update existing part
            existing_part.file_path = relative_path
            part = existing_part
        else:
            # Create new part
            part = CharacterPartDB(
                character_id=character_id,
                name=part_name,
                file_path=relative_path,
                pivot_x=0.5,
                pivot_y=0.5,
                z_index=0,
                connections="[]",
            )
            db.add(part)
        
        character.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(part)
        
        # Generate thumbnail if we have enough parts
        await self.generate_thumbnail(db, character_id)
        
        return part, ""

    async def delete_character_part(
        self,
        db: AsyncSession,
        character_id: str,
        part_name: str,
    ) -> Tuple[bool, str]:
        """
        Delete a character part.
        
        Returns:
            Tuple of (success, error_message)
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None:
            return False, "Character not found"
        
        # Find the part
        part_to_delete = None
        for part in character.parts:
            if part.name == part_name:
                part_to_delete = part
                break
        
        if part_to_delete is None:
            return False, f"Part '{part_name}' not found"
        
        # Delete the file
        file_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
            "data", part_to_delete.file_path
        )
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # Delete from database
        await db.delete(part_to_delete)
        character.updated_at = datetime.utcnow()
        await db.commit()
        
        # Regenerate thumbnail
        await self.generate_thumbnail(db, character_id)
        
        return True, ""

    async def generate_thumbnail(
        self,
        db: AsyncSession,
        character_id: str,
        size: Tuple[int, int] = (400, 400),
    ) -> Optional[str]:
        """
        Generate a preview thumbnail for a character by compositing its parts
        using the assembly positions from spritesheet.json.
        
        Returns the thumbnail path or None if generation failed.
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None or len(character.parts) == 0:
            return None
        
        try:
            char_dir = self.get_character_dir(character_id)
            spritesheet_json_path = os.path.join(char_dir, "spritesheet.json")
            
            # Try to load assembly data from spritesheet.json
            assembly_data = {}
            if os.path.exists(spritesheet_json_path):
                with open(spritesheet_json_path, 'r') as f:
                    spritesheet = json.load(f)
                    frames = spritesheet.get('frames', {})
                    for part_name, frame_data in frames.items():
                        if 'assembly' in frame_data:
                            assembly_data[part_name] = frame_data['assembly']
            
            # Calculate bounding box of all parts
            min_x, min_y = float('inf'), float('inf')
            max_x, max_y = float('-inf'), float('-inf')
            
            print(f"[Thumbnail] Generating for character {character_id}")
            print(f"[Thumbnail] Found {len(assembly_data)} parts with assembly data")
            
            for part in character.parts:
                if part.name in assembly_data:
                    asm = assembly_data[part.name]
                    min_x = min(min_x, asm['x'])
                    min_y = min(min_y, asm['y'])
                    max_x = max(max_x, asm['x'] + asm['width'])
                    max_y = max(max_y, asm['y'] + asm['height'])
            
            print(f"[Thumbnail] Bounding box: ({min_x}, {min_y}) to ({max_x}, {max_y})")
            
            # If no assembly data, use simple center placement
            if min_x == float('inf'):
                print("[Thumbnail] No assembly data, using simple thumbnail")
                return await self._generate_simple_thumbnail(db, character, char_dir, size)
            
            # Calculate content size
            content_width = max_x - min_x
            content_height = max_y - min_y
            
            # Calculate scale to fit in thumbnail while maintaining aspect ratio
            # Add some padding (10% on each side)
            target_width, target_height = size
            padding_ratio = 0.1
            available_width = target_width * (1 - 2 * padding_ratio)
            available_height = target_height * (1 - 2 * padding_ratio)
            
            scale_x = available_width / content_width if content_width > 0 else 1
            scale_y = available_height / content_height if content_height > 0 else 1
            scale = min(scale_x, scale_y)  # Use smaller scale to fit both dimensions
            
            # Create final thumbnail canvas
            canvas = Image.new("RGBA", size, (0, 0, 0, 0))
            
            # Calculate offset to center the content
            scaled_width = content_width * scale
            scaled_height = content_height * scale
            offset_x = (target_width - scaled_width) / 2
            offset_y = (target_height - scaled_height) / 2
            
            # Sort parts by z_index
            sorted_parts = sorted(character.parts, key=lambda p: p.z_index)
            
            # Composite each part using assembly positions
            for part in sorted_parts:
                part_path = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
                    "data", part.file_path
                )
                if os.path.exists(part_path) and part.name in assembly_data:
                    part_img = Image.open(part_path).convert("RGBA")
                    asm = assembly_data[part.name]
                    
                    # Calculate scaled position on canvas
                    x = int((asm['x'] - min_x) * scale + offset_x)
                    y = int((asm['y'] - min_y) * scale + offset_y)
                    
                    # Resize part to scaled assembly size
                    target_part_width = max(1, int(asm['width'] * scale))
                    target_part_height = max(1, int(asm['height'] * scale))
                    part_img = part_img.resize((target_part_width, target_part_height), Image.Resampling.LANCZOS)
                    
                    canvas.paste(part_img, (x, y), part_img)
            
            # Save thumbnail
            thumbnail_path = os.path.join(char_dir, "thumbnail.png")
            relative_path = f"characters/{character_id}/thumbnail.png"
            canvas.save(thumbnail_path, "PNG")
            print(f"[Thumbnail] Saved to {thumbnail_path}, size: {canvas.size}")
            
            # Update character thumbnail path
            character.thumbnail_path = relative_path
            character.updated_at = datetime.utcnow()
            await db.commit()
            
            return relative_path
            
        except Exception as e:
            # Log error but don't fail the operation
            print(f"Failed to generate thumbnail: {e}")
            return None

    async def _generate_simple_thumbnail(
        self,
        db: AsyncSession,
        character,
        char_dir: str,
        size: Tuple[int, int],
    ) -> Optional[str]:
        """Fallback simple thumbnail generation without assembly data."""
        try:
            canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
            sorted_parts = sorted(character.parts, key=lambda p: p.z_index)
            
            for part in sorted_parts:
                part_path = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
                    "data", part.file_path
                )
                if os.path.exists(part_path):
                    part_img = Image.open(part_path).convert("RGBA")
                    part_img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                    x = (512 - part_img.width) // 2
                    y = (512 - part_img.height) // 2
                    canvas.paste(part_img, (x, y), part_img)
            
            canvas.thumbnail(size, Image.Resampling.LANCZOS)
            
            thumbnail_path = os.path.join(char_dir, "thumbnail.png")
            relative_path = f"characters/{character.id}/thumbnail.png"
            canvas.save(thumbnail_path, "PNG")
            
            character.thumbnail_path = relative_path
            character.updated_at = datetime.utcnow()
            await db.commit()
            
            return relative_path
        except Exception as e:
            print(f"Failed to generate simple thumbnail: {e}")
            return None

    async def update_pivot_configuration(
        self,
        db: AsyncSession,
        character_id: str,
        parts: List[CharacterPart],
    ) -> Tuple[bool, str]:
        """
        Update pivot configuration for character parts.
        
        Returns:
            Tuple of (success, error_message)
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None:
            return False, "Character not found"
        
        # Create a map of existing parts
        existing_parts = {p.name: p for p in character.parts}
        
        for part_data in parts:
            if part_data.name not in existing_parts:
                return False, f"Part '{part_data.name}' not found"
            
            part = existing_parts[part_data.name]
            part.pivot_x = part_data.pivot_x
            part.pivot_y = part_data.pivot_y
            part.z_index = part_data.z_index
            part.connections = json.dumps(part_data.connections)
            # Save joints data
            if hasattr(part_data, 'joints'):
                joints_list = [j.model_dump() if hasattr(j, 'model_dump') else j for j in part_data.joints]
                part.joints = json.dumps(joints_list)
            # Save editor position data
            if hasattr(part_data, 'editor_x') and part_data.editor_x is not None:
                part.editor_x = part_data.editor_x
            if hasattr(part_data, 'editor_y') and part_data.editor_y is not None:
                part.editor_y = part_data.editor_y
            if hasattr(part_data, 'editor_width') and part_data.editor_width is not None:
                part.editor_width = part_data.editor_width
            if hasattr(part_data, 'editor_height') and part_data.editor_height is not None:
                part.editor_height = part_data.editor_height
            # Save joint pivot and rotation offset
            if hasattr(part_data, 'joint_pivot_x'):
                part.joint_pivot_x = part_data.joint_pivot_x
            if hasattr(part_data, 'joint_pivot_y'):
                part.joint_pivot_y = part_data.joint_pivot_y
            if hasattr(part_data, 'rotation_offset'):
                part.rotation_offset = part_data.rotation_offset
            if hasattr(part_data, 'rest_pose_offset'):
                part.rest_pose_offset = part_data.rest_pose_offset
        
        character.updated_at = datetime.utcnow()
        await db.commit()
        return True, ""

    async def update_skeleton_bindings(
        self,
        db: AsyncSession,
        character_id: str,
        bindings: List[SkeletonBinding],
    ) -> Tuple[bool, str]:
        """
        Update skeleton bindings for a character.
        
        Returns:
            Tuple of (success, error_message)
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None:
            return False, "Character not found"
        
        # Delete existing bindings
        await db.execute(
            delete(SkeletonBindingDB).where(
                SkeletonBindingDB.character_id == character_id
            )
        )
        
        # Add new bindings
        for binding_data in bindings:
            binding = SkeletonBindingDB(
                character_id=character_id,
                part_name=binding_data.part_name,
                landmarks=json.dumps(binding_data.landmarks),
                rotation_landmark=binding_data.rotation_landmark,
                scale_landmarks=json.dumps(binding_data.scale_landmarks),
            )
            db.add(binding)
        
        character.updated_at = datetime.utcnow()
        await db.commit()
        return True, ""

    def to_character_response(self, character: CharacterDB) -> CharacterResponse:
        """Convert a CharacterDB to CharacterResponse."""
        from ...models.admin.character import Joint
        parts = []
        for p in character.parts:
            try:
                joints_raw = json.loads(p.joints) if hasattr(p, 'joints') and p.joints else []
                joints_data = [Joint(**j) if isinstance(j, dict) else j for j in joints_raw]
            except Exception:
                joints_data = []
            parts.append(CharacterPart(
                name=p.name,
                file_path=p.file_path,
                pivot_x=p.pivot_x,
                pivot_y=p.pivot_y,
                z_index=p.z_index,
                connections=json.loads(p.connections) if p.connections else [],
                joints=joints_data,
                editor_x=p.editor_x if hasattr(p, 'editor_x') else None,
                editor_y=p.editor_y if hasattr(p, 'editor_y') else None,
                editor_width=p.editor_width if hasattr(p, 'editor_width') else None,
                editor_height=p.editor_height if hasattr(p, 'editor_height') else None,
                joint_pivot_x=p.joint_pivot_x if hasattr(p, 'joint_pivot_x') else None,
                joint_pivot_y=p.joint_pivot_y if hasattr(p, 'joint_pivot_y') else None,
                rotation_offset=p.rotation_offset if hasattr(p, 'rotation_offset') else None,
                rest_pose_offset=p.rest_pose_offset if hasattr(p, 'rest_pose_offset') else None,
            ))
        
        bindings = []
        for b in character.bindings:
            bindings.append(SkeletonBinding(
                part_name=b.part_name,
                landmarks=json.loads(b.landmarks) if b.landmarks else [],
                rotation_landmark=b.rotation_landmark,
                scale_landmarks=json.loads(b.scale_landmarks) if b.scale_landmarks else [],
            ))
        
        return CharacterResponse(
            id=character.id,
            name=character.name,
            description=character.description,
            parts=parts,
            bindings=bindings,
            thumbnail_path=character.thumbnail_path,
            default_facing=character.default_facing if hasattr(character, 'default_facing') else 'left',
            created_at=character.created_at,
            updated_at=character.updated_at,
        )

    def to_character_list_response(self, character: CharacterDB) -> CharacterListResponse:
        """Convert a CharacterDB to CharacterListResponse."""
        return CharacterListResponse(
            id=character.id,
            name=character.name,
            description=character.description,
            thumbnail_path=character.thumbnail_path,
            part_count=len(character.parts),
            created_at=character.created_at,
        )


# Singleton instance
character_service = CharacterService()
