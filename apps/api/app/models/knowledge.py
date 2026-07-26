"""Public philosophy knowledge and source models."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    MetaData,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def utc_now() -> datetime:
    """Return a timezone-aware timestamp suitable for persisted records."""

    return datetime.now(UTC)


class Base(DeclarativeBase):
    """Shared declarative base for the API database."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Tradition(StrEnum):
    """Independent philosophical content domains."""

    WESTERN = "western"
    CHINESE = "chinese"


class EntityType(StrEnum):
    """Kinds of public philosophy entities."""

    PHILOSOPHER = "philosopher"
    CONCEPT = "concept"
    WORK = "work"
    SCHOOL = "school"
    QUESTION = "question"
    PERIOD = "period"


class DepthLevel(StrEnum):
    """Editorial depth of an entity in the content map."""

    L1 = "L1"
    L2 = "L2"
    L3 = "L3"


class ReviewStatus(StrEnum):
    """Editorial lifecycle shared by public knowledge records."""

    DRAFT = "draft"
    REVIEWED = "reviewed"
    PUBLISHED = "published"
    RETIRED = "retired"


class RelationType(StrEnum):
    """Initial controlled vocabulary for public relationships."""

    AUTHORED = "authored"
    PROPOSED = "proposed"
    INFLUENCED = "influenced"
    CRITICIZED = "criticized"
    DEVELOPED = "developed"
    BELONGS_TO = "belongs_to"
    ADDRESSES = "addresses"
    USES_CONCEPT = "uses_concept"
    CONTRASTS_WITH = "contrasts_with"
    TRANSLATED_AS = "translated_as"
    COMPARED_WITH = "compared_with"


class RelationDirection(StrEnum):
    """Whether a relation has an ordered direction."""

    DIRECTED = "directed"
    UNDIRECTED = "undirected"


class ConfidenceLevel(StrEnum):
    """Editorial confidence in a relationship claim."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    DISPUTED = "disputed"


class SourceType(StrEnum):
    """Bibliographic role of a source."""

    PRIMARY = "primary"
    SECONDARY = "secondary"
    REFERENCE = "reference"
    GUIDE = "guide"
    CURATED = "curated"
    AI_SYNTHESIS = "ai_synthesis"


class SourceLevel(StrEnum):
    """Trust tier defined by the PhilosophyOS source policy."""

    S1 = "S1"
    S2 = "S2"
    S3 = "S3"
    S4 = "S4"
    S5 = "S5"


class CopyrightStatus(StrEnum):
    """Rights-review lifecycle for a specific source version."""

    DISCOVERED = "discovered"
    RIGHTS_REVIEW = "rights_review"
    APPROVED = "approved"
    RESTRICTED = "restricted"
    REJECTED = "rejected"
    RETIRED = "retired"


class EvidenceKind(StrEnum):
    """How a source chunk may support generated content."""

    DIRECT_QUOTE = "direct_quote"
    PARAPHRASE = "paraphrase"
    SUMMARY = "summary"
    METADATA = "metadata"


def enum_type(enum_class: type[StrEnum], name: str) -> Enum:
    """Create a portable string enum for SQLite and PostgreSQL."""

    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        values_callable=lambda members: [member.value for member in members],
    )


class PhilosophyEntity(Base):
    """A reviewed philosopher, concept, work, school, question, or period."""

    __tablename__ = "philosophy_entities"
    __table_args__ = (
        UniqueConstraint("tradition", "entity_type", "canonical_name"),
        Index("ix_philosophy_entities_period_id", "period_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tradition: Mapped[Tradition] = mapped_column(enum_type(Tradition, "tradition"))
    entity_type: Mapped[EntityType] = mapped_column(enum_type(EntityType, "entity_type"))
    canonical_name: Mapped[str] = mapped_column(String(200))
    original_name: Mapped[str | None] = mapped_column(String(300))
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text)
    period_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("philosophy_entities.id", ondelete="SET NULL")
    )
    depth_level: Mapped[DepthLevel] = mapped_column(enum_type(DepthLevel, "depth_level"))
    review_status: Mapped[ReviewStatus] = mapped_column(
        enum_type(ReviewStatus, "entity_review_status"), default=ReviewStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Relation(Base):
    """A sourced relationship between two public philosophy entities."""

    __tablename__ = "relations"
    __table_args__ = (
        CheckConstraint("source_entity_id <> target_entity_id", name="different_endpoints"),
        UniqueConstraint("source_entity_id", "relation_type", "target_entity_id"),
        Index("ix_relations_target_entity_id", "target_entity_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    source_entity_id: Mapped[UUID] = mapped_column(
        ForeignKey("philosophy_entities.id", ondelete="CASCADE")
    )
    target_entity_id: Mapped[UUID] = mapped_column(
        ForeignKey("philosophy_entities.id", ondelete="CASCADE")
    )
    relation_type: Mapped[RelationType] = mapped_column(enum_type(RelationType, "relation_type"))
    direction: Mapped[RelationDirection] = mapped_column(
        enum_type(RelationDirection, "relation_direction"),
        default=RelationDirection.DIRECTED,
    )
    claim: Mapped[str] = mapped_column(Text)
    confidence: Mapped[ConfidenceLevel] = mapped_column(
        enum_type(ConfidenceLevel, "confidence_level")
    )
    evidence_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    review_status: Mapped[ReviewStatus] = mapped_column(
        enum_type(ReviewStatus, "relation_review_status"), default=ReviewStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Source(Base):
    """Bibliographic metadata and rights state for one source version."""

    __tablename__ = "sources"
    __table_args__ = (
        CheckConstraint(
            "NOT quote_allowed OR copyright_status IN ('approved', 'restricted')",
            name="quote_requires_reviewed_rights",
        ),
        Index("ix_sources_title", "title"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    source_type: Mapped[SourceType] = mapped_column(enum_type(SourceType, "source_type"))
    source_level: Mapped[SourceLevel] = mapped_column(enum_type(SourceLevel, "source_level"))
    author: Mapped[str] = mapped_column(String(300))
    title: Mapped[str] = mapped_column(String(500))
    translator: Mapped[str | None] = mapped_column(String(300))
    edition: Mapped[str | None] = mapped_column(String(300))
    version_label: Mapped[str | None] = mapped_column(String(300))
    publication_year: Mapped[int | None]
    language: Mapped[str] = mapped_column(String(35))
    copyright_status: Mapped[CopyrightStatus] = mapped_column(
        enum_type(CopyrightStatus, "copyright_status"),
        default=CopyrightStatus.DISCOVERED,
    )
    quote_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    license_note: Mapped[str | None] = mapped_column(Text)
    canonical_url: Mapped[str | None] = mapped_column(String(1000))
    content_hash: Mapped[str | None] = mapped_column(String(128))
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    chunks: Mapped[list[SourceChunk]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class SourceChunk(Base):
    """A version-bound evidence fragment used by retrieval and citation."""

    __tablename__ = "source_chunks"
    __table_args__ = (
        CheckConstraint("length(trim(content)) > 0", name="content_not_blank"),
        CheckConstraint("length(trim(content_hash)) > 0", name="content_hash_not_blank"),
        CheckConstraint(
            "evidence_kind <> 'direct_quote' "
            "OR review_status <> 'published' "
            "OR (source_version IS NOT NULL AND length(trim(source_version)) > 0)",
            name="published_quote_has_source_version",
        ),
        UniqueConstraint("source_id", "content_hash"),
        Index("ix_source_chunks_source_id", "source_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"))
    chapter: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(128))
    evidence_kind: Mapped[EvidenceKind] = mapped_column(enum_type(EvidenceKind, "evidence_kind"))
    source_version: Mapped[str | None] = mapped_column(String(300))
    review_status: Mapped[ReviewStatus] = mapped_column(
        enum_type(ReviewStatus, "chunk_review_status"), default=ReviewStatus.DRAFT
    )
    evidence_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    source: Mapped[Source] = relationship(back_populates="chunks")
