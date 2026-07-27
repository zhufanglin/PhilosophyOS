"""API tests for controlled philosophical dialogue turns."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.orchestrator import DialogueOrchestrator
from app.agent.providers import ProviderRequest, ProviderResponse
from app.main import app
from app.routes import dialogue as dialogue_routes


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
    assert "provider_fallback_reason" in properties


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
