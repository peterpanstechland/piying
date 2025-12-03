"""
Migration to add path_waypoints and path_draw_type to character_video_segments table,
and update offset fields to REAL (Float) type.
"""
import sqlite3
from pathlib import Path


def run_migration():
    # Database path
    db_path = Path(__file__).parent.parent.parent / "data" / "admin.db"
    if not db_path.exists():
        db_path = Path(__file__).parent.parent / "data" / "admin.db"
    
    if not db_path.exists():
        print(f"Database not found at {db_path}")
        return
    
    print(f"Running migration on {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if path_waypoints column exists
        cursor.execute("PRAGMA table_info(character_video_segments)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'path_waypoints' not in columns:
            print("Adding path_waypoints column to character_video_segments...")
            cursor.execute("""
                ALTER TABLE character_video_segments 
                ADD COLUMN path_waypoints TEXT DEFAULT NULL
            """)
            print("✓ Added path_waypoints")
        else:
            print("path_waypoints column already exists")
        
        if 'path_draw_type' not in columns:
            print("Adding path_draw_type column to character_video_segments...")
            cursor.execute("""
                ALTER TABLE character_video_segments 
                ADD COLUMN path_draw_type VARCHAR(20) DEFAULT 'linear'
            """)
            print("✓ Added path_draw_type")
        else:
            print("path_draw_type column already exists")
        
        # Note: SQLite doesn't support ALTER COLUMN, so we can't change the type of existing columns
        # The Integer values will be auto-converted to Float by Python when reading
        # For new records, they will be stored as Float
        
        conn.commit()
        print("\nMigration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()

