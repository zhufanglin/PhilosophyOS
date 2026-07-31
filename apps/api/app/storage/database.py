"""SQLite engine helpers for local PhilosophyOS data."""

from __future__ import annotations

from pathlib import Path
from typing import cast

from sqlalchemy import Engine, Table, create_engine

from app.models.knowledge import Base
from app.models.reflection import ReflectionSnapshotRecord


def snapshot_database_path(snapshot_log_path: str | Path) -> Path:
    """Place the SQLite store beside the legacy JSONL snapshot log."""

    return Path(snapshot_log_path).expanduser().with_suffix(".sqlite3")


def create_snapshot_engine(snapshot_log_path: str | Path) -> Engine:
    """Create a SQLite engine and ensure the reflection table exists."""

    database_path = snapshot_database_path(snapshot_log_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite+pysqlite:///{database_path.as_posix()}")
    reflection_table = cast(Table, ReflectionSnapshotRecord.__table__)
    Base.metadata.create_all(engine, tables=[reflection_table])
    return engine
