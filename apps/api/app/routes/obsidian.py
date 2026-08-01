"""REST resources for creating reviewable Obsidian Markdown drafts."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.schemas.obsidian import (
    DraftItemOrigin,
    ObsidianDraftConfirmRequest,
    ObsidianDraftConfirmResponse,
    ObsidianDraftPreviewResponse,
    ObsidianDraftRequest,
    ObsidianDraftResponse,
)
from app.settings import PhilosophyOSSettings, settings
from app.vault.drafts import build_obsidian_draft_preview
from app.vault.writer import VaultWriteConflictError, confirm_markdown_write

router = APIRouter(prefix="/api/v1", tags=["obsidian"])

WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


def sanitize_filename_part(value: str, *, fallback: str = "哲学对话") -> str:
    """Return a Windows-safe Markdown filename stem part."""

    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", value).strip()
    cleaned = re.sub(r"\s+", "-", cleaned)
    cleaned = cleaned.strip(".- ")
    if not cleaned:
        cleaned = fallback
    cleaned = cleaned[:42].strip(".- ") or fallback
    if cleaned.upper() in WINDOWS_RESERVED_NAMES:
        cleaned = f"{cleaned}-草稿"
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
        f"# 哲学对话记录：{request.question}",
        "",
        "## 问题",
        request.question,
        "",
        "## 我的原始回答",
    ]

    if request.user_statements:
        lines.extend(f"- {statement}" for statement in request.user_statements if statement.strip())
    else:
        lines.append("- 尚未记录原始回答。")

    lines.extend(["", "## 我确认保存的观点"])
    if user_items:
        lines.extend(f"- **{item.label}**：{item.text}" for item in user_items)
    else:
        lines.append("- 尚未确认用户观点。")

    lines.extend(["", "## AI 建议与澄清"])
    if ai_items:
        lines.extend(f"- **{item.label}**：{item.text}" for item in ai_items)
    else:
        lines.append("- 本次没有保存 AI 建议。")

    lines.extend(
        [
            "",
            "## 待确认",
            "- 哪些是真正属于我的观点？",
            "- 哪些只是 AI 的解释或整理？",
            "- 哪些需要继续阅读原典或二手研究？",
            "",
            "---",
            "",
            "来源：PhilosophyOS 对话草稿",
        ]
    )
    return "\n".join(lines) + "\n"


def create_obsidian_draft(
    request: ObsidianDraftRequest,
    current_settings: PhilosophyOSSettings = settings,
) -> ObsidianDraftResponse:
    """Create a Markdown draft in the configured Obsidian draft directory."""

    draft_dir = Path(current_settings.obsidian_drafts_dir).expanduser()
    draft_dir.mkdir(parents=True, exist_ok=True)

    stem = f"{date.today().isoformat()}-{sanitize_filename_part(request.question)}"
    draft_path = unique_markdown_path(draft_dir, stem)
    draft_path.write_text(render_obsidian_draft(request), encoding="utf-8")

    return ObsidianDraftResponse(
        file_name=draft_path.name,
        absolute_path=str(draft_path),
        message="Obsidian 草稿已生成，请在 Obsidian 中确认后再归档。",
    )


@router.post(
    "/obsidian-drafts",
    response_model=ObsidianDraftResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a reviewable Obsidian Markdown draft",
)
async def create_obsidian_draft_endpoint(
    request: ObsidianDraftRequest,
) -> ObsidianDraftResponse:
    """Create a non-overwriting Markdown draft in the fixed Obsidian draft directory."""

    return create_obsidian_draft(request, settings)


@router.post(
    "/obsidian-drafts/preview",
    response_model=ObsidianDraftPreviewResponse,
    summary="Preview an Obsidian Markdown draft without writing it",
)
async def preview_obsidian_draft_endpoint(
    request: ObsidianDraftRequest,
) -> ObsidianDraftPreviewResponse:
    """Return Markdown and a structured diff without touching the target file."""

    preview = build_obsidian_draft_preview(request, settings)
    return ObsidianDraftPreviewResponse(
        file_name=preview.file_name,
        target_path=str(preview.target_path),
        markdown=preview.markdown,
        current_sha256=preview.current_sha256,
        proposed_sha256=preview.proposed_sha256,
        diff=[
            {
                "kind": line.kind,
                "text": line.text,
                "old_line": line.old_line,
                "new_line": line.new_line,
            }
            for line in preview.diff
        ],
    )


@router.post(
    "/obsidian-drafts/confirm",
    response_model=ObsidianDraftConfirmResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm and write a previewed Obsidian Markdown draft",
)
async def confirm_obsidian_draft_endpoint(
    request: ObsidianDraftConfirmRequest,
) -> ObsidianDraftConfirmResponse:
    """Write Markdown only when the target file still matches the preview hash."""

    try:
        result = confirm_markdown_write(
            target_path=request.target_path,
            markdown=request.markdown,
            expected_current_sha256=request.expected_current_sha256,
        )
    except VaultWriteConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return ObsidianDraftConfirmResponse(
        file_name=result.file_name,
        absolute_path=result.absolute_path,
        previous_sha256=result.previous_sha256,
        new_sha256=result.new_sha256,
        audit_path=result.audit_path,
        message="Obsidian draft written after explicit confirmation.",
    )
