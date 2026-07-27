"""API tests for durable reflection snapshots."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routes import reflection_snapshots as snapshot_routes
from app.settings import PhilosophyOSSettings


def snapshot_payload() -> dict[str, object]:
    """Return a minimal reviewed reflection payload."""

    return {
        "question": "自由是否意味着没有限制？",
        "user_statements": ["我以前觉得自由就是想做什么就做什么。"],
        "selected_items": [
            {
                "label": "我的暂定立场",
                "text": "自由更像是在限制中承担选择。",
                "origin": "user",
            }
        ],
        "model_profile": "free",
    }


@pytest.mark.anyio
async def test_reflection_snapshot_endpoint_persists_pending_without_api_key(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Model failure or missing keys does not lose the reviewed user record."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    monkeypatch.setattr(
        snapshot_routes,
        "settings",
        PhilosophyOSSettings(thought_snapshots_path=str(snapshot_path)),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/reflection-snapshots", json=snapshot_payload())

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "pending"
    assert payload["content"] is None
    assert "API key" in payload["pending_reason"]

    records = snapshot_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(records) == 1
    stored = json.loads(records[0])
    assert stored["request"]["question"] == "自由是否意味着没有限制？"
    assert stored["response"]["snapshot_id"] == payload["snapshot_id"]


def test_openapi_exposes_reflection_snapshot_resource() -> None:
    """The API contract includes the versioned reflection snapshot resource."""

    assert "/api/v1/reflection-snapshots" in app.openapi()["paths"]


@pytest.mark.anyio
async def test_reflection_snapshot_list_endpoint_returns_recent_items(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The timeline endpoint returns stored snapshot events newest first."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    first = {
        "created_at": "2026-07-28T08:00:00+00:00",
        "request": {"question": "first question"},
        "response": {
            "snapshot_id": "snap_first",
            "status": "pending",
            "content": None,
            "provider": "none",
            "provider_model": None,
            "pending_reason": "not configured",
        },
    }
    second = {
        "created_at": "2026-07-28T09:00:00+00:00",
        "request": {"question": "second question"},
        "response": {
            "snapshot_id": "snap_second",
            "status": "completed",
            "content": {
                "topic": "freedom",
                "title": "Freedom inside limits",
                "user_position": "Freedom means responsible choice.",
                "confidence": 0.7,
                "emotional_tone": "clearer",
                "core_question": "What limits still preserve freedom?",
                "key_insights": [],
                "tensions": [],
                "related_philosophers": [],
                "change_signal": {"changed": False},
                "next_question": None,
                "tags": ["freedom"],
            },
            "provider": "openai",
            "provider_model": "test-model",
            "pending_reason": None,
        },
    }
    snapshot_path.write_text(
        "\n".join(json.dumps(item, ensure_ascii=False) for item in [first, second]) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        snapshot_routes,
        "settings",
        PhilosophyOSSettings(thought_snapshots_path=str(snapshot_path)),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/reflection-snapshots?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert [item["snapshot"]["snapshot_id"] for item in payload["items"]] == [
        "snap_second",
        "snap_first",
    ]
    assert payload["items"][0]["question"] == "second question"
