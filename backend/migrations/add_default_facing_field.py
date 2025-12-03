"""
Migration script to add default_facing field to characters table.

Run this script once to add the new column to an existing database.

Usage:
    python -m migrations.add_default_facing_field
"""
import asyncio
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add default_facing column to characters table."""
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(text("PRAGMA table_info(characters)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'default_facing' not in columns:
            print("Adding default_facing column to characters table...")
            await conn.execute(text(
                "ALTER TABLE characters ADD COLUMN default_facing VARCHAR(10) DEFAULT 'left'"
            ))
            print("✓ default_facing column added successfully")
        else:
            print("✓ default_facing column already exists")


if __name__ == "__main__":
    asyncio.run(migrate())
