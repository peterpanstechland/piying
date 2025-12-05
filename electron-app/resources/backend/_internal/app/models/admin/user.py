"""
User model for admin authentication.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel

from ...database import Base


class User(Base):
    """SQLAlchemy User model for database storage."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="operator")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# Pydantic models for API validation
class UserCreate(BaseModel):
    """Schema for creating a new user."""
    username: str
    password: str
    role: str = "operator"


class UserResponse(BaseModel):
    """Schema for user response (excludes password)."""
    id: str
    username: str
    role: str
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """Schema for login request."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Schema for login response."""
    token: str
    user: UserResponse


class TokenPayload(BaseModel):
    """Schema for JWT token payload."""
    sub: str  # user_id
    username: str
    role: str
    exp: datetime


class PasswordChangeRequest(BaseModel):
    """Schema for password change request."""
    old_password: str
    new_password: str


class AdminPasswordResetRequest(BaseModel):
    """Schema for admin resetting another user's password."""
    new_password: str
