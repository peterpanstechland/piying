"""
Character management API endpoints for admin panel.
Handles character CRUD operations, part uploads, pivot configuration, and skeleton bindings.
"""
import json
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models.admin.character import (
    CharacterCreate,
    CharacterUpdate,
    CharacterResponse,
    CharacterListResponse,
    CharacterPart,
    SkeletonBinding,
    PivotConfigUpdate,
    SkeletonBindingUpdate,
    REQUIRED_PARTS,
)
from ...models.admin import TokenPayload
from ...services.admin.character_service import character_service
from .auth import get_current_user

router = APIRouter(prefix="/api/admin/characters", tags=["Admin Character Management"])


@router.get("", response_model=List[CharacterListResponse])
async def list_characters(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[CharacterListResponse]:
    """
    List all characters with preview thumbnails.
    
    Returns a list of all characters with basic info and part counts.
    """
    characters = await character_service.get_all_characters(db)
    return [character_service.to_character_list_response(c) for c in characters]


@router.post("", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_character(
    character_data: CharacterCreate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CharacterResponse:
    """
    Create a new character.
    
    - **name**: Display name for the character
    - **description**: Optional description
    
    Creates a new character with a unique ID and empty parts/bindings.
    """
    character = await character_service.create_character(db, character_data)
    return character_service.to_character_response(character)



@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CharacterResponse:
    """
    Get character details by ID.
    
    Returns complete character information including parts and bindings.
    """
    character = await character_service.get_character_by_id(db, character_id)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    return character_service.to_character_response(character)


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    update_data: CharacterUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CharacterResponse:
    """
    Update a character's basic information.
    
    - **name**: New display name (optional)
    - **description**: New description (optional)
    """
    character = await character_service.update_character(db, character_id, update_data)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    return character_service.to_character_response(character)


@router.delete("/{character_id}", status_code=status.HTTP_200_OK)
async def delete_character(
    character_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Delete a character by ID.
    
    Character can only be deleted if it is not bound to any active storyline.
    """
    success, error = await character_service.delete_character(db, character_id)
    if not success:
        if "not found" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        elif "bound to storylines" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error,
            )
    return {"message": f"Character '{character_id}' deleted successfully"}



@router.post("/{character_id}/parts", status_code=status.HTTP_201_CREATED)
async def upload_character_part(
    character_id: str,
    part_name: str = Form(..., description="Part name (e.g., 'head', 'left-arm')"),
    file: UploadFile = File(..., description="PNG file with transparent background"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Upload a PNG file for a character part.
    
    - **part_name**: Name of the part (head, body, left-arm, right-arm, left-hand, right-hand, left-foot, right-foot, upper-leg)
    - **file**: PNG file with transparent background, minimum 256x256 pixels
    
    Validates the file format, dimensions, and transparency.
    """
    # Validate part name
    if part_name not in REQUIRED_PARTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid part name '{part_name}'. Must be one of: {', '.join(REQUIRED_PARTS)}",
        )
    
    # Validate file type
    if not file.filename.lower().endswith('.png'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PNG image",
        )
    
    # Read file content
    file_content = await file.read()
    
    # Add the part
    part, error = await character_service.add_character_part(
        db, character_id, part_name, file_content, file.filename
    )
    
    if part is None:
        if "not found" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
    
    return {
        "message": f"Part '{part_name}' uploaded successfully",
        "part": {
            "name": part.name,
            "file_path": part.file_path,
            "pivot_x": part.pivot_x,
            "pivot_y": part.pivot_y,
            "z_index": part.z_index,
        }
    }


@router.post("/{character_id}/parts/batch", status_code=status.HTTP_201_CREATED)
async def upload_character_parts_batch(
    character_id: str,
    files: List[UploadFile] = File(..., description="PNG files with transparent background"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """
    Upload multiple PNG files for character parts in batch.
    
    File names should match part names (e.g., 'head.png', 'left-arm.png').
    Validates all files for format, dimensions, and transparency.
    """
    results = {"uploaded": [], "errors": []}
    
    for file in files:
        # Extract part name from filename
        filename = file.filename.lower()
        if not filename.endswith('.png'):
            results["errors"].append({
                "filename": file.filename,
                "error": "File must be a PNG image"
            })
            continue
        
        part_name = filename[:-4]  # Remove .png extension
        
        if part_name not in REQUIRED_PARTS:
            results["errors"].append({
                "filename": file.filename,
                "error": f"Invalid part name '{part_name}'. Must be one of: {', '.join(REQUIRED_PARTS)}"
            })
            continue
        
        # Read file content
        file_content = await file.read()
        
        # Add the part
        part, error = await character_service.add_character_part(
            db, character_id, part_name, file_content, file.filename
        )
        
        if part is None:
            results["errors"].append({
                "filename": file.filename,
                "error": error
            })
        else:
            results["uploaded"].append({
                "name": part.name,
                "file_path": part.file_path,
            })
    
    # Check if character has all required parts
    character = await character_service.get_character_by_id(db, character_id)
    if character:
        part_names = [p.name for p in character.parts]
        is_complete, missing = character_service.validate_required_parts(part_names)
        results["is_complete"] = is_complete
        results["missing_parts"] = missing
    
    return results


@router.get("/{character_id}/parts/validation")
async def validate_character_parts(
    character_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Validate that a character has all required parts.
    
    Returns validation status and list of missing parts.
    """
    character = await character_service.get_character_by_id(db, character_id)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    
    part_names = [p.name for p in character.parts]
    is_valid, missing = character_service.validate_required_parts(part_names)
    
    return {
        "character_id": character_id,
        "is_valid": is_valid,
        "total_parts": len(part_names),
        "required_parts": REQUIRED_PARTS,
        "uploaded_parts": part_names,
        "missing_parts": missing,
    }



@router.put("/{character_id}/pivot", status_code=status.HTTP_200_OK)
async def update_pivot_configuration(
    character_id: str,
    pivot_config: PivotConfigUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Update pivot configuration for character parts.
    
    - **parts**: List of parts with updated pivot points, connections, and z-index values
    
    Each part should include:
    - name: Part name
    - pivot_x: Pivot point X (0-1 normalized)
    - pivot_y: Pivot point Y (0-1 normalized)
    - z_index: Rendering order (higher = on top)
    - connections: List of connected part names
    """
    success, error = await character_service.update_pivot_configuration(
        db, character_id, pivot_config.parts
    )
    
    if not success:
        if "not found" in error.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error,
            )
    
    # Regenerate thumbnail with new z-index ordering
    await character_service.generate_thumbnail(db, character_id)
    
    return {"message": "Pivot configuration updated successfully"}


@router.put("/{character_id}/binding", status_code=status.HTTP_200_OK)
async def update_skeleton_binding(
    character_id: str,
    binding_config: SkeletonBindingUpdate,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Update skeleton binding configuration for a character.
    
    - **bindings**: List of skeleton bindings mapping MediaPipe landmarks to parts
    
    Each binding should include:
    - part_name: Character part name
    - landmarks: List of MediaPipe landmark indices
    - rotation_landmark: Landmark for rotation calculation (optional)
    - scale_landmarks: Landmarks for scale calculation (optional)
    """
    # Validate that all parts exist
    character = await character_service.get_character_by_id(db, character_id)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    
    part_names = {p.name for p in character.parts}
    for binding in binding_config.bindings:
        if binding.part_name not in part_names:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Part '{binding.part_name}' not found in character",
            )
    
    success, error = await character_service.update_skeleton_bindings(
        db, character_id, binding_config.bindings
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error,
        )
    
    # Check for incomplete bindings (parts without landmarks)
    warnings = []
    bound_parts = {b.part_name for b in binding_config.bindings if b.landmarks}
    movable_parts = {"head", "left-arm", "right-arm", "left-hand", "right-hand", "left-foot", "right-foot", "upper-leg"}
    unbound_movable = movable_parts.intersection(part_names) - bound_parts
    
    if unbound_movable:
        warnings.append(f"Parts without landmark assignments: {', '.join(unbound_movable)}")
    
    return {
        "message": "Skeleton binding updated successfully",
        "warnings": warnings if warnings else None,
    }


@router.get("/{character_id}/binding/validation")
async def validate_skeleton_binding(
    character_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Validate skeleton binding completeness for a character.
    
    Returns validation status and warnings for parts without landmark assignments.
    """
    character = await character_service.get_character_by_id(db, character_id)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    
    part_names = {p.name for p in character.parts}
    bound_parts = {b.part_name for b in character.bindings if b.landmarks and json.loads(b.landmarks)}
    
    # Movable parts that should have bindings
    movable_parts = {"head", "left-arm", "right-arm", "left-hand", "right-hand", "left-foot", "right-foot", "upper-leg"}
    required_bindings = movable_parts.intersection(part_names)
    unbound_parts = required_bindings - bound_parts
    
    return {
        "character_id": character_id,
        "is_complete": len(unbound_parts) == 0,
        "total_bindings": len(character.bindings),
        "bound_parts": list(bound_parts),
        "unbound_movable_parts": list(unbound_parts),
        "warnings": [f"Part '{p}' lacks landmark assignments" for p in unbound_parts] if unbound_parts else [],
    }


@router.get("/{character_id}/preview")
async def get_character_preview(
    character_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the preview thumbnail image for a character.
    
    Returns the thumbnail PNG file or generates one if it doesn't exist.
    Note: This endpoint does not require authentication to allow img tags to load images.
    """
    import os
    
    character = await character_service.get_character_by_id(db, character_id)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    
    # Check if thumbnail exists
    if character.thumbnail_path:
        thumbnail_full_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
            "data", character.thumbnail_path
        )
        if os.path.exists(thumbnail_full_path):
            return FileResponse(
                thumbnail_full_path,
                media_type="image/png",
                filename=f"{character.name}_preview.png"
            )
    
    # Generate thumbnail if it doesn't exist
    thumbnail_path = await character_service.generate_thumbnail(db, character_id)
    if thumbnail_path:
        thumbnail_full_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
            "data", thumbnail_path
        )
        if os.path.exists(thumbnail_full_path):
            return FileResponse(
                thumbnail_full_path,
                media_type="image/png",
                filename=f"{character.name}_preview.png"
            )
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No preview available. Upload character parts first.",
    )


@router.get("/{character_id}/parts/{part_name}")
async def get_character_part_image(
    character_id: str,
    part_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the PNG image for a specific character part.
    
    Returns the part's PNG file for use in camera overlay testing.
    Note: This endpoint does not require authentication to allow img tags to load images.
    """
    import os
    
    character = await character_service.get_character_by_id(db, character_id)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    
    # Find the part
    part = None
    for p in character.parts:
        if p.name == part_name:
            part = p
            break
    
    if part is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part '{part_name}' not found in character",
        )
    
    # Get the file path
    part_full_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
        "data", part.file_path
    )
    
    if not os.path.exists(part_full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part image file not found",
        )
    
    return FileResponse(
        part_full_path,
        media_type="image/png",
        filename=f"{part_name}.png"
    )
