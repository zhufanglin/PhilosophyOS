"""Confirmed Markdown writes with conflict checks and audit records."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.models.audit import VaultWriteAuditRecord
from app.vault.drafts import sha256_text


AUDIT_FILE_NAME = ".philosophyos-writes.jsonl"
BACKUP_DIRECTORY_NAME = ".philosophyos-backups"


class VaultWriteConflictError(RuntimeError):
    """Raised when a file changed after preview generation."""


class VaultUndoUnavailableError(RuntimeError):
    """Raised when no safe undo operation is available."""


@dataclass(frozen=True)
class ConfirmedVaultWrite:
    """Metadata for one confirmed vault write."""

    file_name: str
    absolute_path: str
    previous_sha256: str
    new_sha256: str
    audit_path: str
    backup_path: str | None


@dataclass(frozen=True)
class UndoneVaultWrite:
    """Metadata for one safely undone vault write."""

    file_name: str
    absolute_path: str
    restored_sha256: str
    removed_file: bool
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
    previous_exists = path.exists()
    current_sha256 = sha256_text(existing_markdown)
    if current_sha256 != expected_current_sha256:
        raise VaultWriteConflictError(
            "Target Markdown changed after preview; regenerate the diff before writing."
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    backup_path = backup_existing_file(path) if previous_exists else None
    path.write_text(markdown, encoding="utf-8")
    new_sha256 = sha256_text(markdown)
    audit_path = append_write_audit(
        target_path=path,
        previous_sha256=current_sha256,
        new_sha256=new_sha256,
        markdown=markdown,
        previous_exists=previous_exists,
        backup_path=backup_path,
    )

    return ConfirmedVaultWrite(
        file_name=path.name,
        absolute_path=str(path),
        previous_sha256=current_sha256,
        new_sha256=new_sha256,
        audit_path=str(audit_path),
        backup_path=str(backup_path) if backup_path else None,
    )


def undo_latest_confirmed_write(vault_dir: str | Path) -> UndoneVaultWrite:
    """Undo the latest confirmed write if the target still matches its audit hash."""

    root = Path(vault_dir).expanduser()
    audit_path = root / AUDIT_FILE_NAME
    records = read_audit_records(audit_path)
    write_record = latest_undoable_write(records)
    if write_record is None:
        raise VaultUndoUnavailableError("No confirmed Obsidian write is available to undo.")

    target_path = Path(write_record.target_path)
    if not target_path.exists():
        raise VaultWriteConflictError("Target Markdown no longer exists; undo was not applied.")

    current_markdown = target_path.read_text(encoding="utf-8")
    current_sha256 = sha256_text(current_markdown)
    if current_sha256 != write_record.new_sha256:
        raise VaultWriteConflictError(
            "Target Markdown changed after the AI write; undo was not applied."
        )

    if write_record.previous_exists:
        if not write_record.backup_path:
            raise VaultUndoUnavailableError("The audit record has no backup path.")
        backup_path = Path(write_record.backup_path)
        if not backup_path.exists():
            raise VaultUndoUnavailableError("The backup file for this write is missing.")
        restored_markdown = backup_path.read_text(encoding="utf-8")
        restored_sha256 = sha256_text(restored_markdown)
        if restored_sha256 != write_record.previous_sha256:
            raise VaultWriteConflictError("Backup hash does not match the audit record.")
        target_path.write_text(restored_markdown, encoding="utf-8")
        removed_file = False
    else:
        target_path.unlink()
        restored_sha256 = sha256_text("")
        removed_file = True

    append_undo_audit(
        audit_path=audit_path,
        target_path=target_path,
        undone_record=write_record,
        undone_target_sha256=current_sha256,
        restored_sha256=restored_sha256,
    )
    return UndoneVaultWrite(
        file_name=target_path.name,
        absolute_path=str(target_path),
        restored_sha256=restored_sha256,
        removed_file=removed_file,
        audit_path=str(audit_path),
    )


def backup_existing_file(target_path: Path) -> Path:
    """Copy the pre-write Markdown file into a local backup directory."""

    backup_dir = target_path.parent / BACKUP_DIRECTORY_NAME
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = backup_dir / f"{target_path.name}.{timestamp}.bak"
    shutil.copy2(target_path, backup_path)
    return backup_path


def append_write_audit(
    *,
    target_path: Path,
    previous_sha256: str,
    new_sha256: str,
    markdown: str,
    previous_exists: bool,
    backup_path: Path | None,
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
        "previous_exists": previous_exists,
        "backup_path": str(backup_path) if backup_path else None,
    }
    with audit_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False) + "\n")
    return audit_path


def append_undo_audit(
    *,
    audit_path: Path,
    target_path: Path,
    undone_record: VaultWriteAuditRecord,
    undone_target_sha256: str,
    restored_sha256: str,
) -> None:
    """Append an audit record for a successful undo."""

    record = {
        "operation": "undo_confirmed_markdown_write",
        "created_at": datetime.now(UTC).isoformat(),
        "target_path": str(target_path),
        "previous_sha256": undone_target_sha256,
        "new_sha256": restored_sha256,
        "bytes": target_path.stat().st_size if target_path.exists() else 0,
        "previous_exists": target_path.exists(),
        "backup_path": undone_record.backup_path,
        "undone_target_sha256": undone_target_sha256,
        "restored_sha256": restored_sha256,
        "undone_write_created_at": undone_record.created_at,
    }
    with audit_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_audit_records(audit_path: Path) -> list[VaultWriteAuditRecord]:
    """Read append-only vault audit records, ignoring blank lines."""

    if not audit_path.exists():
        return []

    records: list[VaultWriteAuditRecord] = []
    for line in audit_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        records.append(VaultWriteAuditRecord.from_json_dict(json.loads(line)))
    return records


def latest_undoable_write(
    records: list[VaultWriteAuditRecord],
) -> VaultWriteAuditRecord | None:
    """Return the latest confirmed write that has not already been undone."""

    undone_keys = {
        (record.target_path, record.undone_target_sha256, record.undone_write_created_at)
        for record in records
        if record.operation == "undo_confirmed_markdown_write"
    }
    for record in reversed(records):
        if record.operation != "confirmed_markdown_write":
            continue
        key = (record.target_path, record.new_sha256, record.created_at)
        if key not in undone_keys:
            return record
    return None
