"""Tests for public system endpoints."""

import asyncio

from httpx import ASGITransport, AsyncClient

from app.main import app


def test_health_returns_service_metadata() -> None:
    """The health endpoint reports a stable, data-free status payload."""

    async def request_health() -> tuple[int, dict[str, str]]:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")
        return response.status_code, response.json()

    status_code, payload = asyncio.run(request_health())

    assert status_code == 200
    assert payload == {
        "status": "ok",
        "service": "philosophyos-api",
        "version": "0.1.0",
    }


def test_local_vite_5174_is_allowed_for_dialogue_preflight() -> None:
    """The alternate local Vite port can call the dialogue API from a browser."""

    async def request_preflight() -> tuple[int, str | None]:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.options(
                "/api/v1/dialogue-turns",
                headers={
                    "Origin": "http://127.0.0.1:5174",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
        return response.status_code, response.headers.get("access-control-allow-origin")

    status_code, allow_origin = asyncio.run(request_preflight())

    assert status_code == 200
    assert allow_origin == "http://127.0.0.1:5174"
