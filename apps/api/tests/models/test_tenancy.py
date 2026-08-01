"""Tests for the local-compatible user/workspace boundary."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.memory import DialogueSession
from app.models.reflection import ReflectionSnapshotRecord
from app.models.tenancy import (
    LOCAL_USER_ID,
    LOCAL_WORKSPACE_ID,
    User,
    Workspace,
    WorkspaceMembership,
    WorkspaceRole,
)
from app.storage.database import create_snapshot_engine


def test_local_database_seeds_stable_boundary_and_nullable_owner_columns(tmp_path: Path) -> None:
    """A fresh Beta database is usable without login and exposes tenancy columns."""

    engine = create_snapshot_engine(tmp_path / "thought-snapshots.jsonl")

    with Session(engine) as session:
        user = session.get(User, LOCAL_USER_ID)
        workspace = session.get(Workspace, LOCAL_WORKSPACE_ID)
        membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.workspace_id == LOCAL_WORKSPACE_ID,
                WorkspaceMembership.user_id == LOCAL_USER_ID,
            )
        )

    assert user is not None
    assert workspace is not None
    assert workspace.owner_user_id == LOCAL_USER_ID
    assert membership is not None
    assert membership.role == WorkspaceRole.OWNER

    inspector = inspect(engine)
    for table_name in ("reflection_snapshots", "dialogue_sessions", "model_profile_configs"):
        assert {"user_id", "workspace_id"} <= {
            column["name"] for column in inspector.get_columns(table_name)
        }


def test_workspace_membership_is_unique_per_user(tmp_path: Path) -> None:
    """A user cannot be added twice to the same workspace."""

    engine = create_snapshot_engine(tmp_path / "thought-snapshots.jsonl")
    with Session(engine) as session:
        session.add(
            WorkspaceMembership(
                workspace_id=LOCAL_WORKSPACE_ID,
                user_id=LOCAL_USER_ID,
                role=WorkspaceRole.MEMBER,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_legacy_rows_without_tenancy_values_remain_readable(tmp_path: Path) -> None:
    """Nullable owner fields preserve pre-account local records."""

    engine = create_snapshot_engine(tmp_path / "thought-snapshots.jsonl")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO reflection_snapshots
                    (
                        snapshot_id,
                        user_id,
                        workspace_id,
                        created_at,
                        question,
                        request_payload,
                        response_payload
                    )
                VALUES
                    ('legacy', NULL, NULL, '2026-07-31T00:00:00+00:00',
                     'A legacy question', '{}', '{}')
                """
            )
        )
    with Session(engine) as session:
        restored = session.get(ReflectionSnapshotRecord, "legacy")

    assert restored is not None
    assert restored.user_id is None
    assert restored.workspace_id is None


def test_new_dialogue_rows_get_local_boundary_defaults(tmp_path: Path) -> None:
    """New local records receive stable ids without requiring caller changes."""

    engine = create_snapshot_engine(tmp_path / "thought-snapshots.jsonl")
    with Session(engine) as session:
        dialogue = DialogueSession(
            topic="A local topic",
            title="A local topic",
            current_mode="socratic",
            model_profile="free",
        )
        session.add(dialogue)
        session.commit()
        session.refresh(dialogue)

    assert dialogue.user_id == LOCAL_USER_ID
    assert dialogue.workspace_id == LOCAL_WORKSPACE_ID


def test_snapshot_rows_can_be_filtered_by_workspace(tmp_path: Path) -> None:
    """Private records from separate workspaces remain distinguishable."""

    engine = create_snapshot_engine(tmp_path / "thought-snapshots.jsonl")
    other_workspace_id = uuid4()
    with Session(engine) as session:
        session.add_all(
            [
                ReflectionSnapshotRecord(
                    snapshot_id="local",
                    created_at="2026-08-01T00:00:00+00:00",
                    question="Local",
                    request_payload={},
                    response_payload={},
                    workspace_id=LOCAL_WORKSPACE_ID,
                    user_id=LOCAL_USER_ID,
                ),
                ReflectionSnapshotRecord(
                    snapshot_id="other",
                    created_at="2026-08-01T00:00:01+00:00",
                    question="Other",
                    request_payload={},
                    response_payload={},
                    workspace_id=other_workspace_id,
                    user_id=LOCAL_USER_ID,
                ),
            ]
        )
        session.commit()
        local_ids = set(
            session.scalars(
                select(ReflectionSnapshotRecord.snapshot_id).where(
                    ReflectionSnapshotRecord.workspace_id == LOCAL_WORKSPACE_ID
                )
            )
        )

    assert local_ids == {"local"}
