"""Create durable local reflection snapshots.

Revision ID: 20260731_0004
Revises: 20260726_0003
Create Date: 2026-07-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260731_0004"
down_revision: str | None = "20260726_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the reflection snapshot record table."""

    op.create_table(
        "reflection_snapshots",
        sa.Column("snapshot_id", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("request_payload", sa.JSON(), nullable=False),
        sa.Column("response_payload", sa.JSON(), nullable=False),
        sa.CheckConstraint(
            "length(trim(question)) > 0",
            name=op.f("ck_reflection_snapshots_question_not_blank"),
        ),
        sa.PrimaryKeyConstraint("snapshot_id"),
    )
    op.create_index(
        "ix_reflection_snapshots_created_at",
        "reflection_snapshots",
        ["created_at"],
    )


def downgrade() -> None:
    """Remove durable reflection snapshots."""

    op.drop_table("reflection_snapshots")
