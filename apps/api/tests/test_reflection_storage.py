"""SQLite reflection storage and legacy migration tests."""

from __future__ import annotations

import json
from pathlib import Path

from app.storage.database import create_snapshot_engine, snapshot_database_path
from app.storage.reflection_repository import ReflectionSnapshotRepository


def legacy_record(snapshot_id: str, created_at: str) -> dict[str, object]:
    """Build one minimal legacy snapshot event."""

    return {
        "created_at": created_at,
        "request": {"question": f"Question {snapshot_id}"},
        "response": {
            "snapshot_id": snapshot_id,
            "status": "pending",
            "content": None,
            "provider": "none",
            "provider_model": None,
            "pending_reason": "not configured",
        },
    }


def test_jsonl_migration_is_idempotent_and_preserves_source(tmp_path: Path) -> None:
    """Repeated startup imports each legacy snapshot once and leaves JSONL untouched."""

    source_path = tmp_path / "thought-snapshots.jsonl"
    source_text = "\n".join(
        [
            json.dumps(legacy_record("snap_first", "2026-07-28T08:00:00+00:00")),
            "not valid json",
            json.dumps(legacy_record("snap_second", "2026-07-28T09:00:00+00:00")),
            json.dumps(legacy_record("snap_first", "2026-07-28T08:00:00+00:00")),
        ]
    ) + "\n"
    source_path.write_text(source_text, encoding="utf-8")
    repository = ReflectionSnapshotRepository(create_snapshot_engine(source_path))

    assert repository.import_jsonl(source_path) == 2
    assert repository.import_jsonl(source_path) == 0
    assert [record.snapshot_id for record in repository.list_recent(limit=10)] == [
        "snap_second",
        "snap_first",
    ]
    assert source_path.read_text(encoding="utf-8") == source_text
    assert snapshot_database_path(source_path).exists()
