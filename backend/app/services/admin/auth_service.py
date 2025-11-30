"""
Authentication service for admin panel.
Handles user authentication, JWT token management, and password hashing.
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.admin.user import User, UserCreate, UserResponse, LoginResponse, TokenPayload

# JWT Configuration
SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "shadow-puppet-admin-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24


class AuthService:
    """Service for handling authentication operations."""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt directly."""
        password_bytes = password.encode('utf-8')
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash using bcrypt directly."""
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )

    @staticmethod
    def create_access_token(user: User) -> str:
        """Create a JWT access token for a user."""
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        payload = {
            "sub": user.id,
            "username": user.username,
            "role": user.role,
            "exp": expire,
        }
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    @staticmethod
    def decode_token(token: str) -> Optional[TokenPayload]:
        """Decode and validate a JWT token."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return TokenPayload(
                sub=payload["sub"],
                username=payload["username"],
                role=payload["role"],
                exp=datetime.fromtimestamp(payload["exp"]),
            )
        except JWTError:
            return None

    async def login(
        self, db: AsyncSession, username: str, password: str
    ) -> Optional[LoginResponse]:
        """
        Authenticate a user and return a login response with JWT token.
        Returns None if credentials are invalid.
        """
        # Find user by username
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()

        if user is None:
            return None

        # Verify password
        if not self.verify_password(password, user.password_hash):
            return None

        # Update last login time
        user.last_login = datetime.utcnow()
        await db.commit()

        # Create token and response
        token = self.create_access_token(user)
        user_response = UserResponse(
            id=user.id,
            username=user.username,
            role=user.role,
            created_at=user.created_at,
            last_login=user.last_login,
        )

        return LoginResponse(token=token, user=user_response)

    async def get_user_by_id(self, db: AsyncSession, user_id: str) -> Optional[User]:
        """Get a user by their ID."""
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_user_by_username(self, db: AsyncSession, username: str) -> Optional[User]:
        """Get a user by their username."""
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def create_user(self, db: AsyncSession, user_data: UserCreate) -> User:
        """Create a new user with hashed password."""
        user = User(
            id=str(uuid.uuid4()),
            username=user_data.username,
            password_hash=self.hash_password(user_data.password),
            role=user_data.role,
            created_at=datetime.utcnow(),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    async def delete_user(self, db: AsyncSession, user_id: str) -> bool:
        """Delete a user by ID. Returns True if deleted, False if not found."""
        user = await self.get_user_by_id(db, user_id)
        if user is None:
            return False
        await db.delete(user)
        await db.commit()
        return True

    async def change_password(
        self, db: AsyncSession, user_id: str, old_password: str, new_password: str
    ) -> bool:
        """
        Change a user's password.
        Returns True if successful, False if old password is incorrect.
        """
        user = await self.get_user_by_id(db, user_id)
        if user is None:
            return False

        # Verify old password
        if not self.verify_password(old_password, user.password_hash):
            return False

        # Update to new password
        user.password_hash = self.hash_password(new_password)
        await db.commit()
        return True

    async def reset_user_password(
        self, db: AsyncSession, user_id: str, new_password: str
    ) -> bool:
        """
        Reset a user's password (admin only, no old password verification).
        Returns True if successful, False if user not found.
        """
        user = await self.get_user_by_id(db, user_id)
        if user is None:
            return False

        # Update to new password without verification
        user.password_hash = self.hash_password(new_password)
        await db.commit()
        return True

    async def get_all_users(self, db: AsyncSession) -> list[User]:
        """Get all users."""
        result = await db.execute(select(User))
        return list(result.scalars().all())

    async def ensure_default_admin(self, db: AsyncSession) -> None:
        """Ensure a default admin user exists."""
        admin = await self.get_user_by_username(db, "admin")
        if admin is None:
            await self.create_user(
                db,
                UserCreate(username="admin", password="admin123", role="admin"),
            )


# Singleton instance
auth_service = AuthService()
