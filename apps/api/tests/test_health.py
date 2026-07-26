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
