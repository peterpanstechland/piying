"""
Migration to add play_audio field to segment tables.

This field controls whether audio should be played during recording.
"""

import sqlite3
from pathlib import Path

def migrate():
    """Add play_audio column to storyline_segments and character_video_segments tables."""
    
    # Database path - check multiple locations
    db_path = Path(__file__).parent.parent.parent / "data" / "admin.db"
    if not db_path.exists():
        db_path = Path(__file__).parent.parent / "data" / "admin.db"
    
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return False
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    try:
        # Check if column exists in segments table
        cursor.execute("PRAGMA table_info(segments)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'play_audio' not in columns:
            print("Adding play_audio column to segments...")
            cursor.execute("""
                ALTER TABLE segments 
                ADD COLUMN play_audio BOOLEAN DEFAULT 0
            """)
            print("✓ Added play_audio to segments")
        else:
            print("play_audio column already exists in segments")
        
        # Check if column exists in character_video_segments
        cursor.execute("PRAGMA table_info(character_video_segments)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'play_audio' not in columns:
            print("Adding play_audio column to character_video_segments...")
            cursor.execute("""
                ALTER TABLE character_video_segments 
                ADD COLUMN play_audio BOOLEAN DEFAULT 0
            """)
            print("✓ Added play_audio to character_video_segments")
        else:
            print("play_audio column already exists in character_video_segments")
        
        conn.commit()
        print("Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

