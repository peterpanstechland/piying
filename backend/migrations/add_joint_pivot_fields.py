"""
Migration script to add joint_pivot and rotation_offset fields to character_parts table.

Run this script once to add the new columns to an existing database.
For new installations, the columns will be created automatically.

Usage:
    python -m migrations.add_joint_pivot_fields
"""
import asyncio
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add new columns to character_parts table."""
    
    columns_to_add = [
        ("joint_pivot_x", "FLOAT"),
        ("joint_pivot_y", "FLOAT"),
        ("rotation_offset", "FLOAT"),
    ]
    
    async with engine.begin() as conn:
        for column_name, column_type in columns_to_add:
            try:
                await conn.execute(
                    text(f"ALTER TABLE character_parts ADD COLUMN {column_name} {column_type}")
                )
                print(f"✓ Added column: {column_name}")
            except Exception as e:
                if "duplicate column name" in str(e).lower():
                    print(f"- Column already exists: {column_name}")
                else:
                    print(f"✗ Error adding {column_name}: {e}")
    
    print("\nMigration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
