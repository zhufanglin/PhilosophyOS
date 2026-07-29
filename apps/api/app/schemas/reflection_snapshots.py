"""Public contracts for AI-generated reflection snapshots."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

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
