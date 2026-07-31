"""API tests for durable reflection snapshots."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.providers import ProviderRequest, ProviderResponse
from app.main import app
from app.routes import reflection_snapshots as snapshot_routes
from app.services import reflection_snapshots as snapshot_service
from app.settings import PhilosophyOSSettings
from app.storage.database import create_snapshot_engine
from app.storage.reflection_repository import ReflectionSnapshotRepository


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


class SuccessfulSnapshotProvider:
    """Provider stub that returns one valid structured thought snapshot."""

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        content = {
            "topic": "自由与责任",
            "title": "限制中的自由",
            "user_position": "自由是在限制中承担选择。",
            "confidence": 0.76,
            "emotional_tone": "更清晰",
            "core_question": "限制是否必然取消自由？",
            "key_insights": ["承担是自由的一部分"],
            "tensions": ["因果限制与责任"],
            "related_philosophers": [],
            "change_signal": {"changed": False},
            "next_question": "哪些限制仍允许负责？",
            "tags": ["自由", "责任"],
        }
        return ProviderResponse(
            assistant_message=json.dumps(content, ensure_ascii=False),
            provider="openai",
            model="test-snapshot-model",
        )


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

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        list_response = await client.get("/api/v1/reflection-snapshots?limit=1")

    assert not snapshot_path.exists()
    stored = list_response.json()["items"][0]
    assert stored["question"] == "自由是否意味着没有限制？"
    assert stored["snapshot"]["snapshot_id"] == payload["snapshot_id"]


@pytest.mark.anyio
async def test_pending_snapshot_retries_in_place_and_preserves_user_evidence(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A recovered model updates one pending record without losing the source words."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    unavailable_settings = PhilosophyOSSettings(
        thought_snapshots_path=str(snapshot_path),
        model_profile="free",
    )
    monkeypatch.setattr(snapshot_routes, "settings", unavailable_settings)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_response = await client.post(
            "/api/v1/reflection-snapshots",
            json=snapshot_payload(),
        )

    snapshot_id = create_response.json()["snapshot_id"]
    configured_settings = unavailable_settings.model_copy(
        update={"free_api_key": "test-key"}
    )
    monkeypatch.setattr(snapshot_routes, "settings", configured_settings)
    monkeypatch.setattr(
        snapshot_service,
        "select_dialogue_provider",
        lambda settings: SuccessfulSnapshotProvider(),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        retry_response = await client.post(
            f"/api/v1/reflection-snapshots/{snapshot_id}/retry"
        )
        list_response = await client.get("/api/v1/reflection-snapshots?limit=10")

    assert retry_response.status_code == 200
    retried = retry_response.json()
    assert retried["snapshot_id"] == snapshot_id
    assert retried["status"] == "completed"
    assert retried["generation_attempts"] == 2
    assert retried["content"]["user_position"] == "自由是在限制中承担选择。"

    listed = list_response.json()["items"]
    assert len(listed) == 1
    assert listed[0]["snapshot"]["snapshot_id"] == snapshot_id
    repository = ReflectionSnapshotRepository(create_snapshot_engine(snapshot_path))
    record = repository.get(snapshot_id)
    assert record is not None
    assert record.request_payload["user_statements"] == [
        "我以前觉得自由就是想做什么就做什么。"
    ]


@pytest.mark.anyio
async def test_snapshot_content_correction_updates_archive_and_preserves_revision(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """User corrections become the current archive content and retain AI wording."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    configured_settings = PhilosophyOSSettings(
        thought_snapshots_path=str(snapshot_path),
        model_profile="free",
        free_api_key="test-key",
    )
    monkeypatch.setattr(snapshot_routes, "settings", configured_settings)
    monkeypatch.setattr(
        snapshot_service,
        "select_dialogue_provider",
        lambda settings: SuccessfulSnapshotProvider(),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_response = await client.post(
            "/api/v1/reflection-snapshots",
            json=snapshot_payload(),
        )
        snapshot_id = create_response.json()["snapshot_id"]
        correction_response = await client.patch(
            f"/api/v1/reflection-snapshots/{snapshot_id}/content",
            json={
                "user_position": "自由是理解限制后仍愿意承担行动。",
                "tensions": ["限制与能动性", "责任与因果"],
                "next_question": "教育能否扩大这种自由？",
            },
        )
        list_response = await client.get("/api/v1/reflection-snapshots?limit=1")

    assert correction_response.status_code == 200
    correction = correction_response.json()
    assert correction["content"]["user_position"] == "自由是理解限制后仍愿意承担行动。"
    assert correction["revision"]["source"] == "user"
    assert correction["revision"]["previous_user_position"] == "自由是在限制中承担选择。"

    listed = list_response.json()["items"][0]["snapshot"]
    assert listed["user_decision"] == "edit"
    assert listed["content"]["tensions"] == ["限制与能动性", "责任与因果"]
    assert listed["content"]["next_question"] == "教育能否扩大这种自由？"
    assert listed["revisions"][0] == correction["revision"]


@pytest.mark.anyio
async def test_pending_snapshot_cannot_be_corrected_before_generation(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The API distinguishes missing generated content from an editable summary."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    monkeypatch.setattr(
        snapshot_routes,
        "settings",
        PhilosophyOSSettings(thought_snapshots_path=str(snapshot_path)),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_response = await client.post(
            "/api/v1/reflection-snapshots",
            json=snapshot_payload(),
        )
        snapshot_id = create_response.json()["snapshot_id"]
        response = await client.patch(
            f"/api/v1/reflection-snapshots/{snapshot_id}/content",
            json={
                "user_position": "尚未生成，不能修改。",
                "tensions": [],
                "next_question": None,
            },
        )

    assert response.status_code == 409


def test_openapi_exposes_reflection_snapshot_resource() -> None:
    """The API contract includes the versioned reflection snapshot resource."""

    assert "/api/v1/reflection-snapshots" in app.openapi()["paths"]
    assert "/api/v1/reflection-snapshots/{snapshot_id}/retry" in app.openapi()["paths"]
    assert "/api/v1/reflection-snapshots/{snapshot_id}/content" in app.openapi()["paths"]
    assert "/api/v1/reflection-snapshots/{snapshot_id}/decision" in app.openapi()["paths"]
    assert "/api/v1/reflection-snapshots/{snapshot_id}/review" in app.openapi()["paths"]


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
            "user_decision": "approved",
            "decision_updated_at": "2026-07-28T09:30:00+00:00",
            "snapshot_review": {
                "verdict": "accurate",
                "note": "This node is mostly correct.",
                "updated_at": "2026-07-28T09:40:00+00:00",
            },
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
    assert payload["items"][0]["snapshot"]["user_decision"] == "approved"
    assert payload["items"][0]["snapshot"]["snapshot_review"]["verdict"] == "accurate"


@pytest.mark.anyio
async def test_reflection_snapshot_decision_endpoint_persists_user_decision(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The user can store their stance toward an AI-generated summary."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    record = {
        "created_at": "2026-07-28T09:00:00+00:00",
        "request": {"question": "Do limits destroy freedom?"},
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
    snapshot_path.write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")
    monkeypatch.setattr(
        snapshot_routes,
        "settings",
        PhilosophyOSSettings(thought_snapshots_path=str(snapshot_path)),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            "/api/v1/reflection-snapshots/snap_second/decision",
            json={"decision": "rejected"},
        )
        list_response = await client.get("/api/v1/reflection-snapshots?limit=1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["snapshot_id"] == "snap_second"
    assert payload["user_decision"] == "rejected"
    assert payload["decision_updated_at"]

    legacy = json.loads(snapshot_path.read_text(encoding="utf-8").strip())
    assert "user_decision" not in legacy["response"]

    assert list_response.status_code == 200
    listed = list_response.json()["items"][0]["snapshot"]
    assert listed["user_decision"] == "rejected"
    assert listed["decision_updated_at"] == payload["decision_updated_at"]


@pytest.mark.anyio
async def test_reflection_snapshot_decision_endpoint_returns_404_for_missing_snapshot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Updating a missing snapshot decision returns a clear not-found response."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    snapshot_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(
        snapshot_routes,
        "settings",
        PhilosophyOSSettings(thought_snapshots_path=str(snapshot_path)),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            "/api/v1/reflection-snapshots/unknown/decision",
            json={"decision": "approved"},
        )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_reflection_snapshot_review_endpoint_persists_user_review(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The user can review and annotate a stored thought snapshot."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    record = {
        "created_at": "2026-07-28T09:00:00+00:00",
        "request": {"question": "Do limits destroy freedom?"},
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
    snapshot_path.write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")
    monkeypatch.setattr(
        snapshot_routes,
        "settings",
        PhilosophyOSSettings(thought_snapshots_path=str(snapshot_path)),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            "/api/v1/reflection-snapshots/snap_second/review",
            json={"verdict": "rewrite", "note": "The position needs a more careful wording."},
        )
        list_response = await client.get("/api/v1/reflection-snapshots?limit=1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["snapshot_id"] == "snap_second"
    assert payload["snapshot_review"]["verdict"] == "rewrite"
    assert payload["snapshot_review"]["note"] == "The position needs a more careful wording."
    assert payload["snapshot_review"]["updated_at"]

    legacy = json.loads(snapshot_path.read_text(encoding="utf-8").strip())
    assert "snapshot_review" not in legacy["response"]

    assert list_response.status_code == 200
    listed = list_response.json()["items"][0]["snapshot"]
    assert listed["snapshot_review"] == payload["snapshot_review"]


@pytest.mark.anyio
async def test_reflection_snapshot_review_endpoint_returns_404_for_missing_snapshot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Reviewing a missing snapshot returns a clear not-found response."""

    snapshot_path = tmp_path / "thought-snapshots.jsonl"
    snapshot_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(
        snapshot_routes,
        "settings",
        PhilosophyOSSettings(thought_snapshots_path=str(snapshot_path)),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            "/api/v1/reflection-snapshots/unknown/review",
            json={"verdict": "accurate", "note": None},
        )

    assert response.status_code == 404
