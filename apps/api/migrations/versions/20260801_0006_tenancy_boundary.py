"""Add minimal user and workspace tenancy boundary.

Revision ID: 20260801_0006
Revises: 20260731_0005
Create Date: 2026-08-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260801_0006"
down_revision: str | None = "20260731_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def string_enum(name: str, values: list[str]) -> sa.Enum:
    """Return the portable SQLite enum representation."""

    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def upgrade() -> None:
    """Create tenancy tables and nullable owner columns for local data."""

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("external_subject", sa.String(length=300), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(trim(display_name)) > 0", name=op.f("ck_users_display_name_not_blank")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_subject"),
    )
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(trim(name)) > 0", name=op.f("ck_workspaces_workspace_name_not_blank")),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_workspaces_owner_user_id", "workspaces", ["owner_user_id"])
    op.create_table(
        "workspace_memberships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            string_enum("workspace_role", ["owner", "member"]),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "user_id"),
    )
    op.create_index("ix_workspace_memberships_user_id", "workspace_memberships", ["user_id"])

    op.create_table(
        "model_profile_configs",
        sa.Column("profile", sa.String(length=40), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("workspace_id", sa.Uuid(), nullable=True),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=200), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=True),
        sa.Column("api_style", sa.String(length=40), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("profile"),
    )
    op.create_index("ix_model_profile_configs_user_id", "model_profile_configs", ["user_id"])
    op.create_index(
        "ix_model_profile_configs_workspace_id", "model_profile_configs", ["workspace_id"]
    )

    for table_name in ("reflection_snapshots", "dialogue_sessions"):
        op.add_column(table_name, sa.Column("user_id", sa.Uuid(), nullable=True))
        op.add_column(table_name, sa.Column("workspace_id", sa.Uuid(), nullable=True))
        op.create_index(f"ix_{table_name}_user_id", table_name, ["user_id"])
        op.create_index(f"ix_{table_name}_workspace_id", table_name, ["workspace_id"])


def downgrade() -> None:
    """Remove the tenancy boundary tables and nullable owner columns."""

    for table_name in ("dialogue_sessions", "reflection_snapshots"):
        op.drop_index(f"ix_{table_name}_workspace_id", table_name=table_name)
        op.drop_index(f"ix_{table_name}_user_id", table_name=table_name)
        op.drop_column(table_name, "workspace_id")
        op.drop_column(table_name, "user_id")

    op.drop_index("ix_model_profile_configs_workspace_id", table_name="model_profile_configs")
    op.drop_index("ix_model_profile_configs_user_id", table_name="model_profile_configs")
    op.drop_table("model_profile_configs")

    op.drop_index("ix_workspace_memberships_user_id", table_name="workspace_memberships")
    op.drop_table("workspace_memberships")
    op.drop_index("ix_workspaces_owner_user_id", table_name="workspaces")
    op.drop_table("workspaces")
    op.drop_table("users")
