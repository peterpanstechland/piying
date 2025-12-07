"""
Database configuration and session management for the Admin Panel.
Uses SQLAlchemy with async SQLite for data persistence.
"""
import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from .utils.path import get_user_data_dir

# Database file location
# Store database in user data directory to persist across updates
DATABASE_DIR = get_user_data_dir()
DATABASE_PATH = DATABASE_DIR / "admin.db"
# SQLite URL requires string path
DATABASE_URL = f"sqlite+aiosqlite:///{str(DATABASE_PATH)}"

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging
    future=True,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def init_db() -> None:
    """Initialize the database by creating all tables."""
    # Ensure data directory exists
    os.makedirs(DATABASE_DIR, exist_ok=True)
    
    # Import all models to register them with Base.metadata
    # This ensures all tables are created
    from .models.admin.user import User  # noqa: F401
    from .models.admin.character import CharacterDB, CharacterPartDB, SkeletonBindingDB  # noqa: F401
    from .models.admin.storyline import StorylineDB, SegmentDB, TransitionDB, StorylineCharacterDB  # noqa: F401
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides a database session.
    Yields an async session and ensures proper cleanup.
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def close_db() -> None:
    """Close the database engine and all connections."""
    await engine.dispose()
