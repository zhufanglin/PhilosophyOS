"""Public contracts for AI-generated reflection snapshots."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.dialogue import ModelProfile
from app.schemas.obsidian import ObsidianDraftItem


class SnapshotStatus(StrEnum):
    """Lifecycle status for a reflection snapshot."""

    COMPLETED = "completed"
    PENDING = "pending"


class SnapshotDecision(StrEnum):
    """User decision about whether to accept the AI-generated summary."""

    APPROVED = "approved"
    EDIT = "edit"
    REJECTED = "rejected"
    RAW_ONLY = "raw_only"


class SnapshotReviewVerdict(StrEnum):
    """User review verdict for a stored thought snapshot."""

    ACCURATE = "accurate"
    INACCURATE = "inaccurate"
    REWRITE = "rewrite"
    RAW_ONLY = "raw_only"


class ReflectionSnapshotReview(BaseModel):
    """User review metadata attached to a stored thought snapshot."""

    verdict: SnapshotReviewVerdict
    note: str | None = Field(default=None, max_length=1000)
    updated_at: str


class ThoughtChangeSignal(BaseModel):
    """How the user's view appears to have changed."""

    changed: bool = False
    previous_position: str | None = None
    current_position: str | None = None
    change_type: str | None = None


class RelatedPhilosopher(BaseModel):
    """A philosopher connected to the user's current question."""

    name: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=1, max_length=300)


class ReflectionSnapshotContent(BaseModel):
    """Structured summary of one user's philosophical state after a dialogue."""

    model_config = ConfigDict(str_strip_whitespace=True)

    topic: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=160)
    user_position: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(default=0.5, ge=0, le=1)
    emotional_tone: str | None = Field(default=None, max_length=120)
    core_question: str = Field(min_length=1, max_length=500)
    key_insights: list[str] = Field(default_factory=list, max_length=6)
    tensions: list[str] = Field(default_factory=list, max_length=6)
    related_philosophers: list[RelatedPhilosopher] = Field(default_factory=list, max_length=6)
    change_signal: ThoughtChangeSignal = Field(default_factory=ThoughtChangeSignal)
    next_question: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=10)


class ReflectionSnapshotRevision(BaseModel):
    """One user-authored correction with the previous AI wording preserved."""

    source: Literal["user"] = "user"
    updated_at: str
    previous_user_position: str
    previous_tensions: list[str]
    previous_next_question: str | None = None


class ReflectionSnapshotRequest(BaseModel):
    """Request to create a durable thought snapshot from a reviewed dialogue."""

    model_config = ConfigDict(str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=500)
    user_statements: list[str] = Field(default_factory=list, max_length=12)
    selected_items: list[ObsidianDraftItem] = Field(min_length=1, max_length=20)
    model_profile: ModelProfile | None = None


class ReflectionSnapshotResponse(BaseModel):
    """Stored snapshot metadata and optional generated content."""

    snapshot_id: str
    status: SnapshotStatus
    content: ReflectionSnapshotContent | None = None
    provider: str = "none"
    provider_model: str | None = None
    pending_reason: str | None = None
    user_decision: SnapshotDecision | None = None
    decision_updated_at: str | None = None
    snapshot_review: ReflectionSnapshotReview | None = None
    revisions: list[ReflectionSnapshotRevision] = Field(default_factory=list)
    generation_attempts: int = Field(default=1, ge=1)
    last_generation_attempt_at: str | None = None


class ReflectionSnapshotCorrectionRequest(BaseModel):
    """User-owned fields that can replace an AI-generated summary."""

    model_config = ConfigDict(str_strip_whitespace=True)

    user_position: str = Field(min_length=1, max_length=1000)
    tensions: list[str] = Field(default_factory=list, max_length=6)
    next_question: str | None = Field(default=None, max_length=500)

    @field_validator("tensions")
    @classmethod
    def normalize_tensions(cls, values: list[str]) -> list[str]:
        """Drop blank tensions and reject oversized values."""

        normalized = [value.strip() for value in values if value.strip()]
        if any(len(value) > 300 for value in normalized):
            raise ValueError("Each tension must be at most 300 characters")
        return normalized


class ReflectionSnapshotCorrectionResponse(BaseModel):
    """Updated content plus the revision event appended for traceability."""

    snapshot_id: str
    content: ReflectionSnapshotContent
    revision: ReflectionSnapshotRevision


class ReflectionSnapshotDecisionRequest(BaseModel):
    """Request to store the user's decision about an AI summary."""

    decision: SnapshotDecision


class ReflectionSnapshotDecisionResponse(BaseModel):
    """Stored user decision metadata."""

    snapshot_id: str
    user_decision: SnapshotDecision
    decision_updated_at: str


class ReflectionSnapshotReviewRequest(BaseModel):
    """Request to store the user's review of a thought snapshot."""

    model_config = ConfigDict(str_strip_whitespace=True)

    verdict: SnapshotReviewVerdict
    note: str | None = Field(default=None, max_length=1000)


class ReflectionSnapshotReviewResponse(BaseModel):
    """Stored user review metadata."""

    snapshot_id: str
    snapshot_review: ReflectionSnapshotReview


class ReflectionSnapshotListItem(BaseModel):
    """One stored snapshot event for timeline display."""

    created_at: str
    question: str
    snapshot: ReflectionSnapshotResponse


class ReflectionSnapshotListResponse(BaseModel):
    """Recent stored snapshot events."""

    items: list[ReflectionSnapshotListItem]


class ReflectionPhilosopherInfluenceEvidence(BaseModel):
    """One thought node that explains why a philosopher is considered influential."""

    snapshot_id: str
    created_at: str
    title: str
    topic: str
    question: str
    reason: str


class ReflectionPhilosopherInfluence(BaseModel):
    """Aggregated philosopher influence across completed thought snapshots."""

    name: str
    count: int = Field(ge=1)
    topics: list[str] = Field(default_factory=list)
    evidence: list[ReflectionPhilosopherInfluenceEvidence] = Field(default_factory=list)


class ReflectionPhilosopherInfluenceResponse(BaseModel):
    """Philosophers that repeatedly appear in the user's thought archive."""

    items: list[ReflectionPhilosopherInfluence]


class ReflectionArchiveRecord(BaseModel):
    """One lossless archive record including its immutable source request."""

    created_at: str
    request: dict[str, Any]
    response: ReflectionSnapshotResponse


class ReflectionArchivePackage(BaseModel):
    """Portable, versioned PhilosophyOS thought archive."""

    schema_version: Literal["1.0"] = "1.0"
    exported_at: str
    records: list[ReflectionArchiveRecord] = Field(max_length=10_000)


class ReflectionArchiveImportResponse(BaseModel):
    """Result of an atomic archive import."""

    imported: int
    total: int


class ReflectionArchiveDeleteResponse(BaseModel):
    """Result of a destructive archive operation."""

    deleted: int


class ReflectionArchiveClearRequest(BaseModel):
    """Explicit phrase required before deleting the complete archive."""

    confirm: Literal["清空全部档案"]
