"""API tests for safe model profile status."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.main import app
from app.routes import model_profiles as model_profile_routes
from app.routes.model_profiles import (
    build_connection_test_response,
    build_model_profiles_response,
    safe_base_url,
)
from app.settings import PhilosophyOSSettings, settings
from app.storage.model_profile_repository import restore_settings


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
    assert profiles["gpt"]["base_url"] == "https://relay.example.com/v1"
    assert "free-secret" not in str(payload)
    assert "gpt-secret" not in str(payload)


def test_safe_base_url_removes_credentials_query_and_fragment() -> None:
    """Readable endpoint metadata cannot leak URL-embedded credentials."""

    assert (
        safe_base_url("https://user:secret@relay.example.com/v1?token=hidden#debug")
        == "https://relay.example.com/v1"
    )


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


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("profile", "model", "base_url", "api_style", "key_attribute"),
    [
        (
            "free",
            "doubao-seed-2-0-lite-260428",
            "https://ark.cn-beijing.volces.com/api/v3/",
            "responses",
            "free_api_key",
        ),
        (
            "gpt",
            "gpt-5.6",
            "https://api.openai.com/v1/",
            "responses",
            "gpt_api_key",
        ),
        (
            "deepseek",
            "deepseek-v4-pro",
            "https://api.deepseek.com/",
            "chat_completions",
            "deepseek_api_key",
        ),
    ],
)
async def test_model_profile_update_persists_key_without_echoing_it(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    profile: str,
    model: str,
    base_url: str,
    api_style: str,
    key_attribute: str,
) -> None:
    """Browser updates survive a settings reload while all responses stay key-free."""

    snapshot_path = str(tmp_path / "thought-snapshots.jsonl")
    monkeypatch.setattr(settings, "thought_snapshots_path", snapshot_path)
    secret = f"{profile}-local-test-secret"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            f"/api/v1/model-profiles/{profile}",
            json={
                "api_key": secret,
                "model": model,
                "base_url": base_url,
                "api_style": api_style,
                "selected": True,
            },
        )

    assert response.status_code == 200
    assert secret not in response.text
    assert "api_key" not in response.text.lower()
    assert response.json()["selected_profile"] == profile

    restored = PhilosophyOSSettings(thought_snapshots_path=snapshot_path)
    restore_settings(restored)
    assert restored.model_profile == profile
    selected = restored.model_copy(update={"model_profile": profile})
    assert selected.selected_model == model
    assert selected.selected_base_url == base_url.rstrip("/")
    restored_key = getattr(restored, key_attribute)
    assert restored_key is not None
    assert restored_key.get_secret_value() == secret


@pytest.mark.anyio
async def test_model_profile_update_rejects_invalid_base_url() -> None:
    """A malformed provider address returns an actionable validation response."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            "/api/v1/model-profiles/gpt",
            json={
                "model": "gpt-5.6",
                "base_url": "not-a-url",
                "api_style": "responses",
            },
        )

    assert response.status_code == 422
