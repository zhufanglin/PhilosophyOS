"""Public contracts for controlled philosophical dialogue turns."""

from __future__ import annotations

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DialogueMode(StrEnum):
    """The five user-visible ways PhilosophyOS can conduct a turn."""

    SOCRATIC = "socratic"
    EXPLAIN = "explain"
    COMPARE = "compare"
    REFLECT = "reflect"
    ORGANIZE = "organize"


class ModelProfile(StrEnum):
    """User-selectable backend model profiles."""

    FREE = "free"
    GPT = "gpt"
    DEEPSEEK = "deepseek"


class DialogueRequest(BaseModel):
    """One user turn plus explicit orchestration controls."""

    model_config = ConfigDict(str_strip_whitespace=True)

    user_message: str = Field(min_length=1, max_length=4000)
    current_mode: DialogueMode = DialogueMode.SOCRATIC
    requested_mode: DialogueMode | None = None
    model_profile: ModelProfile | None = None
    topic: str | None = Field(default=None, max_length=300)
    turn_number: int = Field(default=1, ge=1)
    conversation_id: UUID | None = None
    initial_assistant_message: str | None = Field(default=None, max_length=4000)

    @field_validator("topic")
    @classmethod
    def blank_topic_becomes_none(cls, value: str | None) -> str | None:
        """Treat an optional whitespace-only topic as absent."""

        return value or None


class DialogueResponse(BaseModel):
    """A policy-checked assistant turn suitable for an API response."""

    mode: DialogueMode
    previous_mode: DialogueMode
    switched: bool
    switch_reason: str
    assistant_message: str
    primary_question: str | None = None
    should_ask_followup: bool
    evidence_status: Literal["supported", "corrected", "insufficient"] | None = None
    citation_ids: tuple[str, ...] = ()
    provider: Literal["deterministic", "openai"] = "deterministic"
    provider_model: str | None = None
    model_profile: ModelProfile = ModelProfile.FREE
    provider_fallback_reason: str | None = None
    conversation_id: UUID | None = None


class DialogueSessionMessage(BaseModel):
    """One persisted message returned when a dialogue is restored."""

    message_id: UUID
    role: Literal["assistant", "user"]
    body: str
    turn_number: int
    mode: DialogueMode | None = None
    model_profile: ModelProfile | None = None
    provider_model: str | None = None
    created_at: str


class DialogueSessionSummary(BaseModel):
    """Compact metadata for the recent-dialogue picker."""

    conversation_id: UUID
    title: str
    topic: str
    current_mode: DialogueMode
    model_profile: ModelProfile
    turn_count: int
    finished: bool
    created_at: str
    updated_at: str


class DialogueSessionDetail(DialogueSessionSummary):
    """A resumable dialogue with messages in chronological order."""

    messages: list[DialogueSessionMessage]


class DialogueSessionListResponse(BaseModel):
    """Recent local dialogue sessions."""

    items: list[DialogueSessionSummary]
