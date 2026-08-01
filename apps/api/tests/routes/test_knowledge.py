"""API tests for evidence-constrained knowledge answers."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.anyio
@pytest.mark.parametrize(
    "question",
    [
        "康德如何区分自然因果与实践自由？",
        "斯宾诺莎的自由是否只是认识必然？",
        "尼采如何批判自由意志？",
    ],
)
async def test_supported_philosophers_return_sources_without_invented_quotes(
    question: str,
) -> None:
    """The three initial profiles return evidence while keeping quote fields empty."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/knowledge-answers", json={"question": question})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "supported"
    assert payload["citations"]
    assert payload["claims"]
    assert {claim["category"] for claim in payload["claims"]} == {
        "primary",
        "research",
        "ai_inference",
    }
    assert all(citation["direct_quote"] is None for citation in payload["citations"])


@pytest.mark.anyio
async def test_wrong_work_attribution_is_corrected_before_answering() -> None:
    """The API corrects Nietzsche/Being and Time instead of accepting the premise."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/knowledge-answers",
            json={"question": "尼采在《存在与时间》哪里谈自由？"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "corrected"
    assert "海德格尔" in payload["correction"]
    assert "尼采" in payload["answer"]
    assert any(citation["author"] == "Martin Heidegger" for citation in payload["citations"])
    assert all(citation["direct_quote"] is None for citation in payload["citations"])


@pytest.mark.anyio
async def test_direct_quote_request_degrades_without_version_bound_quote_evidence() -> None:
    """A request for words and page numbers never falls back to model memory."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/knowledge-answers",
            json={"question": "请给出康德关于自由的原话和页码"},
        )

    payload = response.json()
    assert payload["status"] == "insufficient"
    assert "不会用模型记忆" in payload["evidence_note"]
    assert payload["citations"]
    assert all(citation["direct_quote"] is None for citation in payload["citations"])


@pytest.mark.anyio
async def test_concept_question_uses_reviewed_rag_sources() -> None:
    """Concept-level questions can synthesize across reviewed philosopher passages."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/knowledge-answers", json={"question": "决定论和自由意志是什么关系？"}
        )

    payload = response.json()
    assert payload["status"] == "supported"
    assert payload["citations"]
    assert payload["claims"]
    assert "决定论" in payload["answer"]


@pytest.mark.anyio
async def test_unknown_topic_returns_exploratory_model_guidance() -> None:
    """Unsupported content returns model-guided exploration without fake citations."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/knowledge-answers", json={"question": "德勒兹如何理解差异？"}
        )

    payload = response.json()
    assert payload["status"] == "exploratory"
    assert payload["citations"] == []
    assert payload["claims"] == []
    assert "探索性" in payload["evidence_note"]


@pytest.mark.anyio
async def test_citation_context_can_be_expanded() -> None:
    """Citation ids resolve to full context and missing ids return 404."""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        answer = await client.post(
            "/api/v1/knowledge-answers", json={"question": "斯宾诺莎如何理解自由？"}
        )
        citation_id = answer.json()["citations"][0]["citation_id"]
        citation = await client.get(f"/api/v1/citations/{citation_id}")
        missing = await client.get("/api/v1/citations/not-found")

    assert citation.status_code == 200
    assert citation.json()["context"]
    assert citation.json()["direct_quote"] is None
    assert missing.status_code == 404


def test_openapi_exposes_versioned_knowledge_resources() -> None:
    """The API contract uses plural, versioned REST resource paths."""

    paths = app.openapi()["paths"]
    assert "/api/v1/knowledge-answers" in paths
    assert "/api/v1/citations/{citation_id}" in paths
