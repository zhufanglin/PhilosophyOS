"""Create the public knowledge and evidence schema.

Revision ID: 20260726_0001
Revises: None
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260726_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def string_enum(name: str, values: list[str]) -> sa.Enum:
    """Return the portable enum representation used by the ORM."""

    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def upgrade() -> None:
    """Create public philosophy knowledge tables."""

    op.create_table(
        "philosophy_entities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tradition", string_enum("tradition", ["western", "chinese"]), nullable=False),
        sa.Column(
            "entity_type",
            string_enum(
                "entity_type", ["philosopher", "concept", "work", "school", "question", "period"]
            ),
            nullable=False,
        ),
        sa.Column("canonical_name", sa.String(length=200), nullable=False),
        sa.Column("original_name", sa.String(length=300), nullable=True),
        sa.Column("aliases", sa.JSON(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("period_id", sa.Uuid(), nullable=True),
        sa.Column("depth_level", string_enum("depth_level", ["L1", "L2", "L3"]), nullable=False),
        sa.Column(
            "review_status",
            string_enum("entity_review_status", ["draft", "reviewed", "published", "retired"]),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["period_id"], ["philosophy_entities.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tradition", "entity_type", "canonical_name"),
    )
    op.create_index("ix_philosophy_entities_period_id", "philosophy_entities", ["period_id"])

    op.create_table(
        "sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "source_type",
            string_enum(
                "source_type",
                ["primary", "secondary", "reference", "guide", "curated", "ai_synthesis"],
            ),
            nullable=False,
        ),
        sa.Column(
            "source_level",
            string_enum("source_level", ["S1", "S2", "S3", "S4", "S5"]),
            nullable=False,
        ),
        sa.Column("author", sa.String(length=300), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("translator", sa.String(length=300), nullable=True),
        sa.Column("edition", sa.String(length=300), nullable=True),
        sa.Column("version_label", sa.String(length=300), nullable=True),
        sa.Column("publication_year", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(length=35), nullable=False),
        sa.Column(
            "copyright_status",
            string_enum(
                "copyright_status",
                ["discovered", "rights_review", "approved", "restricted", "rejected", "retired"],
            ),
            nullable=False,
        ),
        sa.Column("quote_allowed", sa.Boolean(), nullable=False),
        sa.Column("license_note", sa.Text(), nullable=True),
        sa.Column("canonical_url", sa.String(length=1000), nullable=True),
        sa.Column("content_hash", sa.String(length=128), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "NOT quote_allowed OR copyright_status IN ('approved', 'restricted')",
            name=op.f("ck_sources_quote_requires_reviewed_rights"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sources_title", "sources", ["title"])

    op.create_table(
        "relations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_entity_id", sa.Uuid(), nullable=False),
        sa.Column("target_entity_id", sa.Uuid(), nullable=False),
        sa.Column(
            "relation_type",
            string_enum(
                "relation_type",
                [
                    "authored",
                    "proposed",
                    "influenced",
                    "criticized",
                    "developed",
                    "belongs_to",
                    "addresses",
                    "uses_concept",
                    "contrasts_with",
                    "translated_as",
                    "compared_with",
                ],
            ),
            nullable=False,
        ),
        sa.Column(
            "direction",
            string_enum("relation_direction", ["directed", "undirected"]),
            nullable=False,
        ),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column(
            "confidence",
            string_enum("confidence_level", ["high", "medium", "low", "disputed"]),
            nullable=False,
        ),
        sa.Column("evidence_ids", sa.JSON(), nullable=False),
        sa.Column(
            "review_status",
            string_enum("relation_review_status", ["draft", "reviewed", "published", "retired"]),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source_entity_id <> target_entity_id",
            name=op.f("ck_relations_different_endpoints"),
        ),
        sa.ForeignKeyConstraint(
            ["source_entity_id"], ["philosophy_entities.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["target_entity_id"], ["philosophy_entities.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_entity_id", "relation_type", "target_entity_id"),
    )
    op.create_index("ix_relations_target_entity_id", "relations", ["target_entity_id"])

    op.create_table(
        "source_chunks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("chapter", sa.String(length=500), nullable=True),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=128), nullable=False),
        sa.Column(
            "evidence_kind",
            string_enum("evidence_kind", ["direct_quote", "paraphrase", "summary", "metadata"]),
            nullable=False,
        ),
        sa.Column("source_version", sa.String(length=300), nullable=True),
        sa.Column(
            "review_status",
            string_enum("chunk_review_status", ["draft", "reviewed", "published", "retired"]),
            nullable=False,
        ),
        sa.Column("evidence_metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(content)) > 0", name=op.f("ck_source_chunks_content_not_blank")
        ),
        sa.CheckConstraint(
            "length(trim(content_hash)) > 0",
            name=op.f("ck_source_chunks_content_hash_not_blank"),
        ),
        sa.CheckConstraint(
            "evidence_kind <> 'direct_quote' "
            "OR review_status <> 'published' "
            "OR (source_version IS NOT NULL AND length(trim(source_version)) > 0)",
            name=op.f("ck_source_chunks_published_quote_has_source_version"),
        ),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", "content_hash"),
    )
    op.create_index("ix_source_chunks_source_id", "source_chunks", ["source_id"])


def downgrade() -> None:
    """Remove public philosophy knowledge tables."""

    op.drop_table("source_chunks")
    op.drop_table("relations")
    op.drop_table("sources")
    op.drop_table("philosophy_entities")
