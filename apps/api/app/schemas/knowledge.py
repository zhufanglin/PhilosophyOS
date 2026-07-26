"""Validation schemas for public philosophy knowledge and evidence."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.knowledge import (
    ConfidenceLevel,
    CopyrightStatus,
    DepthLevel,
    EntityType,
    EvidenceKind,
    RelationDirection,
    RelationType,
    ReviewStatus,
    SourceLevel,
    SourceType,
    Tradition,
)


class KnowledgeSchema(BaseModel):
    """Shared configuration for schemas backed by SQLAlchemy models."""

    model_config = ConfigDict(from_attributes=True)


class PhilosophyEntityCreate(KnowledgeSchema):
    """Validated input for a public philosophy entity."""

    tradition: Tradition
    entity_type: EntityType
    canonical_name: str = Field(min_length=1, max_length=200)
    original_name: str | None = Field(default=None, max_length=300)
    aliases: list[str] = Field(default_factory=list)
    summary: str = Field(min_length=1)
    period_id: UUID | None = None
    depth_level: DepthLevel
    review_status: ReviewStatus = ReviewStatus.DRAFT


class PhilosophyEntityRead(PhilosophyEntityCreate):
    """Serialized public philosophy entity."""

    id: UUID
    created_at: datetime
    updated_at: datetime


class RelationCreate(KnowledgeSchema):
    """Validated relationship claim and its evidence references."""

    source_entity_id: UUID
    target_entity_id: UUID
    relation_type: RelationType
    direction: RelationDirection = RelationDirection.DIRECTED
    claim: str = Field(min_length=1)
    confidence: ConfidenceLevel
    evidence_ids: list[UUID] = Field(default_factory=list)
    review_status: ReviewStatus = ReviewStatus.DRAFT

    @model_validator(mode="after")
    def endpoints_must_differ(self) -> RelationCreate:
        """Reject reflexive relations before they reach the database."""

        if self.source_entity_id == self.target_entity_id:
            raise ValueError("a relation must connect two different entities")
        return self


class RelationRead(RelationCreate):
    """Serialized public relationship."""

    id: UUID
    created_at: datetime


class SourceCreate(KnowledgeSchema):
    """Validated bibliographic metadata for one concrete source version."""

    source_type: SourceType
    source_level: SourceLevel
    author: str = Field(min_length=1, max_length=300)
    title: str = Field(min_length=1, max_length=500)
    translator: str | None = Field(default=None, max_length=300)
    edition: str | None = Field(default=None, max_length=300)
    version_label: str | None = Field(default=None, max_length=300)
    publication_year: int | None = Field(default=None, ge=-3000, le=3000)
    language: str = Field(min_length=2, max_length=35)
    copyright_status: CopyrightStatus = CopyrightStatus.DISCOVERED
    quote_allowed: bool = False
    license_note: str | None = None
    canonical_url: str | None = Field(default=None, max_length=1000)
    content_hash: str | None = Field(default=None, max_length=128)
    retrieved_at: datetime | None = None

    @model_validator(mode="after")
    def quote_permission_requires_rights_review(self) -> SourceCreate:
        """Only reviewed rights states may advertise quotation permission."""

        allowed_states = {CopyrightStatus.APPROVED, CopyrightStatus.RESTRICTED}
        if self.quote_allowed and self.copyright_status not in allowed_states:
            raise ValueError("quote_allowed requires approved or restricted copyright status")
        return self


class SourceRead(SourceCreate):
    """Serialized source metadata."""

    id: UUID
    created_at: datetime


class SourceChunkCreate(KnowledgeSchema):
    """Validated evidence fragment with an immutable source-version snapshot."""

    source_id: UUID
    chapter: str | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=500)
    content: str = Field(min_length=1)
    content_hash: str = Field(min_length=1, max_length=128)
    evidence_kind: EvidenceKind
    source_version: str | None = Field(default=None, max_length=300)
    review_status: ReviewStatus = ReviewStatus.DRAFT
    evidence_metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @model_validator(mode="after")
    def published_direct_quote_requires_version(self) -> SourceChunkCreate:
        """Block publication of direct quotations without a concrete edition/version."""

        is_published_quote = (
            self.evidence_kind is EvidenceKind.DIRECT_QUOTE
            and self.review_status is ReviewStatus.PUBLISHED
        )
        if is_published_quote and not (self.source_version and self.source_version.strip()):
            raise ValueError("a published direct quote requires a concrete source version")
        return self


class SourceChunkRead(SourceChunkCreate):
    """Serialized source chunk."""

    id: UUID
    created_at: datetime
