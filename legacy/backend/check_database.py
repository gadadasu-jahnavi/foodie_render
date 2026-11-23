
import sqlite3

db_path = "foodie.db"

connection = sqlite3.connect(db_path)
cursor = connection.cursor()

tables = cursor.execute("""
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
""").fetchall()

print("\nFOODIE DATABASE TABLES AND RECORD COUNTS\n")

for table in tables:
    table_name = table[0]
    count = cursor.execute(
        f'SELECT COUNT(*) FROM "{table_name}"'
    ).fetchone()[0]

    print(f"{table_name}: {count}")

connection.close()
