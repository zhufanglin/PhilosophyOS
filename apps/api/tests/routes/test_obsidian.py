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
from app.settings import settings as runtime_settings
from app.vault.drafts import sha256_text


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


@pytest.mark.anyio
async def test_obsidian_preview_endpoint_does_not_write(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Preview returns Markdown and diff without creating a file."""

    monkeypatch.setattr(runtime_settings, "obsidian_drafts_dir", str(tmp_path))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/obsidian-drafts/preview",
            json=sample_draft_request().model_dump(mode="json"),
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["markdown"].startswith("# PhilosophyOS reflection:")
    assert payload["diff"]
    assert not Path(payload["target_path"]).exists()
    assert not (tmp_path / ".philosophyos-writes.jsonl").exists()


@pytest.mark.anyio
async def test_obsidian_confirm_endpoint_writes_after_preview(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Confirm writes only the previewed Markdown and records an audit line."""

    monkeypatch.setattr(runtime_settings, "obsidian_drafts_dir", str(tmp_path))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        preview_response = await client.post(
            "/api/v1/obsidian-drafts/preview",
            json=sample_draft_request().model_dump(mode="json"),
        )
        preview = preview_response.json()
        confirm_response = await client.post(
            "/api/v1/obsidian-drafts/confirm",
            json={
                "target_path": preview["target_path"],
                "markdown": preview["markdown"],
                "expected_current_sha256": preview["current_sha256"],
            },
        )

    assert confirm_response.status_code == 201
    assert Path(preview["target_path"]).read_text(encoding="utf-8") == preview["markdown"]
    assert (tmp_path / ".philosophyos-writes.jsonl").exists()


@pytest.mark.anyio
async def test_obsidian_confirm_endpoint_blocks_conflict(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Confirm returns 409 when the target changed after preview."""

    monkeypatch.setattr(runtime_settings, "obsidian_drafts_dir", str(tmp_path))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        preview_response = await client.post(
            "/api/v1/obsidian-drafts/preview",
            json=sample_draft_request().model_dump(mode="json"),
        )
        preview = preview_response.json()
        target_path = Path(preview["target_path"])
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text("changed after preview\n", encoding="utf-8")
        confirm_response = await client.post(
            "/api/v1/obsidian-drafts/confirm",
            json={
                "target_path": preview["target_path"],
                "markdown": preview["markdown"],
                "expected_current_sha256": preview["current_sha256"],
            },
        )

    assert confirm_response.status_code == 409
    assert target_path.read_text(encoding="utf-8") == "changed after preview\n"


@pytest.mark.anyio
async def test_obsidian_undo_latest_endpoint_restores_previous_version(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Undo endpoint restores the previous Markdown after a confirmed write."""

    monkeypatch.setattr(runtime_settings, "obsidian_drafts_dir", str(tmp_path))
    target_path = tmp_path / "manual.md"
    original_markdown = "# Before\n"
    target_path.write_text(original_markdown, encoding="utf-8")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        confirm_response = await client.post(
            "/api/v1/obsidian-drafts/confirm",
            json={
                "target_path": str(target_path),
                "markdown": "# After\n",
                "expected_current_sha256": sha256_text(original_markdown),
            },
        )
        undo_response = await client.post("/api/v1/obsidian-drafts/undo-latest")

    assert confirm_response.status_code == 201
    assert undo_response.status_code == 200
    assert target_path.read_text(encoding="utf-8") == "# Before\n"
    assert undo_response.json()["removed_file"] is False


@pytest.mark.anyio
async def test_obsidian_undo_latest_endpoint_blocks_user_changes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Undo endpoint refuses to overwrite user edits made after the AI write."""

    monkeypatch.setattr(runtime_settings, "obsidian_drafts_dir", str(tmp_path))
    target_path = tmp_path / "manual.md"
    original_markdown = ""
    target_path.write_text(original_markdown, encoding="utf-8")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/v1/obsidian-drafts/confirm",
            json={
                "target_path": str(target_path),
                "markdown": "# AI write\n",
                "expected_current_sha256": sha256_text(original_markdown),
            },
        )
        target_path.write_text("# User changed it\n", encoding="utf-8")
        undo_response = await client.post("/api/v1/obsidian-drafts/undo-latest")

    assert undo_response.status_code == 409
    assert target_path.read_text(encoding="utf-8") == "# User changed it\n"
