"""
Public Characters API
Provides character configuration for frontend rendering
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.admin.character_service import character_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/characters", tags=["Public Characters"])


@router.get("/{character_id}/config.json")
async def get_character_config(
    character_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the complete character configuration for PixiJS renderer.
    
    This is a public endpoint that allows the frontend to load character
    configurations for real-time motion capture rendering.
    
    Returns character config including skeleton, bindings, and render order.
    """
    import json
    from fastapi import status, HTTPException
    from ..services.admin.spritesheet_service import spritesheet_service
    
    character = await character_service.get_character_by_id(db, character_id)
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character with ID '{character_id}' not found",
        )
    
    # Generate config from database
    from pathlib import Path
    
    # Prepare parts data
    parts_data = []
    for p in character.parts:
        joints = []
        if hasattr(p, 'joints') and p.joints:
            try:
                joints = json.loads(p.joints)
            except Exception:
                pass
        
        parts_data.append({
            'name': p.name,
            'file_path': p.file_path,
            'pivot_x': p.pivot_x,
            'pivot_y': p.pivot_y,
            'z_index': p.z_index,
            'joints': joints,
            'editor_x': getattr(p, 'editor_x', None),
            'editor_y': getattr(p, 'editor_y', None),
            'editor_width': getattr(p, 'editor_width', None),
            'editor_height': getattr(p, 'editor_height', None),
            'joint_pivot_x': getattr(p, 'joint_pivot_x', None),
            'joint_pivot_y': getattr(p, 'joint_pivot_y', None),
            'rotation_offset': getattr(p, 'rotation_offset', None),
            'rest_pose_offset': getattr(p, 'rest_pose_offset', None),
        })
    
    # Prepare bindings data
    bindings_data = []
    for b in character.bindings:
        bindings_data.append({
            'part_name': b.part_name,
            'landmarks': json.loads(b.landmarks) if b.landmarks else [],
            'rotation_landmark': b.rotation_landmark,
            'scale_landmarks': json.loads(b.scale_landmarks) if b.scale_landmarks else [],
        })
    
    # Generate config using spritesheet service
    config = spritesheet_service.generate_character_config(
        character_id,
        character.name,
        parts_data,
        bindings_data,
        character.default_facing or "left"
    )
    
    return config


@router.get("/{character_id}/spritesheet.json")
async def get_character_spritesheet_json(
    character_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the character spritesheet JSON metadata.
    
    Returns the spritesheet.json file with frame data.
    """
    from pathlib import Path
    from fastapi.responses import FileResponse
    
    try:
        # Generate spritesheet if needed
        from ..services.admin.spritesheet_service import spritesheet_service
        await spritesheet_service.generate_spritesheet(db, character_id)
        
        # Return spritesheet JSON
        spritesheet_json_path = Path(f"data/characters/{character_id}/spritesheet.json")
        
        if not spritesheet_json_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Spritesheet JSON not found for character: {character_id}"
            )
        
        return FileResponse(
            path=str(spritesheet_json_path),
            media_type="application/json",
            headers={
                "Cache-Control": "public, max-age=3600",
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading spritesheet JSON: {character_id}, error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load spritesheet JSON: {str(e)}"
        )


@router.get("/{character_id}/spritesheet.png")
async def get_character_spritesheet(
    character_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the character spritesheet image.
    
    Returns the PNG spritesheet for the character.
    """
    from fastapi.responses import FileResponse
    from pathlib import Path
    
    try:
        # Get character to find spritesheet path
        character = await character_service.get_character(db, character_id)
        if not character:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Character not found: {character_id}"
            )
        
        # Construct spritesheet path
        spritesheet_path = Path(f"data/characters/{character_id}/spritesheet.png")
        
        if not spritesheet_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Spritesheet not found for character: {character_id}"
            )
        
        return FileResponse(
            path=str(spritesheet_path),
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading spritesheet: {character_id}, error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load spritesheet: {str(e)}"
        )


@router.get("/{character_id}/thumbnail.png")
async def get_character_thumbnail(
    character_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the character thumbnail image.
    
    This is a public endpoint that allows the frontend to load character
    thumbnails for display in character selection UI.
    
    Returns the PNG thumbnail for the character.
    """
    from fastapi.responses import FileResponse
    from pathlib import Path
    import os
    
    try:
        # Get character to verify it exists
        character = await character_service.get_character_by_id(db, character_id)
        if not character:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Character not found: {character_id}"
            )
        
        # Construct thumbnail path
        thumbnail_path = Path(f"data/characters/{character_id}/thumbnail.png")
        
        # If thumbnail exists, return it
        if thumbnail_path.exists():
            return FileResponse(
                path=str(thumbnail_path),
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=3600",
                }
            )
        
        # Try to generate thumbnail if it doesn't exist
        generated_path = await character_service.generate_thumbnail(db, character_id)
        if generated_path:
            full_path = Path(f"data/{generated_path}")
            if full_path.exists():
                return FileResponse(
                    path=str(full_path),
                    media_type="image/png",
                    headers={
                        "Cache-Control": "public, max-age=3600",
                    }
                )
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Thumbnail not found for character: {character_id}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading thumbnail: {character_id}, error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load thumbnail: {str(e)}"
        )