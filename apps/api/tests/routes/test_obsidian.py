"""API tests for Obsidian draft creation."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routes.obsidian import (
    create_obsidian_draft,
    render_obsidian_draft,
    sanitize_filename_part,
)
from app.schemas.obsidian import ObsidianDraftRequest
from app.settings import PhilosophyOSSettings


def sample_draft_request() -> ObsidianDraftRequest:
    """Return a small valid draft request."""

    return ObsidianDraftRequest(
        question="当诚实地生活必然带来损失时，我们仍有理由坚持诚实吗？",
        user_statements=["我认为诚实仍然值得坚持。"],
        selected_items=[
            {
                "label": "我的暂定立场",
                "text": "诚实仍有其内在价值。",
                "origin": "user",
            },
            {
                "label": "概念校正",
                "text": "区分事实准确、完整披露与承诺忠实。",
                "origin": "ai",
            },
        ],
    )


def test_render_obsidian_draft_separates_user_and_ai_items() -> None:
    """Draft Markdown clearly separates user-confirmed views from AI suggestions."""

    markdown = render_obsidian_draft(sample_draft_request())

    assert "## 我的原始回答" in markdown
    assert "## 我确认保存的观点" in markdown
    assert "诚实仍有其内在价值" in markdown
    assert "## AI 建议与澄清" in markdown
    assert "区分事实准确、完整披露与承诺忠实" in markdown
    assert "## 待确认" in markdown


def test_create_obsidian_draft_writes_unique_markdown_files(tmp_path: Path) -> None:
    """Creating drafts never overwrites an existing Markdown file."""

    settings = PhilosophyOSSettings(obsidian_drafts_dir=str(tmp_path))
    first = create_obsidian_draft(sample_draft_request(), settings)
    second = create_obsidian_draft(sample_draft_request(), settings)

    assert first.file_name.endswith(".md")
    assert second.file_name.endswith("-2.md")
    assert (tmp_path / first.file_name).exists()
    assert (tmp_path / second.file_name).exists()
    assert "PhilosophyOS 对话草稿" in (tmp_path / first.file_name).read_text(encoding="utf-8")


def test_sanitize_filename_part_removes_windows_path_separators() -> None:
    """Question text cannot create nested paths or invalid Windows filenames."""

    assert "\\" not in sanitize_filename_part('诚实/损失: "问题"? *')
    assert "/" not in sanitize_filename_part('诚实/损失: "问题"? *')
    assert sanitize_filename_part("CON") == "CON-草稿"


@pytest.mark.anyio
async def test_obsidian_draft_endpoint_rejects_empty_selected_items() -> None:
    """Request validation requires at least one selected item."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/obsidian-drafts",
            json={
                "question": "诚实为何重要？",
                "user_statements": ["我认为它维系信任。"],
                "selected_items": [],
            },
        )

    assert response.status_code == 422


def test_openapi_exposes_obsidian_drafts_resource() -> None:
    """The API contract includes the Obsidian draft creation resource."""

    assert "/api/v1/obsidian-drafts" in app.openapi()["paths"]
