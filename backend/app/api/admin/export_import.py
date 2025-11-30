"""
Export/Import API endpoints for admin panel.
Handles configuration export to ZIP file and import with validation.
"""
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from pydantic import BaseModel

from ...database import get_db
from ...models.admin import TokenPayload
from ...services.admin.export_import_service import export_import_service
from .auth import get_current_user, require_admin

router = APIRouter(prefix="/api/admin", tags=["Admin Export/Import"])


# ============================================================================
# Response Models
# ============================================================================

class ExportResponse(BaseModel):
    """Response model for export endpoint."""
    success: bool
    filename: str
    download_url: str
    message: str


class ImportPreviewItem(BaseModel):
    """Preview item for import."""
    id: str
    name: str


class ImportPreviewResponse(BaseModel):
    """Response model for import preview."""
    valid: bool
    error: Optional[str] = None
    characters: List[ImportPreviewItem] = []
    storylines: List[ImportPreviewItem] = []
    settings: bool = False


class ImportResponse(BaseModel):
    """Response model for import endpoint."""
    success: bool
    message: str
    characters_imported: int = 0
    characters_skipped: int = 0
    storylines_imported: int = 0
    storylines_skipped: int = 0
    settings_imported: bool = False


# ============================================================================
# Export Endpoints (Task 14.2)
# ============================================================================

@router.post("/export", response_model=ExportResponse)
async def export_configuration(
    current_user: Annotated[TokenPayload, Depends(require_admin)],
    db=Depends(get_db),
) -> ExportResponse:
    """
    Export all configuration to a ZIP file.
    
    Creates a ZIP file containing:
    - All character data (metadata + PNG files)
    - All storyline configurations (metadata + video files)
    - System settings (excluding S3 credentials for security)
    
    Returns a download URL for the export file.
    
    Requirements: 11.1, 11.4
    """
    try:
        zip_content, filename = await export_import_service.export_configuration(db)
        
        # Save the export file
        export_path = export_import_service.save_export_file(zip_content, filename)
        
        # Generate download URL
        download_url = f"/api/admin/export/download/{filename}"
        
        return ExportResponse(
            success=True,
            filename=filename,
            download_url=download_url,
            message="Configuration exported successfully"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Export failed: {str(e)}"
        )


@router.get("/export/download/{filename}")
async def download_export(
    filename: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> Response:
    """
    Download an export file.
    
    Returns the ZIP file for download.
    
    Requirements: 11.4
    """
    # Validate filename to prevent path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename"
        )
    
    zip_content = export_import_service.get_export_file(filename)
    
    if zip_content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export file not found or expired"
        )
    
    return Response(
        content=zip_content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


# ============================================================================
# Import Endpoints (Task 14.2)
# ============================================================================

@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_import(
    current_user: Annotated[TokenPayload, Depends(require_admin)],
    file: UploadFile = File(..., description="ZIP file to import"),
) -> ImportPreviewResponse:
    """
    Preview what will be imported from a backup file.
    
    Validates the backup file and returns a list of items that will be imported.
    Use this before the actual import to show a confirmation dialog.
    
    Requirements: 11.2, 11.3
    """
    # Read file content
    content = await file.read()
    
    # Validate and get preview
    is_valid, error, preview = export_import_service.get_import_preview(content)
    
    if not is_valid:
        return ImportPreviewResponse(
            valid=False,
            error=error,
        )
    
    return ImportPreviewResponse(
        valid=True,
        characters=[
            ImportPreviewItem(id=c["id"], name=c["name"])
            for c in preview.get("characters", [])
        ],
        storylines=[
            ImportPreviewItem(id=s["id"], name=s["name"])
            for s in preview.get("storylines", [])
        ],
        settings=preview.get("settings", False),
    )


@router.post("/import", response_model=ImportResponse)
async def import_configuration(
    current_user: Annotated[TokenPayload, Depends(require_admin)],
    file: UploadFile = File(..., description="ZIP file to import"),
    overwrite: bool = False,
    db=Depends(get_db),
) -> ImportResponse:
    """
    Import configuration from a backup ZIP file.
    
    Restores:
    - Character data (metadata + PNG files)
    - Storyline configurations (metadata + video files)
    - System settings
    
    Parameters:
    - **file**: The backup ZIP file to import
    - **overwrite**: If True, existing items with the same ID will be replaced.
                     If False, existing items will be skipped.
    
    Requirements: 11.2, 11.3
    """
    # Read file content
    content = await file.read()
    
    # Perform import
    success, error, stats = await export_import_service.import_configuration(
        db, content, overwrite=overwrite
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # Build message
    imported_items = []
    if stats["characters_imported"] > 0:
        imported_items.append(f"{stats['characters_imported']} characters")
    if stats["storylines_imported"] > 0:
        imported_items.append(f"{stats['storylines_imported']} storylines")
    if stats["settings_imported"]:
        imported_items.append("settings")
    
    skipped_items = []
    if stats["characters_skipped"] > 0:
        skipped_items.append(f"{stats['characters_skipped']} characters")
    if stats["storylines_skipped"] > 0:
        skipped_items.append(f"{stats['storylines_skipped']} storylines")
    
    message_parts = []
    if imported_items:
        message_parts.append(f"Imported: {', '.join(imported_items)}")
    if skipped_items:
        message_parts.append(f"Skipped (already exist): {', '.join(skipped_items)}")
    
    message = ". ".join(message_parts) if message_parts else "No items imported"
    
    return ImportResponse(
        success=True,
        message=message,
        characters_imported=stats["characters_imported"],
        characters_skipped=stats["characters_skipped"],
        storylines_imported=stats["storylines_imported"],
        storylines_skipped=stats["storylines_skipped"],
        settings_imported=stats["settings_imported"],
    )
