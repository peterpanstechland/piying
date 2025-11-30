"""
User management API endpoints for admin panel.
Handles user CRUD operations with role-based access control.
"""
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models.admin import UserCreate, UserResponse, TokenPayload, PasswordChangeRequest, AdminPasswordResetRequest
from ...services.admin.auth_service import auth_service
from .auth import get_current_user, require_admin

router = APIRouter(prefix="/api/admin/users", tags=["Admin User Management"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: Annotated[TokenPayload, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """
    Create a new user (admin only).
    
    - **username**: Unique username for the new user
    - **password**: Password for the new user
    - **role**: User role ("admin" or "operator")
    
    Only administrators can create new users.
    """
    # Check if username already exists
    existing_user = await auth_service.get_user_by_username(db, user_data.username)
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{user_data.username}' already exists",
        )
    
    # Validate role
    if user_data.role not in ("admin", "operator"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'admin' or 'operator'",
        )
    
    # Create the user
    user = await auth_service.create_user(db, user_data)
    
    return UserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.get("", response_model=List[UserResponse])
async def list_users(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[UserResponse]:
    """
    List all users.
    
    Returns a list of all users in the system.
    Any authenticated user can view the user list.
    """
    users = await auth_service.get_all_users(db)
    
    return [
        UserResponse(
            id=user.id,
            username=user.username,
            role=user.role,
            created_at=user.created_at,
            last_login=user.last_login,
        )
        for user in users
    ]


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: str,
    current_user: Annotated[TokenPayload, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Delete a user by ID (admin only).
    
    - **user_id**: UUID of the user to delete
    
    Only administrators can delete users.
    Users cannot delete themselves.
    """
    # Prevent self-deletion
    if user_id == current_user.sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )
    
    # Check if user exists
    user = await auth_service.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{user_id}' not found",
        )
    
    # Delete the user
    deleted = await auth_service.delete_user(db, user_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user",
        )
    
    return {"message": f"User '{user.username}' deleted successfully", "user_id": user_id}


@router.put("/me/password", status_code=status.HTTP_200_OK)
async def change_own_password(
    password_data: PasswordChangeRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Change the current user's password.
    
    - **old_password**: Current password for verification
    - **new_password**: New password to set
    
    Any authenticated user can change their own password.
    """
    # Validate new password length
    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long",
        )
    
    # Change password
    success = await auth_service.change_password(
        db, current_user.sub, password_data.old_password, password_data.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    
    return {"message": "Password changed successfully"}


@router.put("/{user_id}/password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: str,
    password_data: AdminPasswordResetRequest,
    current_user: Annotated[TokenPayload, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Reset another user's password (admin only).
    
    - **user_id**: UUID of the user whose password to reset
    - **new_password**: New password to set
    
    Only administrators can reset other users' passwords.
    This does not require the old password.
    """
    # Validate new password length
    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long",
        )
    
    # Check if user exists
    user = await auth_service.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{user_id}' not found",
        )
    
    # Reset password
    success = await auth_service.reset_user_password(db, user_id, password_data.new_password)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password",
        )
    
    return {"message": f"Password reset successfully for user '{user.username}'"}
