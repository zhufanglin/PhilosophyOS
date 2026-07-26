"""Create raw dialogue evidence and reversible claim attribution.

Revision ID: 20260726_0003
Revises: 20260726_0002
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260726_0003"
down_revision: str | None = "20260726_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def string_enum(name: str, values: list[str]) -> sa.Enum:
    """Return the portable enum representation used by the ORM."""

    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def upgrade() -> None:
    """Create original dialogue messages and attributed claim records."""

    op.create_table(
        "dialogue_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            string_enum("dialogue_role", ["user", "assistant"]),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(content)) > 0",
            name=op.f("ck_dialogue_messages_content_not_blank"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dialogue_messages_conversation_created",
        "dialogue_messages",
        ["conversation_id", "created_at"],
    )
    op.create_index(
        op.f("ix_dialogue_messages_conversation_id"),
        "dialogue_messages",
        ["conversation_id"],
    )

    op.create_table(
        "attributed_claims",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("claim_text", sa.Text(), nullable=False),
        sa.Column(
            "subject",
            string_enum(
                "attribution_subject",
                ["user", "third_party", "author", "assistant", "unknown"],
            ),
            nullable=False,
        ),
        sa.Column("subject_name", sa.String(length=200), nullable=True),
        sa.Column(
            "basis",
            string_enum(
                "attribution_basis",
                ["explicit", "role", "uncertain", "correction"],
            ),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("corrected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("correction_message_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(claim_text)) > 0",
            name=op.f("ck_attributed_claims_claim_text_not_blank"),
        ),
        sa.ForeignKeyConstraint(
            ["correction_message_id"],
            ["dialogue_messages.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["dialogue_messages.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_attributed_claims_conversation_subject_active",
        "attributed_claims",
        ["conversation_id", "subject", "is_active"],
    )
    op.create_index(
        op.f("ix_attributed_claims_conversation_id"),
        "attributed_claims",
        ["conversation_id"],
    )


def downgrade() -> None:
    """Remove attributed claims before their dialogue evidence messages."""

    op.drop_table("attributed_claims")
    op.drop_table("dialogue_messages")
