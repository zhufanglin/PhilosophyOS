"""REST resources for evidence-constrained knowledge answers and citations."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, Field

from app.models.knowledge import SourceLevel
from app.schemas.dialogue import ModelProfile
from app.services.answer import (
    AnswerResult,
    AnswerStatus,
    CitationRecord,
    EvidenceCategory,
    knowledge_answer_service,
)
from app.settings import settings

router = APIRouter(prefix="/api/v1", tags=["knowledge"])


class KnowledgeAnswerRequest(BaseModel):
    """Question submitted to the reviewed local knowledge corpus."""

    question: str = Field(min_length=2, max_length=1000)
    model_profile: ModelProfile | None = None


class ClaimResponse(BaseModel):
    """One response claim with inspectable evidence ids."""

    model_config = ConfigDict(from_attributes=True)

    text: str
    category: EvidenceCategory
    citation_ids: tuple[str, ...]


class CitationResponse(BaseModel):
    """Citation summary included with a knowledge answer."""

    model_config = ConfigDict(from_attributes=True)

    citation_id: str
    category: EvidenceCategory
    title: str
    author: str
    source_level: SourceLevel
    source_version: str
    location: str | None
    context_preview: str
    canonical_url: str | None
    direct_quote: str | None


class CitationDetailResponse(BaseModel):
    """Expanded source context for one citation resource."""

    model_config = ConfigDict(from_attributes=True)

    citation_id: str
    category: EvidenceCategory
    title: str
    author: str
    source_level: SourceLevel
    source_version: str
    location: str | None
    context: str
    canonical_url: str | None
    direct_quote: str | None


class KnowledgeAnswerResponse(BaseModel):
    """Evidence status, answer, claims, and expandable citations."""

    question: str
    status: AnswerStatus
    answer: str
    correction: str | None
    evidence_note: str
    claims: tuple[ClaimResponse, ...]
    citations: tuple[CitationResponse, ...]


def _citation_summary(citation: CitationRecord) -> CitationResponse:
    """Create a compact citation while retaining all policy-relevant metadata."""

    preview = citation.context
    if len(preview) > 120:
        preview = f"{preview[:117]}..."
    return CitationResponse(
        citation_id=citation.citation_id,
        category=citation.category,
        title=citation.title,
        author=citation.author,
        source_level=citation.source_level,
        source_version=citation.source_version,
        location=citation.location,
        context_preview=preview,
        canonical_url=citation.canonical_url,
        direct_quote=citation.direct_quote,
    )


def _answer_response(result: AnswerResult) -> KnowledgeAnswerResponse:
    """Map the service result to the stable public API contract."""

    return KnowledgeAnswerResponse(
        question=result.question,
        status=result.status,
        answer=result.answer,
        correction=result.correction,
        evidence_note=result.evidence_note,
        claims=tuple(ClaimResponse.model_validate(claim) for claim in result.claims),
        citations=tuple(_citation_summary(citation) for citation in result.citations),
    )


@router.post(
    "/knowledge-answers",
    response_model=KnowledgeAnswerResponse,
    status_code=status.HTTP_200_OK,
    summary="Create an evidence-constrained knowledge answer",
)
async def create_knowledge_answer(request: KnowledgeAnswerRequest) -> KnowledgeAnswerResponse:
    """Return reviewed evidence or an explicit insufficient-evidence response."""

    return _answer_response(
        knowledge_answer_service.answer(
            request.question,
            current_settings=settings,
            model_profile=request.model_profile,
        )
    )


@router.get(
    "/citations/{citation_id}",
    response_model=CitationDetailResponse,
    summary="Expand one citation context",
)
async def get_citation(
    citation_id: Annotated[
        str,
        Path(min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$"),
    ],
) -> CitationDetailResponse:
    """Return full reviewed context without expanding quotation permissions."""

    citation = knowledge_answer_service.get_citation(citation_id)
    if citation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="citation not found")
    return CitationDetailResponse.model_validate(citation)
