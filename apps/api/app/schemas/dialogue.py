"""Public contracts for controlled philosophical dialogue turns."""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DialogueMode(StrEnum):
    """The five user-visible ways PhilosophyOS can conduct a turn."""

    SOCRATIC = "socratic"
    EXPLAIN = "explain"
    COMPARE = "compare"
    REFLECT = "reflect"
    ORGANIZE = "organize"


class DialogueRequest(BaseModel):
    """One user turn plus explicit orchestration controls."""

    model_config = ConfigDict(str_strip_whitespace=True)

    user_message: str = Field(min_length=1, max_length=4000)
    current_mode: DialogueMode = DialogueMode.SOCRATIC
    requested_mode: DialogueMode | None = None
    topic: str | None = Field(default=None, max_length=300)
    turn_number: int = Field(default=1, ge=1)

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
    provider_fallback_reason: str | None = None
