"""Confirmed Markdown writes with conflict checks and audit records."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.vault.drafts import sha256_text


AUDIT_FILE_NAME = ".philosophyos-writes.jsonl"


class VaultWriteConflictError(RuntimeError):
    """Raised when a file changed after preview generation."""


@dataclass(frozen=True)
class ConfirmedVaultWrite:
    """Metadata for one confirmed vault write."""

    file_name: str
    absolute_path: str
    previous_sha256: str
    new_sha256: str
    audit_path: str


def confirm_markdown_write(
    *,
    target_path: str | Path,
    markdown: str,
    expected_current_sha256: str,
) -> ConfirmedVaultWrite:
    """Write Markdown only after checking the preview-time file hash."""

    path = Path(target_path).expanduser()
    existing_markdown = path.read_text(encoding="utf-8") if path.exists() else ""
    current_sha256 = sha256_text(existing_markdown)
    if current_sha256 != expected_current_sha256:
        raise VaultWriteConflictError(
            "Target Markdown changed after preview; regenerate the diff before writing."
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown, encoding="utf-8")
    new_sha256 = sha256_text(markdown)
    audit_path = append_write_audit(
        target_path=path,
        previous_sha256=current_sha256,
        new_sha256=new_sha256,
        markdown=markdown,
    )

    return ConfirmedVaultWrite(
        file_name=path.name,
        absolute_path=str(path),
        previous_sha256=current_sha256,
        new_sha256=new_sha256,
        audit_path=str(audit_path),
    )


def append_write_audit(
    *,
    target_path: Path,
    previous_sha256: str,
    new_sha256: str,
    markdown: str,
) -> Path:
    """Append an audit record beside the target Markdown file."""

    audit_path = target_path.parent / AUDIT_FILE_NAME
    record = {
        "operation": "confirmed_markdown_write",
        "created_at": datetime.now(UTC).isoformat(),
        "target_path": str(target_path),
        "previous_sha256": previous_sha256,
        "new_sha256": new_sha256,
        "bytes": len(markdown.encode("utf-8")),
    }
    with audit_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False) + "\n")
    return audit_path

