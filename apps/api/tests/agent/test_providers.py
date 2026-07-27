"""Tests for the dialogue provider boundary.

这些测试只验证本地边界与 mock OpenAI client，不访问真实网络。
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from pydantic import SecretStr

from app.agent.providers import (
    ChatCompletionsResource,
    ChatResource,
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
        self._chat = MockChatResource()

    @property
    def responses(self) -> ResponsesResource:
        return self._responses

    @property
    def chat(self) -> ChatResource:
        return self._chat

    @property
    def mock_responses(self) -> MockResponsesResource:
        return self._responses

    @property
    def mock_chat_completions(self) -> MockChatCompletionsResource:
        return self._chat.mock_completions


@dataclass
class MockChatMessage:
    """Tiny chat completion message object."""

    content: str


@dataclass
class MockChatChoice:
    """Tiny chat completion choice object."""

    message: MockChatMessage


@dataclass
class MockChatCompletionResponse:
    """Tiny response object matching the choices boundary."""

    choices: list[MockChatChoice]


class MockChatCompletionsResource:
    """Capture Chat Completions calls without network access."""

    def __init__(self) -> None:
        self.model: str | None = None
        self.messages: list[dict[str, str]] | None = None

    def create(self, *, model: str, messages: list[dict[str, str]]) -> MockChatCompletionResponse:
        self.model = model
        self.messages = messages
        return MockChatCompletionResponse(
            choices=[MockChatChoice(message=MockChatMessage(content="  mock DeepSeek text  "))]
        )


class MockChatResource:
    """Mock chat namespace with completions resource."""

    def __init__(self) -> None:
        self._completions = MockChatCompletionsResource()

    @property
    def completions(self) -> ChatCompletionsResource:
        return self._completions

    @property
    def mock_completions(self) -> MockChatCompletionsResource:
        return self._completions


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


def test_chat_completions_style_maps_to_assistant_text() -> None:
    """OpenAI-compatible Chat Completions output supports DeepSeek-style providers."""

    client = MockOpenAIClient()
    provider = OpenAIDialogueProvider(
        client=client,
        model="deepseek-v4-flash",
        api_style="chat_completions",
    )

    response = provider.generate(provider_request())

    assert client.mock_chat_completions.model == "deepseek-v4-flash"
    assert client.mock_chat_completions.messages == [
        {"role": "user", "content": "请以苏格拉底式方式回应。"}
    ]
    assert response.provider == "openai"
    assert response.model == "deepseek-v4-flash"
    assert response.assistant_message == "mock DeepSeek text"


def test_openai_base_url_is_passed_to_client_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    """A configured compatible relay URL is passed only through the backend client."""

    client = MockOpenAIClient()
    captured: dict[str, object] = {}

    def fake_create_openai_client(
        api_key: SecretStr,
        base_url: str | None = None,
    ) -> MockOpenAIClient:
        captured["api_key"] = api_key.get_secret_value()
        captured["base_url"] = base_url
        return client

    monkeypatch.setattr("app.agent.providers.create_openai_client", fake_create_openai_client)

    settings = PhilosophyOSSettings(
        model_profile="gpt",
        openai_api_key=SecretStr("test-relay-key"),
        openai_base_url="https://relay.example.com/v1",
        openai_api_style="responses",
        ai_provider="auto",
    )

    provider = select_dialogue_provider(settings)
    response = provider.generate(provider_request())

    assert captured == {
        "api_key": "test-relay-key",
        "base_url": "https://relay.example.com/v1",
    }
    assert response.provider == "openai"


def test_deepseek_profile_selects_chat_completions_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Provider selection routes DeepSeek settings into the Chat Completions style."""

    client = MockOpenAIClient()
    captured: dict[str, object] = {}

    def fake_create_openai_client(
        api_key: SecretStr,
        base_url: str | None = None,
    ) -> MockOpenAIClient:
        captured["api_key"] = api_key.get_secret_value()
        captured["base_url"] = base_url
        return client

    monkeypatch.setattr("app.agent.providers.create_openai_client", fake_create_openai_client)

    settings = PhilosophyOSSettings(
        model_profile="deepseek",
        deepseek_api_key=SecretStr("test-deepseek-key"),
        deepseek_base_url="https://api.deepseek.com",
        deepseek_model="deepseek-v4-flash",
        deepseek_api_style="chat_completions",
        ai_provider="auto",
    )

    provider = select_dialogue_provider(settings)
    response = provider.generate(provider_request())

    assert captured == {
        "api_key": "test-deepseek-key",
        "base_url": "https://api.deepseek.com",
    }
    assert client.mock_chat_completions.model == "deepseek-v4-flash"
    assert response.assistant_message == "mock DeepSeek text"


def test_free_profile_selects_chat_completions_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Provider selection routes the free model profile through Chat Completions."""

    client = MockOpenAIClient()
    captured: dict[str, object] = {}

    def fake_create_openai_client(
        api_key: SecretStr,
        base_url: str | None = None,
    ) -> MockOpenAIClient:
        captured["api_key"] = api_key.get_secret_value()
        captured["base_url"] = base_url
        return client

    monkeypatch.setattr("app.agent.providers.create_openai_client", fake_create_openai_client)

    settings = PhilosophyOSSettings(
        model_profile="free",
        free_api_key=SecretStr("test-free-key"),
        free_base_url="https://ark.cn-beijing.volces.com/api/v3",
        free_model="doubao-seed-2-0-lite-260428",
        free_api_style="chat_completions",
        ai_provider="auto",
    )

    provider = select_dialogue_provider(settings)
    response = provider.generate(provider_request())

    assert captured == {
        "api_key": "test-free-key",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
    }
    assert client.mock_chat_completions.model == "doubao-seed-2-0-lite-260428"
    assert response.assistant_message == "mock DeepSeek text"
