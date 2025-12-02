"""
Migration script to add 'enabled' column to storylines table.
Run this script once to update existing database.

Usage:
    python backend/add_enabled_column.py
"""
import sqlite3
import os

# Database path - project root/data/admin.db
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
DB_PATH = os.path.join(PROJECT_ROOT, "data", "admin.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        print("The column will be created automatically when the app starts.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(storylines)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'enabled' in columns:
            print("Column 'enabled' already exists in storylines table.")
            return
        
        # Add the column
        cursor.execute("ALTER TABLE storylines ADD COLUMN enabled INTEGER DEFAULT 0")
        conn.commit()
        print("Successfully added 'enabled' column to storylines table.")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
