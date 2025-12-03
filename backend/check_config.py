import sqlite3

conn = sqlite3.connect('data/admin.db')
cursor = conn.cursor()

cursor.execute('''
    SELECT name, rest_pose_offset, rotation_offset 
    FROM character_parts 
    WHERE character_id='9b101290-6b10-4cbc-80c4-61c947bcbde0' 
    AND name IN ('left-arm', 'right-arm')
''')

for row in cursor.fetchall():
    print(f'{row[0]}: rest_pose_offset={row[1]}, rotation_offset={row[2]}')

conn.close()
