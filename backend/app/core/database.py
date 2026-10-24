import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

logger = logging.getLogger(__name__)

import ssl
import os
from pathlib import Path
from sqlalchemy.engine import make_url
from sqlalchemy import text

# Normalize DATABASE_URL for SQLAlchemy if needed
db_url = settings.DATABASE_URL
if db_url.startswith("mysql://"):
    db_url = db_url.replace("mysql://", "mysql+pymysql://", 1)
elif db_url.startswith("sqlserver://"):
    db_url = db_url.replace("sqlserver://", "mssql+pymssql://", 1)
elif db_url.startswith("mssql://"):
    db_url = db_url.replace("mssql://", "mssql+pymssql://", 1)

connect_args = {}

if "mysql" in db_url:
    connect_args["connect_timeout"] = 10
    # Remove ?ssl-mode=... query parameters because PyMySQL expects SSL via connect_args
    if "?ssl-mode=" in db_url:
        db_url = db_url.split("?ssl-mode=")[0]
    elif "&ssl-mode=" in db_url:
        db_url = db_url.replace("&ssl-mode=REQUIRED", "")

    # Automatically configure SSL if connecting to Aiven or other cloud MySQL instances
    if "aivencloud.com" in db_url or "ssl" in db_url.lower():
        ca_path = os.environ.get("CA_CERT_PATH") or (Path(__file__).parent.parent.parent / "ca.pem")
        if os.path.exists(ca_path):
            connect_args["ssl"] = {"ca": str(ca_path)}
        else:
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
            connect_args["ssl"] = ssl_ctx
elif "mssql" in db_url:
    if "pymssql" in db_url:
        connect_args["login_timeout"] = 10

def ensure_database_exists(url: str):
    """If target MSSQL database doesn't exist, connect to master and create it automatically"""
    if "mssql" in url:
        try:
            parsed = make_url(url)
            target_db = parsed.database
            if target_db and target_db.lower() not in ("master", "tempdb", "model", "msdb"):
                master_url = parsed.set(database="master")
                temp_engine = create_engine(master_url, isolation_level="AUTOCOMMIT")
                with temp_engine.connect() as conn:
                    result = conn.execute(text(f"SELECT name FROM sys.databases WHERE name = '{target_db}'")).fetchone()
                    if not result:
                        logger.info("MSSQL database '%s' does not exist. Creating it now...", target_db)
                        conn.execute(text(f"CREATE DATABASE [{target_db}]"))
                        logger.info("Database '%s' created successfully.", target_db)
                temp_engine.dispose()
        except Exception as e:
            logger.warning("Could not auto-create MSSQL database (may already exist or insufficient privileges): %s", e)

ensure_database_exists(db_url)

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def run_additive_migrations():
    """Ensure newly added columns exist in SQLite/MySQL/MSSQL without data loss"""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    is_mssql = engine.dialect.name == "mssql"
    add_kw = "ADD" if is_mssql else "ADD COLUMN"
    bool_type = "BIT" if is_mssql else "BOOLEAN"

    with engine.connect() as conn:
        if "clubs" in tables:
            columns = [c["name"] for c in inspector.get_columns("clubs")]
            for column_name in ["benchmark_2k_split_seconds", "gold_2k_split_seconds"]:
                if column_name not in columns:
                    try:
                        conn.execute(text(f"ALTER TABLE clubs {add_kw} {column_name} FLOAT"))
                        conn.commit()
                    except Exception as e:
                        logger.debug("Column %s already present or error: %s", column_name, e)
            if "athlete_join_policy" not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE clubs {add_kw} athlete_join_policy VARCHAR(32) NOT NULL DEFAULT 'approval_required'"))
                    conn.commit()
                except Exception as e:
                    logger.debug("Column athlete_join_policy already present or error: %s", e)

        for table_name in ["equipment", "exercises"]:
            if table_name in tables:
                columns = [c["name"] for c in inspector.get_columns(table_name)]
                if "is_active" not in columns:
                    try:
                        conn.execute(text(f"ALTER TABLE {table_name} {add_kw} is_active {bool_type} NOT NULL DEFAULT 1"))
                        conn.commit()
                    except Exception as e:
                        logger.debug("Column is_active on %s already present or error: %s", table_name, e)

        # Check schedules table
        if "schedules" in tables:
            columns = [c["name"] for c in inspector.get_columns("schedules")]
            if "taxonomy_node_id" not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE schedules {add_kw} taxonomy_node_id INTEGER"))
                    conn.commit()
                except Exception as e:
                    logger.debug("Column taxonomy_node_id already present or error: %s", e)
            if "taxonomy_path_snapshot" not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE schedules {add_kw} taxonomy_path_snapshot VARCHAR(512)"))
                    conn.commit()
                except Exception as e:
                    logger.debug("Column taxonomy_path_snapshot already present or error: %s", e)
            if "taxonomy_node_name" not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE schedules {add_kw} taxonomy_node_name VARCHAR(255)"))
                    conn.commit()
                except Exception as e:
                    logger.debug("Column taxonomy_node_name already present or error: %s", e)

        # Check training_sessions table
        if "training_sessions" in tables:
            columns = [c["name"] for c in inspector.get_columns("training_sessions")]
            if "duration_minutes" not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE training_sessions {add_kw} duration_minutes INTEGER NOT NULL DEFAULT 60"))
                    conn.commit()
                except Exception as e:
                    logger.debug("Column duration_minutes already present or error: %s", e)
            if "taxonomy_node_id" not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE training_sessions {add_kw} taxonomy_node_id INTEGER"))
                    conn.commit()
                except Exception as e:
                    logger.debug("Column taxonomy_node_id already present or error: %s", e)
            if "taxonomy_path_snapshot" not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE training_sessions {add_kw} taxonomy_path_snapshot VARCHAR(512)"))
                    conn.commit()
                except Exception as e:
                    logger.debug("Column taxonomy_path_snapshot already present or error: %s", e)

            # Older demo schedules embedded the weekday in the title. The date is
            # authoritative; keep the title reusable and derive day_of_week from it.
            try:
                rows = conn.execute(text("SELECT id, title, session_date, day_of_week FROM training_sessions")).mappings().all()
                weekday_prefixes = ("Monday: ", "Tuesday: ", "Wednesday: ", "Thursday: ", "Friday: ", "Saturday: ", "Sunday: ")
                for row in rows:
                    title_value = row["title"] or ""
                    clean_title = next((title_value[len(prefix):] for prefix in weekday_prefixes if title_value.startswith(prefix)), title_value)
                    session_date = row["session_date"]
                    parsed_date = session_date if hasattr(session_date, "weekday") else __import__("datetime").datetime.fromisoformat(str(session_date).replace("Z", "+00:00"))
                    if clean_title != title_value or row.get("day_of_week") != parsed_date.weekday():
                        conn.execute(text("UPDATE training_sessions SET title = :title, day_of_week = :day WHERE id = :id"), {"title": clean_title, "day": parsed_date.weekday(), "id": row["id"]})
                conn.commit()
            except Exception as e:
                logger.debug("Session title/day normalization skipped: %s", e)

        # Structured prescription targets make planned-vs-actual analytics
        # possible while retaining the legacy display-text columns.
        if "session_exercises" in tables:
            columns = [c["name"] for c in inspector.get_columns("session_exercises")]
            prescription_columns = {
                "target_reps": "INTEGER",
                "target_distance_m": "INTEGER",
                "target_duration_sec": "INTEGER",
                "target_split_seconds": "FLOAT",
                "target_watts": "FLOAT",
                "target_heart_rate_zone": "VARCHAR(32)",
                "target_rpe": "INTEGER",
                "target_weight_kg": "FLOAT",
            }
            for column_name, column_type in prescription_columns.items():
                if column_name not in columns:
                    try:
                        conn.execute(text(f"ALTER TABLE session_exercises {add_kw} {column_name} {column_type}"))
                        conn.commit()
                    except Exception as e:
                        logger.debug("Column %s already present or error: %s", column_name, e)

        if "performance_entries" in tables:
            columns = [c["name"] for c in inspector.get_columns("performance_entries")]
            performance_columns = {"actual_reps": "INTEGER", "actual_weight_kg": "FLOAT"}
            for column_name, column_type in performance_columns.items():
                if column_name not in columns:
                    try:
                        conn.execute(text(f"ALTER TABLE performance_entries {add_kw} {column_name} {column_type}"))
                        conn.commit()
                    except Exception as e:
                        logger.debug("Column %s already present or error: %s", column_name, e)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
