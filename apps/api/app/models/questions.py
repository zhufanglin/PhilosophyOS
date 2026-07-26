"""Reviewed daily-question bank and local selection history models."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.knowledge import Base, ReviewStatus, enum_type


def utc_now() -> datetime:
    """Return a timezone-aware timestamp for question records."""

    return datetime.now(UTC)


class QuestionDifficulty(StrEnum):
    """Editorial difficulty shown to learners."""

    BEGINNER = "入门"
    ADVANCED = "进阶"


class QuestionInteractionAction(StrEnum):
    """User actions that exclude a question from the recent window."""

    PRESENTED = "presented"
    SKIPPED = "skipped"
    COMPLETED = "completed"


class DailyQuestion(Base):
    """One reviewed philosophical prompt in the fallback question bank."""

    __tablename__ = "daily_questions"
    __table_args__ = (
        CheckConstraint("length(trim(question)) > 0", name="question_not_blank"),
        Index("ix_daily_questions_domain_difficulty", "domain", "difficulty"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    seed_id: Mapped[str] = mapped_column(String(20), unique=True)
    domain: Mapped[str] = mapped_column(String(80))
    era: Mapped[str] = mapped_column(String(80))
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        enum_type(QuestionDifficulty, "question_difficulty")
    )
    question: Mapped[str] = mapped_column(Text, unique=True)
    core_tension: Mapped[str] = mapped_column(String(200))
    philosopher_refs: Mapped[list[str]] = mapped_column(JSON, default=list)
    followup_strategy: Mapped[str] = mapped_column(String(80))
    review_status: Mapped[ReviewStatus] = mapped_column(
        enum_type(ReviewStatus, "question_review_status"), default=ReviewStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    interactions: Mapped[list[QuestionInteraction]] = relationship(
        back_populates="question_record", cascade="all, delete-orphan"
    )


class QuestionInteraction(Base):
    """A local user's presented, skipped, or completed question event."""

    __tablename__ = "question_interactions"
    __table_args__ = (
        CheckConstraint("length(trim(user_key)) > 0", name="user_key_not_blank"),
        Index(
            "ix_question_interactions_user_occurred",
            "user_key",
            "occurred_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_key: Mapped[str] = mapped_column(String(100))
    question_id: Mapped[UUID] = mapped_column(ForeignKey("daily_questions.id", ondelete="CASCADE"))
    action: Mapped[QuestionInteractionAction] = mapped_column(
        enum_type(QuestionInteractionAction, "question_interaction_action")
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    question_record: Mapped[DailyQuestion] = relationship(back_populates="interactions")
