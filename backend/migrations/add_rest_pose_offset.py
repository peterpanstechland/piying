"""
Migration script to add rest_pose_offset column to character_parts table.
"""
import asyncio
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add rest_pose_offset column to character_parts table."""
    
    print("Starting migration: add_rest_pose_offset")
    
    async with engine.begin() as conn:
        # Check if table exists
        try:
            result = await conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='character_parts'")
            )
            if not result.fetchone():
                print("Table 'character_parts' does not exist yet.")
                print("The column will be created automatically when the app starts.")
                return
        except Exception as e:
            print(f"Error checking table: {e}")
            return

        # Add rest_pose_offset column
        try:
            await conn.execute(
                text("ALTER TABLE character_parts ADD COLUMN rest_pose_offset FLOAT")
            )
            print("✓ Added column: rest_pose_offset (FLOAT)")
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                print("Column rest_pose_offset already exists, skipping")
            else:
                print(f"Error adding column: {e}")

    print("Migration completed!")


if __name__ == "__main__":
    asyncio.run(migrate())
