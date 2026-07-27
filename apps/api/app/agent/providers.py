"""Dialogue model provider boundary for deterministic and OpenAI-backed replies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol, cast

from pydantic import SecretStr

from app.schemas.dialogue import DialogueMode
from app.settings import PhilosophyOSSettings


@dataclass(frozen=True, slots=True)
class ProviderRequest:
    """Provider-ready turn context.

    Later tasks will replace ``prompt`` with a tested PhilosophyOS prompt builder.
    ``deterministic_message`` keeps local fallback explicit and testable.
    """

    user_message: str
    mode: DialogueMode
    topic: str | None
    turn_number: int
    prompt: str
    deterministic_message: str


@dataclass(frozen=True, slots=True)
class ProviderResponse:
    """Provider output normalized for the orchestrator."""

    assistant_message: str
    provider: Literal["deterministic", "openai"]
    model: str | None = None


class DialogueProvider(Protocol):
    """Minimal provider contract used by the dialogue orchestrator."""

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Generate one assistant turn."""


class DeterministicDialogueProvider:
    """Return the already policy-checked deterministic assistant message."""

    name: Literal["deterministic"] = "deterministic"

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Return fallback text without network access."""

        return ProviderResponse(
            assistant_message=request.deterministic_message,
            provider=self.name,
            model=None,
        )


class ResponsesResource(Protocol):
    """Small subset of the OpenAI Responses API used by this app."""

    def create(self, *, model: str, input: str) -> object:
        """Create a non-streaming response."""


class OpenAIClient(Protocol):
    """Structural boundary for the official OpenAI Python client."""

    @property
    def responses(self) -> ResponsesResource:
        """Return the Responses API resource."""


class OpenAIDialogueProvider:
    """Generate assistant text through the OpenAI Responses API."""

    name: Literal["openai"] = "openai"

    def __init__(self, client: OpenAIClient, model: str) -> None:
        self._client = client
        self._model = model

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Call the Responses API and normalize its text output."""

        response = self._client.responses.create(model=self._model, input=request.prompt)
        output_text = getattr(response, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            raise ValueError("OpenAI response did not include output_text")

        return ProviderResponse(
            assistant_message=output_text.strip(),
            provider=self.name,
            model=self._model,
        )


def create_openai_client(api_key: SecretStr, base_url: str | None = None) -> OpenAIClient:
    """Create the OpenAI client only when a backend key is available."""

    from openai import OpenAI

    if base_url is not None:
        return cast(OpenAIClient, OpenAI(api_key=api_key.get_secret_value(), base_url=base_url))

    return cast(OpenAIClient, OpenAI(api_key=api_key.get_secret_value()))


def select_dialogue_provider(settings: PhilosophyOSSettings) -> DialogueProvider:
    """Choose the configured provider, falling back locally when no key is present."""

    if settings.ai_provider == "deterministic" or settings.openai_api_key is None:
        return DeterministicDialogueProvider()

    return OpenAIDialogueProvider(
        client=create_openai_client(settings.openai_api_key, settings.openai_base_url),
        model=settings.openai_model,
    )
