"""
Migration script to add editor position columns to character_parts table.
Run this script once to update the database schema.
"""
import sqlite3
import os

DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "admin.db")

def migrate():
    """Add editor position columns to character_parts table."""
    if not os.path.exists(DATABASE_PATH):
        print(f"Database not found at {DATABASE_PATH}")
        print("The columns will be created automatically when the app starts.")
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Check existing columns
    cursor.execute("PRAGMA table_info(character_parts)")
    columns = {row[1] for row in cursor.fetchall()}
    
    new_columns = [
        ("editor_x", "REAL"),
        ("editor_y", "REAL"),
        ("editor_width", "REAL"),
        ("editor_height", "REAL"),
    ]
    
    for col_name, col_type in new_columns:
        if col_name not in columns:
            try:
                cursor.execute(f"ALTER TABLE character_parts ADD COLUMN {col_name} {col_type}")
                print(f"Added column: {col_name}")
            except sqlite3.OperationalError as e:
                print(f"Column {col_name} might already exist: {e}")
        else:
            print(f"Column {col_name} already exists")
    
    conn.commit()
    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
