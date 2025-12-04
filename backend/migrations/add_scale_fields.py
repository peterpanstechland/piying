"""
Migration script to add scale configuration fields to character_video_segments table.

Scale Mode:
- 'auto': MediaPipe automatically detects body size and adjusts scale
- 'manual': User controls scale via scale_start and scale_end values

Run this script to add scale_mode, scale_start, and scale_end columns.
"""
import sqlite3
import os

def migrate():
    # Get database path - data folder is in project root, not backend folder
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data', 'admin.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return False
    
    print(f"Migrating database at {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(character_video_segments)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Add scale_mode column if not exists
        if 'scale_mode' not in columns:
            print("Adding scale_mode column...")
            cursor.execute("""
                ALTER TABLE character_video_segments 
                ADD COLUMN scale_mode VARCHAR(20) DEFAULT 'auto'
            """)
            print("✓ Added scale_mode column")
        else:
            print("scale_mode column already exists")
        
        # Add scale_start column if not exists
        if 'scale_start' not in columns:
            print("Adding scale_start column...")
            cursor.execute("""
                ALTER TABLE character_video_segments 
                ADD COLUMN scale_start FLOAT DEFAULT 1.0
            """)
            print("✓ Added scale_start column")
        else:
            print("scale_start column already exists")
        
        # Add scale_end column if not exists
        if 'scale_end' not in columns:
            print("Adding scale_end column...")
            cursor.execute("""
                ALTER TABLE character_video_segments 
                ADD COLUMN scale_end FLOAT DEFAULT 1.0
            """)
            print("✓ Added scale_end column")
        else:
            print("scale_end column already exists")
        
        conn.commit()
        print("\n✓ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

