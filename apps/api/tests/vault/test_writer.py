"""Tests for preview-first Obsidian Markdown writes."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.obsidian import ObsidianDraftRequest
from app.settings import PhilosophyOSSettings
from app.vault.drafts import build_obsidian_draft_preview, build_markdown_diff, sha256_text
from app.vault.writer import AUDIT_FILE_NAME, VaultWriteConflictError, confirm_markdown_write


def sample_request() -> ObsidianDraftRequest:
    return ObsidianDraftRequest(
        question="Does freedom require responsibility?",
        user_statements=["Freedom without responsibility becomes arbitrary."],
        selected_items=[
            {
                "label": "Position",
                "text": "Freedom needs a chosen relation to limits.",
                "origin": "user",
                "kind": "viewpoint",
            },
            {
                "label": "Clarification",
                "text": "Separate external constraint from self-legislation.",
                "origin": "ai",
                "kind": "concept",
            },
        ],
    )


def test_preview_does_not_write_markdown_or_audit_files(tmp_path: Path) -> None:
    settings = PhilosophyOSSettings(obsidian_drafts_dir=str(tmp_path))

    preview = build_obsidian_draft_preview(sample_request(), settings)

    assert preview.target_path.parent == tmp_path
    assert preview.markdown.startswith("# PhilosophyOS reflection:")
    assert preview.diff
    assert not preview.target_path.exists()
    assert not (tmp_path / AUDIT_FILE_NAME).exists()


def test_confirmed_write_creates_markdown_and_audit_record(tmp_path: Path) -> None:
    settings = PhilosophyOSSettings(obsidian_drafts_dir=str(tmp_path))
    preview = build_obsidian_draft_preview(sample_request(), settings)

    result = confirm_markdown_write(
        target_path=preview.target_path,
        markdown=preview.markdown,
        expected_current_sha256=preview.current_sha256,
    )

    assert preview.target_path.read_text(encoding="utf-8") == preview.markdown
    assert result.new_sha256 == sha256_text(preview.markdown)
    audit_records = [
        json.loads(line)
        for line in (tmp_path / AUDIT_FILE_NAME).read_text(encoding="utf-8").splitlines()
    ]
    assert audit_records[-1]["operation"] == "confirmed_markdown_write"
    assert audit_records[-1]["target_path"] == str(preview.target_path)
    assert audit_records[-1]["new_sha256"] == result.new_sha256


def test_confirmed_write_blocks_conflicts_after_preview(tmp_path: Path) -> None:
    settings = PhilosophyOSSettings(obsidian_drafts_dir=str(tmp_path))
    preview = build_obsidian_draft_preview(sample_request(), settings)
    preview.target_path.parent.mkdir(parents=True, exist_ok=True)
    preview.target_path.write_text("changed after preview\n", encoding="utf-8")

    with pytest.raises(VaultWriteConflictError):
        confirm_markdown_write(
            target_path=preview.target_path,
            markdown=preview.markdown,
            expected_current_sha256=preview.current_sha256,
        )

    assert preview.target_path.read_text(encoding="utf-8") == "changed after preview\n"
    assert not (tmp_path / AUDIT_FILE_NAME).exists()


def test_markdown_diff_is_structured() -> None:
    diff = build_markdown_diff("alpha\nbeta\n", "alpha\ngamma\nbeta\n")

    assert [(line.kind, line.old_line, line.new_line, line.text) for line in diff] == [
        ("context", 1, 1, "alpha"),
        ("added", None, 2, "gamma"),
        ("context", 2, 3, "beta"),
    ]

