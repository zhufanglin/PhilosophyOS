"""Minimal account and workspace boundary models.

These tables are intentionally small: the local Beta still works without login,
while future hosted/team editions get stable user and workspace ids to attach
private data to.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.knowledge import Base, enum_type, utc_now

LOCAL_USER_ID = UUID("00000000-0000-4000-8000-000000000001")
LOCAL_WORKSPACE_ID = UUID("00000000-0000-4000-8000-000000000101")


class WorkspaceRole(StrEnum):
    """Roles available inside one PhilosophyOS workspace."""

    OWNER = "owner"
    MEMBER = "member"


class User(Base):
    """A PhilosophyOS account identity.

    Local Beta uses one deterministic user row; hosted editions can map this to
    OAuth/OIDC subjects or email identities later.
    """

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("length(trim(display_name)) > 0", name="display_name_not_blank"),
        UniqueConstraint("external_subject"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    external_subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    display_name: Mapped[str] = mapped_column(String(120), default="Local User")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    memberships: Mapped[list[WorkspaceMembership]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Workspace(Base):
    """A private boundary for notes, dialogues, snapshots, and model config."""

    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="workspace_name_not_blank"),
        UniqueConstraint("slug"),
        Index("ix_workspaces_owner_user_id", "owner_user_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), default="Local PhilosophyOS")
    slug: Mapped[str] = mapped_column(String(160), default="local")
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    memberships: Mapped[list[WorkspaceMembership]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMembership(Base):
    """A user's role inside one workspace."""

    __tablename__ = "workspace_memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id"),
        Index("ix_workspace_memberships_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        enum_type(WorkspaceRole, "workspace_role"), default=WorkspaceRole.MEMBER
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    workspace: Mapped[Workspace] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")
