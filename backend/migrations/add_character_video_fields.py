"""
Migration script to add character-specific video fields to storyline_characters table.

This migration adds the following columns:
- video_path: Path to the character-specific video file
- video_duration: Duration of the video in seconds
- video_thumbnail: Path to the video thumbnail image
- video_uploaded_at: Timestamp when the video was uploaded

Run this script once to add the new columns to an existing database.
For new installations, the columns will be created automatically.

Usage:
    python -m migrations.add_character_video_fields

Requirements: 5.1 - Database storage for character-video associations
"""
import asyncio
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add character-specific video columns to storyline_characters table."""
    
    print("Starting migration: add_character_video_fields")
    print("=" * 50)
    
    columns_to_add = [
        ("video_path", "VARCHAR(255)"),
        ("video_duration", "FLOAT"),
        ("video_thumbnail", "VARCHAR(255)"),
        ("video_uploaded_at", "DATETIME"),
    ]
    
    async with engine.begin() as conn:
        # First check if the table exists
        try:
            result = await conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='storyline_characters'")
            )
            if not result.fetchone():
                print("Table 'storyline_characters' does not exist yet.")
                print("The columns will be created automatically when the app starts.")
                return
        except Exception as e:
            print(f"Error checking table existence: {e}")
            return
        
        # Add each column
        for column_name, column_type in columns_to_add:
            try:
                await conn.execute(
                    text(f"ALTER TABLE storyline_characters ADD COLUMN {column_name} {column_type}")
                )
                print(f"✓ Added column: {column_name} ({column_type})")
            except Exception as e:
                if "duplicate column name" in str(e).lower():
                    print(f"- Column already exists: {column_name}")
                else:
                    print(f"✗ Error adding {column_name}: {e}")
    
    print("=" * 50)
    print("Migration complete!")
    print("\nNote: Existing records will have NULL values for the new video fields.")


if __name__ == "__main__":
    asyncio.run(migrate())
