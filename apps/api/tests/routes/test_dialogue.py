"""API tests for controlled philosophical dialogue turns."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.orchestrator import DialogueOrchestrator
from app.agent.providers import ProviderRequest, ProviderResponse
from app.main import app
from app.routes import dialogue as dialogue_routes
from app.settings import PhilosophyOSSettings


@pytest.fixture(autouse=True)
def isolate_dialogue_storage(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Keep route tests out of the developer's local dialogue database."""

    monkeypatch.setattr(
        dialogue_routes,
        "settings",
        PhilosophyOSSettings(
            thought_snapshots_path=str(tmp_path / "thought-snapshots.jsonl")
        ),
    )


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("requested_mode", "expected_mode", "expects_question"),
    [
        ("socratic", "socratic", True),
        ("explain", "explain", False),
        ("organize", "organize", False),
    ],
)
async def test_dialogue_turn_endpoint_returns_selected_modes(
    requested_mode: str, expected_mode: str, expects_question: bool
) -> None:
    """The public route exposes the existing dialogue orchestrator modes."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/dialogue-turns",
            json={
                "user_message": "即使诚实带来损失，我仍倾向于坚持诚实。",
                "current_mode": "socratic",
                "requested_mode": requested_mode,
                "topic": "诚实与德性",
                "turn_number": 1,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == expected_mode
    assert payload["previous_mode"] == "socratic"
    assert payload["assistant_message"]
    assert payload["should_ask_followup"] is expects_question
    assert payload["provider"] == "deterministic"
    assert payload["provider_model"] is None
    assert payload["model_profile"] == "free"
    assert payload["provider_fallback_reason"] is None


@pytest.mark.anyio
async def test_dialogue_turn_endpoint_rejects_blank_user_message() -> None:
    """Request validation rejects empty user turns before orchestration."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/dialogue-turns",
            json={"user_message": "   ", "current_mode": "socratic"},
        )

    assert response.status_code == 422


def test_openapi_exposes_versioned_dialogue_resource() -> None:
    """The API contract includes the versioned dialogue turn resource."""

    assert "/api/v1/dialogue-turns" in app.openapi()["paths"]


def test_openapi_dialogue_response_exposes_provider_metadata() -> None:
    """The public response schema documents provider fallback metadata."""

    properties = app.openapi()["components"]["schemas"]["DialogueResponse"]["properties"]

    assert "provider" in properties
    assert "provider_model" in properties
    assert "model_profile" in properties
    assert "provider_fallback_reason" in properties


@pytest.mark.anyio
async def test_dialogue_turn_accepts_frontend_model_profile_choice() -> None:
    """The browser can choose a backend model profile without receiving secrets."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/dialogue-turns",
            json={
                "user_message": "我想用 DeepSeek 检查这个理由。",
                "current_mode": "socratic",
                "requested_mode": "socratic",
                "model_profile": "deepseek",
                "topic": "诚实与德性",
                "turn_number": 1,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_profile"] == "deepseek"


@pytest.mark.anyio
async def test_dialogue_turn_accepts_free_model_profile_choice() -> None:
    """The browser can choose the free profile as the default model source."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/dialogue-turns",
            json={
                "user_message": "我想先用免费模型做一次普通追问。",
                "current_mode": "socratic",
                "requested_mode": "socratic",
                "model_profile": "free",
                "topic": "诚实与德性",
                "turn_number": 1,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_profile"] == "free"


@pytest.mark.anyio
async def test_dialogue_session_can_be_resumed_across_turns() -> None:
    """Two turns share one id and restore the complete ordered transcript."""

    initial_message = "Start with your first judgment."
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first_response = await client.post(
            "/api/v1/dialogue-turns",
            json={
                "user_message": "Honesty remains worthwhile.",
                "current_mode": "socratic",
                "requested_mode": "socratic",
                "model_profile": "free",
                "topic": "Honesty and consequences",
                "turn_number": 1,
                "initial_assistant_message": initial_message,
            },
        )
        conversation_id = first_response.json()["conversation_id"]
        second_response = await client.post(
            "/api/v1/dialogue-turns",
            json={
                "conversation_id": conversation_id,
                "user_message": "Because trust depends on it.",
                "current_mode": "socratic",
                "requested_mode": "reflect",
                "model_profile": "deepseek",
                "topic": "Honesty and consequences",
                "turn_number": 2,
            },
        )
        detail_response = await client.get(f"/api/v1/dialogue-sessions/{conversation_id}")
        list_response = await client.get("/api/v1/dialogue-sessions?limit=8")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["conversation_id"] == conversation_id
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["turn_count"] == 2
    assert detail["current_mode"] == "reflect"
    assert detail["model_profile"] == "deepseek"
    assert [message["role"] for message in detail["messages"]] == [
        "assistant",
        "user",
        "assistant",
        "user",
        "assistant",
    ]
    assert detail["messages"][0]["body"] == initial_message
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["conversation_id"] == conversation_id
    assert list_response.json()["items"][0]["turn_count"] == 2


@pytest.mark.anyio
async def test_dialogue_session_turn_writes_are_idempotent() -> None:
    """Retrying one completed turn does not duplicate persisted messages."""

    payload = {
        "user_message": "A stable claim.",
        "current_mode": "socratic",
        "requested_mode": "socratic",
        "topic": "A stable topic",
        "turn_number": 1,
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first_response = await client.post("/api/v1/dialogue-turns", json=payload)
        conversation_id = first_response.json()["conversation_id"]
        payload["conversation_id"] = conversation_id
        duplicate_response = await client.post("/api/v1/dialogue-turns", json=payload)
        detail_response = await client.get(f"/api/v1/dialogue-sessions/{conversation_id}")

    assert duplicate_response.status_code == 200
    assert len(detail_response.json()["messages"]) == 2


@pytest.mark.anyio
async def test_missing_dialogue_session_returns_not_found() -> None:
    """Unknown session ids have an explicit recoverable response."""

    missing_id = "00000000-0000-0000-0000-000000000000"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/dialogue-sessions/{missing_id}")

    assert response.status_code == 404


class MockOpenAIProvider:
    """Route-test provider that returns a successful OpenAI-backed turn."""

    def __init__(self) -> None:
        self.prompt: str | None = None

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        self.prompt = request.prompt
        return ProviderResponse(
            assistant_message="OpenAI mocked response：我们继续检查这个理由。",
            provider="openai",
            model="gpt-5.6",
        )


class FailingOpenAIProvider:
    """Route-test provider that simulates a provider failure."""

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        raise RuntimeError("mock provider unavailable")


@pytest.mark.anyio
async def test_dialogue_turn_endpoint_returns_openai_provider_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Provider success is visible through response metadata."""

    provider = MockOpenAIProvider()
    monkeypatch.setattr(
        dialogue_routes,
        "dialogue_orchestrator",
        DialogueOrchestrator(dialogue_provider=provider),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/dialogue-turns",
            json={
                "user_message": "我认为诚实仍然值得坚持。",
                "current_mode": "socratic",
                "requested_mode": "socratic",
                "topic": "诚实与德性",
                "turn_number": 1,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assistant_message"] == "OpenAI mocked response：我们继续检查这个理由。"
    assert payload["provider"] == "openai"
    assert payload["provider_model"] == "gpt-5.6"
    assert payload["provider_fallback_reason"] is None
    assert provider.prompt is not None
    assert "不要编造引文、页码、章节或著作" in provider.prompt


@pytest.mark.anyio
async def test_dialogue_turn_endpoint_falls_back_when_provider_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Provider failure degrades to the deterministic message and exposes why."""

    monkeypatch.setattr(
        dialogue_routes,
        "dialogue_orchestrator",
        DialogueOrchestrator(dialogue_provider=FailingOpenAIProvider()),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/dialogue-turns",
            json={
                "user_message": "自由是否总是优先于安全？",
                "current_mode": "socratic",
                "requested_mode": "compare",
                "topic": "自由与安全",
                "turn_number": 1,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "compare"
    assert payload["provider"] == "deterministic"
    assert payload["provider_model"] is None
    assert "mock provider unavailable" in payload["provider_fallback_reason"]
    assert "比较时先对齐" in payload["assistant_message"]
