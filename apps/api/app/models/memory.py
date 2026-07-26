"""Raw dialogue evidence and reversible viewpoint-attribution models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.knowledge import Base, enum_type, utc_now


class DialogueRole(StrEnum):
    """The source role of an immutable dialogue evidence message."""

    USER = "user"
    ASSISTANT = "assistant"


class AttributionSubject(StrEnum):
    """Who owns the proposition expressed in one attributed claim."""

    USER = "user"
    THIRD_PARTY = "third_party"
    AUTHOR = "author"
    ASSISTANT = "assistant"
    UNKNOWN = "unknown"


class AttributionBasis(StrEnum):
    """Why the attribution was assigned."""

    EXPLICIT = "explicit"
    ROLE = "role"
    UNCERTAIN = "uncertain"
    CORRECTION = "correction"


class DialogueMessage(Base):
    """Original user or assistant text retained as attribution evidence."""

    __tablename__ = "dialogue_messages"
    __table_args__ = (
        CheckConstraint("length(trim(content)) > 0", name="content_not_blank"),
        Index("ix_dialogue_messages_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(index=True)
    role: Mapped[DialogueRole] = mapped_column(enum_type(DialogueRole, "dialogue_role"))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    claims: Mapped[list[AttributedClaim]] = relationship(
        back_populates="evidence_message",
        foreign_keys="AttributedClaim.message_id",
        cascade="all, delete-orphan",
    )


class AttributedClaim(Base):
    """One proposition linked to its original message and current subject."""

    __tablename__ = "attributed_claims"
    __table_args__ = (
        CheckConstraint("length(trim(claim_text)) > 0", name="claim_text_not_blank"),
        Index(
            "ix_attributed_claims_conversation_subject_active",
            "conversation_id",
            "subject",
            "is_active",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(index=True)
    message_id: Mapped[UUID] = mapped_column(ForeignKey("dialogue_messages.id", ondelete="CASCADE"))
    claim_text: Mapped[str] = mapped_column(Text)
    subject: Mapped[AttributionSubject] = mapped_column(
        enum_type(AttributionSubject, "attribution_subject")
    )
    subject_name: Mapped[str | None] = mapped_column(String(200))
    basis: Mapped[AttributionBasis] = mapped_column(
        enum_type(AttributionBasis, "attribution_basis")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correction_message_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("dialogue_messages.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    evidence_message: Mapped[DialogueMessage] = relationship(
        back_populates="claims", foreign_keys=[message_id]
    )
    correction_message: Mapped[DialogueMessage | None] = relationship(
        foreign_keys=[correction_message_id]
    )
