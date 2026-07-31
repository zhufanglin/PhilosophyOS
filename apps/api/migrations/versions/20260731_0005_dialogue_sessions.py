"""Create resumable local dialogue sessions.

Revision ID: 20260731_0005
Revises: 20260731_0004
Create Date: 2026-07-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260731_0005"
down_revision: str | None = "20260731_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def string_enum(name: str, values: list[str]) -> sa.Enum:
    """Return the portable SQLite enum representation."""

    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def upgrade() -> None:
    """Create sessions and their display messages."""

    op.create_table(
        "dialogue_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("current_mode", sa.String(length=40), nullable=False),
        sa.Column("model_profile", sa.String(length=40), nullable=False),
        sa.Column("finished", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dialogue_sessions_updated_at", "dialogue_sessions", ["updated_at"])

    op.create_table(
        "dialogue_session_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            string_enum("dialogue_session_role", ["user", "assistant"]),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("turn_number", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=40), nullable=True),
        sa.Column("model_profile", sa.String(length=40), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("provider_model", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(trim(content)) > 0", name=op.f("ck_dialogue_session_messages_content_not_blank")),
        sa.ForeignKeyConstraint(["conversation_id"], ["dialogue_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "turn_number", "role"),
    )
    op.create_index("ix_dialogue_session_messages_conversation_id", "dialogue_session_messages", ["conversation_id"])
    op.create_index("ix_dialogue_session_messages_order", "dialogue_session_messages", ["conversation_id", "turn_number"])


def downgrade() -> None:
    """Remove sessions and their display messages."""

    op.drop_table("dialogue_session_messages")
    op.drop_table("dialogue_sessions")
