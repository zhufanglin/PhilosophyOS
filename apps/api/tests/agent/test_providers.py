"""Tests for the dialogue provider boundary.

这些测试只验证本地边界与 mock OpenAI client，不访问真实网络。
"""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import SecretStr

from app.agent.providers import (
    DeterministicDialogueProvider,
    OpenAIDialogueProvider,
    ProviderRequest,
    ResponsesResource,
    select_dialogue_provider,
)
from app.schemas.dialogue import DialogueMode
from app.settings import PhilosophyOSSettings


def provider_request() -> ProviderRequest:
    """Return a minimal provider request for boundary tests."""

    return ProviderRequest(
        user_message="我认为诚实仍然值得坚持。",
        mode=DialogueMode.SOCRATIC,
        topic="诚实与德性",
        turn_number=1,
        prompt="请以苏格拉底式方式回应。",
        deterministic_message="确定性降级回复",
    )


def test_missing_openai_key_uses_deterministic_provider() -> None:
    """Without a backend key, provider selection stays fully local."""

    settings = PhilosophyOSSettings(openai_api_key=None, ai_provider="auto")

    provider = select_dialogue_provider(settings)
    response = provider.generate(provider_request())

    assert isinstance(provider, DeterministicDialogueProvider)
    assert response.provider == "deterministic"
    assert response.assistant_message == "确定性降级回复"
    assert response.model is None


def test_explicit_deterministic_provider_ignores_key() -> None:
    """A developer can force deterministic mode even when a key is configured."""

    settings = PhilosophyOSSettings(
        openai_api_key=SecretStr("test-openai-key"),
        ai_provider="deterministic",
    )

    provider = select_dialogue_provider(settings)

    assert isinstance(provider, DeterministicDialogueProvider)


@dataclass
class MockOpenAIResponse:
    """Tiny response object matching the output_text boundary."""

    output_text: str


class MockResponsesResource:
    """Capture Responses API calls without network access."""

    def __init__(self) -> None:
        self.model: str | None = None
        self.input: str | None = None

    def create(self, *, model: str, input: str) -> MockOpenAIResponse:
        self.model = model
        self.input = input
        return MockOpenAIResponse(output_text="  mock OpenAI assistant text  ")


class MockOpenAIClient:
    """Mock client with the same shape as the official SDK boundary."""

    def __init__(self) -> None:
        self._responses = MockResponsesResource()

    @property
    def responses(self) -> ResponsesResource:
        return self._responses

    @property
    def mock_responses(self) -> MockResponsesResource:
        return self._responses


def test_mock_openai_response_maps_to_assistant_text() -> None:
    """OpenAI output_text is normalized into the provider response."""

    client = MockOpenAIClient()
    provider = OpenAIDialogueProvider(client=client, model="gpt-5.6")

    response = provider.generate(provider_request())

    assert client.mock_responses.model == "gpt-5.6"
    assert client.mock_responses.input == "请以苏格拉底式方式回应。"
    assert response.provider == "openai"
    assert response.model == "gpt-5.6"
    assert response.assistant_message == "mock OpenAI assistant text"
