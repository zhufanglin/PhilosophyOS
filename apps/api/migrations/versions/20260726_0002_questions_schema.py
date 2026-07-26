"""Create the reviewed daily-question bank and selection history.

Revision ID: 20260726_0002
Revises: 20260726_0001
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260726_0002"
down_revision: str | None = "20260726_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def string_enum(name: str, values: list[str]) -> sa.Enum:
    """Return the portable enum representation used by the ORM."""

    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def upgrade() -> None:
    """Create reviewed questions and local interaction history."""

    op.create_table(
        "daily_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("seed_id", sa.String(length=20), nullable=False),
        sa.Column("domain", sa.String(length=80), nullable=False),
        sa.Column("era", sa.String(length=80), nullable=False),
        sa.Column(
            "difficulty",
            string_enum("question_difficulty", ["入门", "进阶"]),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("core_tension", sa.String(length=200), nullable=False),
        sa.Column("philosopher_refs", sa.JSON(), nullable=False),
        sa.Column("followup_strategy", sa.String(length=80), nullable=False),
        sa.Column(
            "review_status",
            string_enum(
                "question_review_status",
                ["draft", "reviewed", "published", "retired"],
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(question)) > 0",
            name=op.f("ck_daily_questions_question_not_blank"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("question"),
        sa.UniqueConstraint("seed_id"),
    )
    op.create_index(
        "ix_daily_questions_domain_difficulty",
        "daily_questions",
        ["domain", "difficulty"],
    )

    op.create_table(
        "question_interactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_key", sa.String(length=100), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column(
            "action",
            string_enum(
                "question_interaction_action",
                ["presented", "skipped", "completed"],
            ),
            nullable=False,
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(user_key)) > 0",
            name=op.f("ck_question_interactions_user_key_not_blank"),
        ),
        sa.ForeignKeyConstraint(["question_id"], ["daily_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_question_interactions_user_occurred",
        "question_interactions",
        ["user_key", "occurred_at"],
    )


def downgrade() -> None:
    """Remove question selection history and the reviewed question bank."""

    op.drop_table("question_interactions")
    op.drop_table("daily_questions")
