"""Raw dialogue evidence and reversible viewpoint-attribution models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.knowledge import Base, enum_type, utc_now


class DialogueRole(StrEnum):
    """The source role of an immutable dialogue evidence message."""

    USER = "user"
    ASSISTANT = "assistant"


class DialogueSession(Base):
    """A resumable local philosophical dialogue."""

    __tablename__ = "dialogue_sessions"
    __table_args__ = (Index("ix_dialogue_sessions_updated_at", "updated_at"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    topic: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(200))
    current_mode: Mapped[str] = mapped_column(String(40))
    model_profile: Mapped[str] = mapped_column(String(40))
    finished: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    messages: Mapped[list[DialogueSessionMessage]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="DialogueSessionMessage.turn_number, DialogueSessionMessage.created_at",
    )


class DialogueSessionMessage(Base):
    """One ordered message displayed when a dialogue session is resumed."""

    __tablename__ = "dialogue_session_messages"
    __table_args__ = (
        CheckConstraint("length(trim(content)) > 0", name="content_not_blank"),
        UniqueConstraint("conversation_id", "turn_number", "role"),
        Index("ix_dialogue_session_messages_order", "conversation_id", "turn_number"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("dialogue_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[DialogueRole] = mapped_column(
        enum_type(DialogueRole, "dialogue_session_role")
    )
    content: Mapped[str] = mapped_column(Text)
    turn_number: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str | None] = mapped_column(String(40))
    model_profile: Mapped[str | None] = mapped_column(String(40))
    provider: Mapped[str | None] = mapped_column(String(40))
    provider_model: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped[DialogueSession] = relationship(back_populates="messages")


class ModelProfileConfig(Base):
    """Private, local configuration for one selectable model profile."""

    __tablename__ = "model_profile_configs"

    profile: Mapped[str] = mapped_column(String(40), primary_key=True)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str] = mapped_column(String(200))
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_style: Mapped[str] = mapped_column(String(40))
    selected: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


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
