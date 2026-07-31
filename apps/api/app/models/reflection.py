"""Durable local reflection snapshot records."""

from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, CheckConstraint, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.knowledge import Base


class ReflectionSnapshotRecord(Base):
    """One immutable request with a user-correctable snapshot response."""

    __tablename__ = "reflection_snapshots"
    __table_args__ = (
        CheckConstraint("length(trim(question)) > 0", name="question_not_blank"),
        Index("ix_reflection_snapshots_created_at", "created_at"),
    )

    snapshot_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(64))
    question: Mapped[str] = mapped_column(Text)
    request_payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    response_payload: Mapped[dict[str, Any]] = mapped_column(JSON)
