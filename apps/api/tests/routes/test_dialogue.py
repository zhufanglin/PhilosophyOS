"""API tests for controlled philosophical dialogue turns."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


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
