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
        
        character.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(character)
        return character

    async def check_storyline_bindings(
        self, db: AsyncSession, character_id: str
    ) -> List[str]:
        """
        Check if a character is bound to any storylines.
        Returns list of storyline IDs that reference this character.
        """
        from ...models.admin.storyline import StorylineDB
        
        result = await db.execute(
            select(StorylineDB.id).where(StorylineDB.character_id == character_id)
        )
        return list(result.scalars().all())

    async def delete_character(
        self, db: AsyncSession, character_id: str
    ) -> Tuple[bool, str]:
        """
        Delete a character if not bound to any storylines.
        
        Returns:
            Tuple of (success, error_message)
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None:
            return False, "Character not found"
        
        # Check for storyline bindings
        bound_storylines = await self.check_storyline_bindings(db, character_id)
        if bound_storylines:
            return False, f"Character is bound to storylines: {', '.join(bound_storylines)}"
        
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

    async def generate_thumbnail(
        self,
        db: AsyncSession,
        character_id: str,
        size: Tuple[int, int] = (128, 128),
    ) -> Optional[str]:
        """
        Generate a preview thumbnail for a character by compositing its parts.
        
        Returns the thumbnail path or None if generation failed.
        """
        character = await self.get_character_by_id(db, character_id)
        if character is None or len(character.parts) == 0:
            return None
        
        try:
            # Create a blank canvas with transparency
            canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
            
            # Sort parts by z_index
            sorted_parts = sorted(character.parts, key=lambda p: p.z_index)
            
            # Composite each part onto the canvas
            for part in sorted_parts:
                part_path = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
                    "data", part.file_path
                )
                if os.path.exists(part_path):
                    part_img = Image.open(part_path).convert("RGBA")
                    # Resize part to fit canvas (simple center placement)
                    part_img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                    # Center the part on canvas
                    x = (512 - part_img.width) // 2
                    y = (512 - part_img.height) // 2
                    canvas.paste(part_img, (x, y), part_img)
            
            # Resize to thumbnail size
            canvas.thumbnail(size, Image.Resampling.LANCZOS)
            
            # Save thumbnail
            char_dir = self.get_character_dir(character_id)
            thumbnail_path = os.path.join(char_dir, "thumbnail.png")
            relative_path = f"characters/{character_id}/thumbnail.png"
            canvas.save(thumbnail_path, "PNG")
            
            # Update character thumbnail path
            character.thumbnail_path = relative_path
            character.updated_at = datetime.utcnow()
            await db.commit()
            
            return relative_path
            
        except Exception as e:
            # Log error but don't fail the operation
            print(f"Failed to generate thumbnail: {e}")
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
        parts = []
        for p in character.parts:
            parts.append(CharacterPart(
                name=p.name,
                file_path=p.file_path,
                pivot_x=p.pivot_x,
                pivot_y=p.pivot_y,
                z_index=p.z_index,
                connections=json.loads(p.connections) if p.connections else [],
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
