"""
Migration script to add path_waypoints and path_draw_type columns to segments table.
Run this script once to update the database schema.

Usage:
    python migrate_add_path_columns.py
"""
import sqlite3
import os

# Database path
DATABASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DATABASE_PATH = os.path.join(DATABASE_DIR, "admin.db")

def migrate():
    """Add missing columns to segments table."""
    if not os.path.exists(DATABASE_PATH):
        print(f"Database not found at {DATABASE_PATH}")
        return False
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check existing columns
        cursor.execute("PRAGMA table_info(segments)")
        columns = {row[1] for row in cursor.fetchall()}
        print(f"Existing columns in segments: {columns}")
        
        # Add path_waypoints column if missing
        if 'path_waypoints' not in columns:
            print("Adding path_waypoints column...")
            cursor.execute("ALTER TABLE segments ADD COLUMN path_waypoints TEXT DEFAULT NULL")
            print("✓ Added path_waypoints column")
        else:
            print("✓ path_waypoints column already exists")
        
        # Add path_draw_type column if missing
        if 'path_draw_type' not in columns:
            print("Adding path_draw_type column...")
            cursor.execute("ALTER TABLE segments ADD COLUMN path_draw_type VARCHAR(20) DEFAULT 'linear'")
            print("✓ Added path_draw_type column")
        else:
            print("✓ path_draw_type column already exists")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
