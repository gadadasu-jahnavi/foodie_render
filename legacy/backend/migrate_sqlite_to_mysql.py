
from pathlib import Path
from getpass import getpass

from sqlalchemy import create_engine, inspect, select, func
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError

from models import db
import models  # Load all Foodie models into SQLAlchemy metadata


BASE_DIR = Path(__file__).resolve().parent
SOURCE_DB = BASE_DIR / "foodie.db"
DATABASE_NAME = "foodie_app_db"

# Copy parent tables before tables that depend on them.
TABLE_ORDER = [
    "admins",
    "customers",
    "sellers",
    "riders",
    "menu_items",
    "orders",
    "order_items",
    "reviews",
    "rider_preferences",
    "offers",
    "notifications",
]


def main():
    if not SOURCE_DB.exists():
        raise FileNotFoundError(
            f"SQLite database not found: {SOURCE_DB}"
        )

    print("\n======================================")
    print(" FOODIE: SQLITE TO MYSQL MIGRATION")
    print("======================================")

    username = input("MySQL username [root]: ").strip() or "root"
    password = getpass("MySQL password (hidden input): ")

    mysql_url = URL.create(
        "mysql+pymysql",
        username=username,
        password=password,
        host="127.0.0.1",
        port=3307,
        database=DATABASE_NAME,
        query={"charset": "utf8mb4"},
    )

    source_engine = create_engine(
        f"sqlite:///{SOURCE_DB.as_posix()}"
    )

    target_engine = create_engine(
        mysql_url,
        pool_pre_ping=True,
    )

    try:
        # 1. Verify the original SQLite database.
        source_tables = set(
            inspect(source_engine).get_table_names()
        )

        missing_tables = set(TABLE_ORDER) - source_tables

        if missing_tables:
            raise RuntimeError(
                f"SQLite is missing tables: {sorted(missing_tables)}"
            )

        # 2. Ensure the destination database is empty.
        existing_tables = set(
            inspect(target_engine).get_table_names()
        )

        if existing_tables:
            raise RuntimeError(
                "STOP: foodie_app_db is not empty.\n"
                f"Existing tables: {sorted(existing_tables)}\n"
                "No migration was performed. Please report this output."
            )

        print("\nSource and destination checks passed.")
        print("Creating MySQL tables...")

        # 3. Create all 11 tables in MySQL.
        db.metadata.create_all(target_engine)

        source_counts = {}
        destination_counts = {}

        # 4. Copy all records in one transaction.
        with source_engine.connect() as source:
            with target_engine.begin() as target:

                for table_name in TABLE_ORDER:
                    table = db.metadata.tables[table_name]

                    rows = [
                        dict(row)
                        for row in source.execute(
                            select(table)
                        ).mappings()
                    ]

                    source_counts[table_name] = len(rows)

                    if rows:
                        target.execute(table.insert(), rows)

                    print(
                        f"Copied {table_name}: {len(rows)} records"
                    )

        # 5. Verify destination record counts.
        print("\n======================================")
        print(" MIGRATION VERIFICATION")
        print("======================================")

        all_match = True

        with target_engine.connect() as target:
            for table_name in TABLE_ORDER:
                table = db.metadata.tables[table_name]

                target_count = target.execute(
                    select(func.count()).select_from(table)
                ).scalar_one()

                destination_counts[table_name] = target_count

                source_count = source_counts[table_name]
                matches = source_count == target_count

                if not matches:
                    all_match = False

                status = "OK" if matches else "MISMATCH"

                print(
                    f"{table_name}: "
                    f"SQLite={source_count}, "
                    f"MySQL={target_count} [{status}]"
                )

        # 6. Final result.
        if not all_match:
            raise RuntimeError(
                "Some record counts do not match. "
                "Do not start the application yet."
            )

        print("\nSUCCESS!")
        print("All 11 tables were copied and verified.")
        print("Your original SQLite database was not modified.")
        print("Your SQLite backup was not modified.")

    finally:
        source_engine.dispose()
        target_engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except (SQLAlchemyError, OSError, RuntimeError, ValueError) as error:
        print(f"\nMIGRATION STOPPED: {error}")
        print("Your original SQLite database remains unchanged.")
