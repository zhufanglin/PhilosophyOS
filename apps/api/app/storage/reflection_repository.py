"""Repository for durable reflection snapshots and legacy JSONL import."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.models.reflection import ReflectionSnapshotRecord

SnapshotPayload = dict[str, Any]


class ReflectionSnapshotRepository:
    """Persist reflection snapshots without exposing storage details to services."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def add(
        self,
        *,
        created_at: str,
        request_payload: SnapshotPayload,
        response_payload: SnapshotPayload,
    ) -> None:
        """Store one newly generated snapshot record."""

        snapshot_id = str(response_payload["snapshot_id"])
        question = str(request_payload.get("question", "")).strip()
        if not question:
            raise ValueError("Reflection snapshot question must not be blank")

        with Session(self.engine) as session:
            session.add(
                ReflectionSnapshotRecord(
                    snapshot_id=snapshot_id,
                    created_at=created_at,
                    question=question,
                    request_payload=request_payload,
                    response_payload=response_payload,
                )
            )
            session.commit()

    def list_recent(self, *, limit: int) -> list[ReflectionSnapshotRecord]:
        """Return newest records first."""

        statement = (
            select(ReflectionSnapshotRecord)
            .order_by(ReflectionSnapshotRecord.created_at.desc())
            .limit(limit)
        )
        with Session(self.engine) as session:
            return list(session.scalars(statement))

    def update_response(
        self,
        snapshot_id: str,
        update: Callable[[SnapshotPayload], SnapshotPayload],
    ) -> SnapshotPayload | None:
        """Replace the mutable response payload for one snapshot."""

        with Session(self.engine) as session:
            record = session.get(ReflectionSnapshotRecord, snapshot_id)
            if record is None:
                return None
            next_payload = update(dict(record.response_payload))
            record.response_payload = next_payload
            session.commit()
            return next_payload

    def import_jsonl(self, source_path: str | Path) -> int:
        """Import valid legacy records once, keyed by snapshot id."""

        path = Path(source_path).expanduser()
        if not path.exists():
            return 0

        candidates_by_id: dict[str, ReflectionSnapshotRecord] = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
                request_payload = payload["request"]
                response_payload = payload["response"]
                snapshot_id = str(response_payload["snapshot_id"])
                question = str(request_payload.get("question", "")).strip()
                created_at = str(payload["created_at"])
                if not snapshot_id or not question or not created_at:
                    continue
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue
            candidates_by_id[snapshot_id] = ReflectionSnapshotRecord(
                snapshot_id=snapshot_id,
                created_at=created_at,
                question=question,
                request_payload=request_payload,
                response_payload=response_payload,
            )

        candidates = list(candidates_by_id.values())
        if not candidates:
            return 0

        with Session(self.engine) as session:
            candidate_ids = [record.snapshot_id for record in candidates]
            existing_ids = set(
                session.scalars(
                    select(ReflectionSnapshotRecord.snapshot_id).where(
                        ReflectionSnapshotRecord.snapshot_id.in_(candidate_ids)
                    )
                )
            )
            new_records = [
                record for record in candidates if record.snapshot_id not in existing_ids
            ]
            session.add_all(new_records)
            session.commit()
            return len(new_records)
