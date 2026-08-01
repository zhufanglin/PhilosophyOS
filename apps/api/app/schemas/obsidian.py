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
    kind: str | None = Field(default=None, max_length=40)


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


class MarkdownDiffLineResponse(BaseModel):
    """One structured Markdown diff line."""

    kind: str
    text: str
    old_line: int | None
    new_line: int | None


class ObsidianDraftPreviewResponse(BaseModel):
    """Preview payload that does not write to disk."""

    file_name: str
    target_path: str
    markdown: str
    current_sha256: str
    proposed_sha256: str
    diff: list[MarkdownDiffLineResponse]


class ObsidianDraftConfirmRequest(BaseModel):
    """Confirm a previewed Markdown write."""

    target_path: str = Field(min_length=1)
    markdown: str = Field(min_length=1)
    expected_current_sha256: str = Field(min_length=64, max_length=64)


class ObsidianDraftConfirmResponse(BaseModel):
    """Confirmed write metadata safe for the frontend."""

    file_name: str
    absolute_path: str
    previous_sha256: str
    new_sha256: str
    audit_path: str
    message: str
