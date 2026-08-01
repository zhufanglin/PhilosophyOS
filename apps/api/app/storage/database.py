"""SQLite engine helpers for local PhilosophyOS data."""

from __future__ import annotations

from pathlib import Path
from typing import cast

from uuid import uuid4

from sqlalchemy import Engine, Table, create_engine, inspect, text

from app.models.knowledge import Base, utc_now
from app.models.memory import DialogueSession, DialogueSessionMessage, ModelProfileConfig
from app.models.reflection import ReflectionSnapshotRecord
from app.models.tenancy import (
    LOCAL_USER_ID,
    LOCAL_WORKSPACE_ID,
    User,
    Workspace,
    WorkspaceMembership,
    WorkspaceRole,
)


def snapshot_database_path(snapshot_log_path: str | Path) -> Path:
    """Place the SQLite store beside the legacy JSONL snapshot log."""

    return Path(snapshot_log_path).expanduser().with_suffix(".sqlite3")


def create_snapshot_engine(snapshot_log_path: str | Path) -> Engine:
    """Create a SQLite engine and ensure the reflection table exists."""

    database_path = snapshot_database_path(snapshot_log_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite+pysqlite:///{database_path.as_posix()}")
    local_tables = [
        cast(Table, User.__table__),
        cast(Table, Workspace.__table__),
        cast(Table, WorkspaceMembership.__table__),
        cast(Table, ReflectionSnapshotRecord.__table__),
        cast(Table, DialogueSession.__table__),
        cast(Table, DialogueSessionMessage.__table__),
        cast(Table, ModelProfileConfig.__table__),
    ]
    Base.metadata.create_all(engine, tables=local_tables)
    ensure_local_tenancy_schema(engine)
    return engine


def ensure_local_tenancy_schema(engine: Engine) -> None:
    """Backfill local tenancy columns and seed the default local boundary.

    The single-machine Beta creates SQLite databases with ``create_all`` rather
    than Alembic, so existing user databases need a tiny in-place migration here.
    All added columns are nullable to preserve old data and avoid making login a
    prerequisite for local use.
    """

    inspector = inspect(engine)
    local_table_names = set(inspector.get_table_names())
    tenancy_columns = {
        "reflection_snapshots": ("user_id", "workspace_id"),
        "dialogue_sessions": ("user_id", "workspace_id"),
        "model_profile_configs": ("user_id", "workspace_id"),
    }

    with engine.begin() as connection:
        for table_name, column_names in tenancy_columns.items():
            if table_name not in local_table_names:
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name in column_names:
                if column_name not in existing_columns:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} CHAR(32)")
                    )
                connection.execute(
                    text(
                        f"CREATE INDEX IF NOT EXISTS ix_{table_name}_{column_name} "
                        f"ON {table_name} ({column_name})"
                    )
                )

        now = utc_now()
        connection.execute(
            text(
                """
                INSERT OR IGNORE INTO users
                    (id, external_subject, email, display_name, created_at, updated_at)
                VALUES
                    (:id, :external_subject, NULL, :display_name, :created_at, :updated_at)
                """
            ),
            {
                "id": LOCAL_USER_ID.hex,
                "external_subject": "local",
                "display_name": "Local User",
                "created_at": now,
                "updated_at": now,
            },
        )
        connection.execute(
            text(
                """
                INSERT OR IGNORE INTO workspaces
                    (id, name, slug, owner_user_id, created_at, updated_at)
                VALUES
                    (:id, :name, :slug, :owner_user_id, :created_at, :updated_at)
                """
            ),
            {
                "id": LOCAL_WORKSPACE_ID.hex,
                "name": "Local PhilosophyOS",
                "slug": "local",
                "owner_user_id": LOCAL_USER_ID.hex,
                "created_at": now,
                "updated_at": now,
            },
        )
        connection.execute(
            text(
                """
                INSERT OR IGNORE INTO workspace_memberships
                    (id, workspace_id, user_id, role, created_at)
                VALUES
                    (:id, :workspace_id, :user_id, :role, :created_at)
                """
            ),
            {
                "id": uuid4().hex,
                "workspace_id": LOCAL_WORKSPACE_ID.hex,
                "user_id": LOCAL_USER_ID.hex,
                "role": WorkspaceRole.OWNER.value,
                "created_at": now,
            },
        )
