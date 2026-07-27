"""API tests for safe model profile status."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.main import app
from app.routes.model_profiles import build_model_profiles_response
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
