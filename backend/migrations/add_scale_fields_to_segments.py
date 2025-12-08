"""
Migration to add scale configuration fields to segments table.
Adds scale_mode, scale_start, and scale_end columns.
"""
import sqlite3
import os
import sys
from pathlib import Path

def get_db_path():
    # Logic from backend/app/utils/path.py
    app_name = "RobomonPiying"
    if sys.platform == "win32":
        base_path = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base_path = Path.home() / "Library" / "Application Support"
    else:
        base_path = Path.home() / ".config"
    
    user_data_path = base_path / app_name / "data" / "admin.db"
    
    # Also check local data dir (common in dev)
    local_path = Path("data/admin.db")
    if not user_data_path.exists() and local_path.exists():
        return local_path
        
    return user_data_path

def run_migration():
    db_path = get_db_path()
    print(f"Looking for database at: {db_path}")
    
    if not db_path.exists():
        print("Database not found!")
        # Try to find it relative to this script for backup
        backup_path = Path(__file__).parent.parent.parent / "data" / "admin.db"
        if backup_path.exists():
            db_path = backup_path
            print(f"Found database at backup path: {db_path}")
        else:
            return
    
    print(f"Running migration on {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns exist in segments table
        cursor.execute("PRAGMA table_info(segments)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"Current columns: {columns}")
        
        # Add scale_mode
        if 'scale_mode' not in columns:
            print("Adding scale_mode column to segments...")
            cursor.execute("""
                ALTER TABLE segments 
                ADD COLUMN scale_mode VARCHAR(20) DEFAULT 'auto'
            """)
            print("✓ Added scale_mode")
        else:
            print("scale_mode column already exists")
            
        # Add scale_start
        if 'scale_start' not in columns:
            print("Adding scale_start column to segments...")
            cursor.execute("""
                ALTER TABLE segments 
                ADD COLUMN scale_start REAL DEFAULT 1.0
            """)
            print("✓ Added scale_start")
        else:
            print("scale_start column already exists")
            
        # Add scale_end
        if 'scale_end' not in columns:
            print("Adding scale_end column to segments...")
            cursor.execute("""
                ALTER TABLE segments 
                ADD COLUMN scale_end REAL DEFAULT 1.0
            """)
            print("✓ Added scale_end")
        else:
            print("scale_end column already exists")
        
        conn.commit()
        print("\nMigration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()


