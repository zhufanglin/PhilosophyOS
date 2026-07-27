"""Public contracts for Obsidian draft creation."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class DraftItemOrigin(StrEnum):
    """Origin marker for confirmed reflection items."""

    USER = "user"
    AI = "ai"


class ObsidianDraftItem(BaseModel):
    """One selected reflection item to write into a draft."""

    model_config = ConfigDict(str_strip_whitespace=True)

    label: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=2000)
    origin: DraftItemOrigin


class ObsidianDraftRequest(BaseModel):
    """Request to create a reviewable Obsidian Markdown draft."""

    model_config = ConfigDict(str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=500)
    user_statements: list[str] = Field(default_factory=list, max_length=12)
    selected_items: list[ObsidianDraftItem] = Field(min_length=1, max_length=20)


class ObsidianDraftResponse(BaseModel):
    """Created Obsidian draft metadata safe for the frontend."""

    file_name: str
    absolute_path: str
    message: str
