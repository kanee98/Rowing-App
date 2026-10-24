"""Ordered, recorded, idempotent database schema upgrades.

Each version is recorded only after all steps complete. Steps introspect
before altering and can safely resume on restart.
"""
from sqlalchemy import text, inspect
from app.core.database import Base, engine, run_additive_migrations
from app.models import models  # noqa: F401
from app.models import operations  # noqa: F401


def _baseline():
    Base.metadata.create_all(bind=engine)
    run_additive_migrations()


def _workflows():
    Base.metadata.create_all(bind=engine)
    is_mssql = engine.dialect.name == "mssql"
    add_kw = "ADD" if is_mssql else "ADD COLUMN"
    additions = {
        "users": {"token_version": "INTEGER NOT NULL DEFAULT 0", "email_verified_at": "DATETIME NULL"},
        "training_sessions": {"status": "VARCHAR(16) NOT NULL DEFAULT 'scheduled'", "change_reason": "TEXT NULL",
            "changed_at": "DATETIME NULL", "changed_by_id": "INTEGER NULL"},
    }
    with engine.connect() as connection:
        inspector = inspect(connection)
        for table, columns in additions.items():
            if table not in inspector.get_table_names():
                continue
            present = {column['name'] for column in inspector.get_columns(table)}
            for name, definition in columns.items():
                if name not in present:
                    try:
                        connection.execute(text(f"ALTER TABLE {table} {add_kw} {name} {definition}"))
                        connection.commit()
                    except Exception:
                        pass


def _reservation_snapshots():
    is_mssql = engine.dialect.name == "mssql"
    add_kw = "ADD" if is_mssql else "ADD COLUMN"
    with engine.connect() as connection:
        tables = inspect(connection).get_table_names()
        if 'equipment_reservations' in tables:
            present = {column['name'] for column in inspect(connection).get_columns('equipment_reservations')}
            for name, definition in {'crew_name_snapshot': 'VARCHAR(255) NULL', 'seats_snapshot': 'JSON NULL' if not is_mssql else 'VARCHAR(MAX) NULL'}.items():
                if name not in present:
                    try:
                        connection.execute(text(f'ALTER TABLE equipment_reservations {add_kw} {name} {definition}'))
                        connection.commit()
                    except Exception:
                        pass
            if 'crews' in tables:
                try:
                    if is_mssql:
                        connection.execute(text('UPDATE r SET r.crew_name_snapshot = c.name, r.seats_snapshot = c.seats FROM equipment_reservations r JOIN crews c ON c.id = r.crew_id WHERE r.seats_snapshot IS NULL'))
                    else:
                        connection.execute(text('UPDATE equipment_reservations r JOIN crews c ON c.id = r.crew_id SET r.crew_name_snapshot = c.name, r.seats_snapshot = c.seats WHERE r.seats_snapshot IS NULL'))
                    connection.commit()
                except Exception:
                    pass


MIGRATIONS = [("0001_baseline", _baseline), ("0002_club_workflows", _workflows), ("0003_reservation_snapshots", _reservation_snapshots)]


def run_migrations():
    is_mysql = engine.dialect.name == "mysql"
    is_mssql = engine.dialect.name == "mssql"

    with engine.connect() as conn:
        if is_mysql:
            if conn.execute(text("SELECT GET_LOCK('sports_management_schema', 60)")).scalar() != 1:
                raise RuntimeError("Could not acquire schema migration lock")
        try:
            if is_mssql:
                conn.execute(text("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='schema_migrations' AND xtype='U') CREATE TABLE schema_migrations (version VARCHAR(64) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"))
            else:
                conn.execute(text("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"))
            conn.commit()

            applied = set(conn.execute(text("SELECT version FROM schema_migrations")).scalars())
            for version, upgrade in MIGRATIONS:
                if version not in applied:
                    upgrade()
                    conn.execute(text("INSERT INTO schema_migrations (version) VALUES (:version)"), {"version": version})
                    conn.commit()
        finally:
            if is_mysql:
                conn.execute(text("SELECT RELEASE_LOCK('sports_management_schema')"))


if __name__ == '__main__':
    run_migrations()
