"""API tests for safe model profile status."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.main import app
from app.routes import model_profiles as model_profile_routes
from app.routes.model_profiles import build_connection_test_response, build_model_profiles_response
from app.settings import PhilosophyOSSettings


@pytest.mark.anyio
async def test_model_profiles_endpoint_returns_key_free_status() -> None:
    """The browser can inspect model readiness without receiving secrets."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/model-profiles")

    assert response.status_code == 200
    payload = response.json()

    assert payload["selected_profile"] in {"free", "gpt", "deepseek"}
    assert {profile["profile"] for profile in payload["profiles"]} == {"free", "gpt", "deepseek"}
    assert "api_key" not in str(payload).lower()
    assert "secret" not in str(payload).lower()


def test_model_profile_status_marks_configured_keys_without_exposing_values() -> None:
    """Configured status is boolean and never includes secret material."""

    configured_settings = PhilosophyOSSettings(
        model_profile="free",
        free_api_key=SecretStr("free-secret"),
        gpt_api_key=SecretStr("gpt-secret"),
        gpt_model="gpt-5.6",
        gpt_base_url="https://relay.example.com/v1",
        deepseek_api_key=None,
    )

    payload = build_model_profiles_response(configured_settings).model_dump()
    profiles = {profile["profile"]: profile for profile in payload["profiles"]}

    assert profiles["free"]["configured"] is True
    assert profiles["gpt"]["configured"] is True
    assert profiles["deepseek"]["configured"] is False
    assert profiles["gpt"]["base_url_host"] == "relay.example.com"
    assert "free-secret" not in str(payload)
    assert "gpt-secret" not in str(payload)


def test_openapi_exposes_model_profiles_resource() -> None:
    """The API contract includes the safe model profile resource."""

    assert "/api/v1/model-profiles" in app.openapi()["paths"]


def test_connection_test_returns_not_configured_without_provider_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing API keys are reported locally without touching any upstream provider."""

    def fail_if_called(settings: PhilosophyOSSettings) -> object:
        raise AssertionError("provider should not be selected without an API key")

    monkeypatch.setattr(model_profile_routes, "select_dialogue_provider", fail_if_called)
    response = build_connection_test_response(
        "deepseek",
        PhilosophyOSSettings(deepseek_api_key=None),
    )

    assert response.ok is False
    assert response.code == "not_configured"
    assert response.profile == "deepseek"


def test_connection_test_reports_provider_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """A configured profile can be tested without exposing its key."""

    class SuccessfulProvider:
        def generate(self, request: object) -> object:
            return object()

    monkeypatch.setattr(
        model_profile_routes,
        "select_dialogue_provider",
        lambda settings: SuccessfulProvider(),
    )

    response = build_connection_test_response(
        "free",
        PhilosophyOSSettings(free_api_key=SecretStr("free-secret")),
    )

    assert response.ok is True
    assert response.code == "ok"
    assert "secret" not in response.model_dump_json()


@pytest.mark.parametrize(
    ("status_code", "expected_code"),
    [
        (401, "authentication_failed"),
        (403, "authentication_failed"),
        (404, "model_not_found"),
        (429, "rate_limited"),
        (504, "timeout"),
    ],
)
def test_connection_test_classifies_safe_error_codes(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    expected_code: str,
) -> None:
    """Upstream failures are mapped to safe diagnostic codes and messages."""

    class UpstreamError(Exception):
        def __init__(self) -> None:
            self.status_code = status_code

    class FailingProvider:
        def generate(self, request: object) -> object:
            raise UpstreamError()

    monkeypatch.setattr(
        model_profile_routes,
        "select_dialogue_provider",
        lambda settings: FailingProvider(),
    )

    response = build_connection_test_response(
        "gpt",
        PhilosophyOSSettings(openai_api_key=SecretStr("gpt-secret")),
    )

    assert response.ok is False
    assert response.code == expected_code
    assert "gpt-secret" not in response.model_dump_json()


@pytest.mark.anyio
async def test_connection_test_endpoint_rejects_unknown_profile() -> None:
    """Path validation rejects unknown model profile names."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/model-profiles/unknown/test-connection")

    assert response.status_code == 422
