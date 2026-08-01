"""Typed audit records for local vault writes."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


AuditOperation = Literal["confirmed_markdown_write", "undo_confirmed_markdown_write"]


class VaultWriteAuditRecord(BaseModel):
    """One append-only audit record for an Obsidian vault write or undo."""

    model_config = ConfigDict(extra="allow")

    operation: AuditOperation
    created_at: str
    target_path: str
    previous_sha256: str
    new_sha256: str
    bytes: int = Field(ge=0)
    previous_exists: bool = True
    backup_path: str | None = None
    undone_target_sha256: str | None = None
    restored_sha256: str | None = None
    undone_write_created_at: str | None = None

    @classmethod
    def from_json_dict(cls, value: dict[str, Any]) -> "VaultWriteAuditRecord":
        """Validate a decoded JSON object."""

        return cls.model_validate(value)

