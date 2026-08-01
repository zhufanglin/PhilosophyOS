"""Draft rendering and structured Markdown diff generation."""

from __future__ import annotations

import difflib
import hashlib
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal

from app.schemas.obsidian import DraftItemOrigin, ObsidianDraftRequest
from app.settings import PhilosophyOSSettings, settings


WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}

DiffLineKind = Literal["context", "added", "removed"]


@dataclass(frozen=True)
class MarkdownDiffLine:
    """One display-ready Markdown diff line."""

    kind: DiffLineKind
    text: str
    old_line: int | None
    new_line: int | None


@dataclass(frozen=True)
class ObsidianDraftPreview:
    """A safe preview that has not written anything to disk."""

    file_name: str
    target_path: Path
    markdown: str
    current_sha256: str
    proposed_sha256: str
    diff: list[MarkdownDiffLine]


def sanitize_filename_part(value: str, *, fallback: str = "philosophy-dialogue") -> str:
    """Return a Windows-safe Markdown filename stem part."""

    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", value).strip()
    cleaned = re.sub(r"\s+", "-", cleaned)
    cleaned = cleaned.strip(".- ")
    if not cleaned:
        cleaned = fallback
    cleaned = cleaned[:42].strip(".- ") or fallback
    if cleaned.upper() in WINDOWS_RESERVED_NAMES:
        cleaned = f"{cleaned}-draft"
    return cleaned


def unique_markdown_path(directory: Path, stem: str) -> Path:
    """Return a non-existing Markdown path in the fixed draft directory."""

    candidate = directory / f"{stem}.md"
    if not candidate.exists():
        return candidate

    index = 2
    while True:
        candidate = directory / f"{stem}-{index}.md"
        if not candidate.exists():
            return candidate
        index += 1


def render_obsidian_draft(request: ObsidianDraftRequest) -> str:
    """Render one PhilosophyOS reflection draft as Markdown."""

    user_items = [item for item in request.selected_items if item.origin == DraftItemOrigin.USER]
    ai_items = [item for item in request.selected_items if item.origin == DraftItemOrigin.AI]
    lines = [
        f"# PhilosophyOS reflection: {request.question}",
        "",
        "## Question",
        request.question,
        "",
        "## My original answer",
    ]

    if request.user_statements:
        lines.extend(f"- {statement}" for statement in request.user_statements if statement.strip())
    else:
        lines.append("- No original answer was recorded.")

    lines.extend(["", "## User-confirmed viewpoints"])
    if user_items:
        lines.extend(f"- **{item.label}**: {item.text}" for item in user_items)
    else:
        lines.append("- No user viewpoint was confirmed.")

    lines.extend(["", "## AI suggestions and clarifications"])
    if ai_items:
        lines.extend(f"- **{item.label}**: {item.text}" for item in ai_items)
    else:
        lines.append("- No AI suggestion was saved.")

    lines.extend(
        [
            "",
            "## To review",
            "- Which claims are truly mine?",
            "- Which parts are only AI interpretation?",
            "- Which parts need primary or secondary reading?",
            "",
            "---",
            "",
            "Source: PhilosophyOS review draft",
        ]
    )
    return "\n".join(lines) + "\n"


def build_obsidian_draft_preview(
    request: ObsidianDraftRequest,
    current_settings: PhilosophyOSSettings = settings,
) -> ObsidianDraftPreview:
    """Build a preview without creating directories or writing Markdown files."""

    draft_dir = Path(current_settings.obsidian_drafts_dir).expanduser()
    stem = f"{date.today().isoformat()}-{sanitize_filename_part(request.question)}"
    target_path = unique_markdown_path(draft_dir, stem)
    existing_markdown = target_path.read_text(encoding="utf-8") if target_path.exists() else ""
    proposed_markdown = render_obsidian_draft(request)
    return ObsidianDraftPreview(
        file_name=target_path.name,
        target_path=target_path,
        markdown=proposed_markdown,
        current_sha256=sha256_text(existing_markdown),
        proposed_sha256=sha256_text(proposed_markdown),
        diff=build_markdown_diff(existing_markdown, proposed_markdown),
    )


def build_markdown_diff(original: str, proposed: str) -> list[MarkdownDiffLine]:
    """Return a stable, structured line diff for Markdown preview UIs."""

    original_lines = original.splitlines()
    proposed_lines = proposed.splitlines()
    diff_lines: list[MarkdownDiffLine] = []
    old_line_number = 0
    new_line_number = 0

    for line in difflib.ndiff(original_lines, proposed_lines):
        prefix = line[:2]
        text = line[2:]
        if prefix == "  ":
            old_line_number += 1
            new_line_number += 1
            diff_lines.append(
                MarkdownDiffLine(
                    kind="context",
                    text=text,
                    old_line=old_line_number,
                    new_line=new_line_number,
                )
            )
        elif prefix == "- ":
            old_line_number += 1
            diff_lines.append(
                MarkdownDiffLine(
                    kind="removed",
                    text=text,
                    old_line=old_line_number,
                    new_line=None,
                )
            )
        elif prefix == "+ ":
            new_line_number += 1
            diff_lines.append(
                MarkdownDiffLine(
                    kind="added",
                    text=text,
                    old_line=None,
                    new_line=new_line_number,
                )
            )

    return diff_lines


def sha256_text(value: str) -> str:
    """Return the SHA-256 hash of UTF-8 text."""

    return hashlib.sha256(value.encode("utf-8")).hexdigest()

