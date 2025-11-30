"""
Authentication API endpoints for admin panel.
Handles login, logout, and current user retrieval.
"""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models.admin import LoginRequest, LoginResponse, UserResponse, TokenPayload
from ...services.admin.auth_service import auth_service

router = APIRouter(prefix="/api/admin/auth", tags=["Admin Authentication"])

# Security scheme for JWT Bearer token
security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPayload:
    """
    Dependency to get the current authenticated user from JWT token.
    Validates token and checks for session expiration (24 hours).
    """
    token = credentials.credentials
    payload = auth_service.decode_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if token has expired (24 hour session expiration)
    if payload.exp < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify user still exists in database
    user = await auth_service.get_user_by_id(db, payload.sub)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return payload


async def require_admin(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> TokenPayload:
    """
    Dependency to require admin role for an endpoint.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin role required.",
        )
    return current_user


@router.post("/login", response_model=LoginResponse)
async def login(
    login_data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    """
    Authenticate user and return JWT token.
    
    - **username**: User's username
    - **password**: User's password
    
    Returns a JWT token valid for 24 hours and user information.
    """
    result = await auth_service.login(db, login_data.username, login_data.password)
    
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return result


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict:
    """
    Logout the current user.
    
    Note: Since we use stateless JWT tokens, logout is handled client-side
    by removing the token. This endpoint exists for API completeness and
    can be extended to implement token blacklisting if needed.
    """
    return {"message": "Successfully logged out", "username": current_user.username}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """
    Get current authenticated user information.
    
    Returns the user's profile information excluding password.
    """
    user = await auth_service.get_user_by_id(db, current_user.sub)
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    return UserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        created_at=user.created_at,
        last_login=user.last_login,
    )
