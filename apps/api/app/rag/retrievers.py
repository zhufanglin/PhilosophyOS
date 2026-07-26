"""In-memory retrieval strategies used by the trustworthy RAG spike."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from time import perf_counter
from typing import Protocol
from uuid import UUID

from app.models.knowledge import (
    CopyrightStatus,
    EvidenceKind,
    ReviewStatus,
    SourceLevel,
    Tradition,
)

ASCII_TOKEN_PATTERN = re.compile(r"[a-z0-9_]+")
CJK_SEQUENCE_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]+")


@dataclass(frozen=True, slots=True)
class RetrievalDocument:
    """A source chunk plus the metadata required for filtering and citation."""

    chunk_id: UUID
    source_id: UUID
    title: str
    author: str
    content: str
    embedding: tuple[float, ...]
    tradition: Tradition
    entity_ids: frozenset[UUID]
    source_level: SourceLevel
    copyright_status: CopyrightStatus
    quote_allowed: bool
    review_status: ReviewStatus
    evidence_kind: EvidenceKind
    source_version: str | None
    location: str | None = None


@dataclass(frozen=True, slots=True)
class RetrievalFilters:
    """Hard metadata constraints applied before structured ranking."""

    tradition: Tradition | None = None
    entity_ids: frozenset[UUID] = field(default_factory=frozenset)
    source_levels: frozenset[SourceLevel] = field(default_factory=frozenset)
    require_published: bool = True


@dataclass(frozen=True, slots=True)
class RetrievalQuery:
    """Text, embedding, and optional structured retrieval constraints."""

    text: str
    embedding: tuple[float, ...]
    filters: RetrievalFilters = field(default_factory=RetrievalFilters)


@dataclass(frozen=True, slots=True)
class RetrievalHit:
    """A ranked document with inspectable component scores."""

    document: RetrievalDocument
    score: float
    vector_score: float
    lexical_score: float


class Retriever(Protocol):
    """Common interface for retrieval strategies in the experiment."""

    @property
    def name(self) -> str:
        """Return a stable strategy name for reports."""

    def search(self, query: RetrievalQuery, limit: int = 5) -> list[RetrievalHit]:
        """Return the highest-ranked matching documents."""


class PureVectorRetriever:
    """Baseline cosine-similarity retrieval without lexical or metadata constraints."""

    name = "pure_vector"

    def __init__(self, documents: list[RetrievalDocument]) -> None:
        self._documents = tuple(documents)

    def search(self, query: RetrievalQuery, limit: int = 5) -> list[RetrievalHit]:
        """Rank every document using cosine similarity only."""

        return _rank_documents(self._documents, query, limit=limit, vector_weight=1.0)


class HybridRetriever:
    """Combine cosine similarity with Chinese/ASCII lexical coverage."""

    name = "hybrid"

    def __init__(self, documents: list[RetrievalDocument], *, vector_weight: float = 0.65) -> None:
        if not 0.0 <= vector_weight <= 1.0:
            raise ValueError("vector_weight must be between 0 and 1")
        self._documents = tuple(documents)
        self._vector_weight = vector_weight

    def search(self, query: RetrievalQuery, limit: int = 5) -> list[RetrievalHit]:
        """Rank every document using vector and lexical evidence."""

        return _rank_documents(
            self._documents,
            query,
            limit=limit,
            vector_weight=self._vector_weight,
        )


class StructuredFilterRetriever:
    """Apply hard source/entity filters before hybrid scoring."""

    name = "structured_filter"

    def __init__(self, documents: list[RetrievalDocument], *, vector_weight: float = 0.65) -> None:
        if not 0.0 <= vector_weight <= 1.0:
            raise ValueError("vector_weight must be between 0 and 1")
        self._documents = tuple(documents)
        self._vector_weight = vector_weight

    def search(self, query: RetrievalQuery, limit: int = 5) -> list[RetrievalHit]:
        """Filter on reviewed metadata and then apply hybrid ranking."""

        candidates = tuple(
            document for document in self._documents if _matches_filters(document, query.filters)
        )
        return _rank_documents(
            candidates,
            query,
            limit=limit,
            vector_weight=self._vector_weight,
        )


@dataclass(frozen=True, slots=True)
class EvaluationCase:
    """One fixed query and the chunk expected to rank first."""

    case_id: str
    query: RetrievalQuery
    expected_chunk_id: UUID


@dataclass(frozen=True, slots=True)
class RetrievalMetrics:
    """Accuracy, ranking, latency, and failure details for one strategy."""

    strategy: str
    case_count: int
    hit_rate_at_1: float
    mean_reciprocal_rank: float
    p95_latency_ms: float
    failures: tuple[str, ...]


def evaluate_retriever(
    retriever: Retriever,
    cases: list[EvaluationCase],
    *,
    limit: int = 5,
    latency_repetitions: int = 100,
) -> RetrievalMetrics:
    """Evaluate ranking quality and local in-memory search latency."""

    if not cases:
        raise ValueError("at least one evaluation case is required")
    if latency_repetitions < 1:
        raise ValueError("latency_repetitions must be positive")

    reciprocal_ranks: list[float] = []
    failures: list[str] = []
    hit_count = 0
    for case in cases:
        hits = retriever.search(case.query, limit=limit)
        ranked_ids = [hit.document.chunk_id for hit in hits]
        if ranked_ids and ranked_ids[0] == case.expected_chunk_id:
            hit_count += 1
        try:
            rank = ranked_ids.index(case.expected_chunk_id) + 1
        except ValueError:
            reciprocal_ranks.append(0.0)
            failures.append(f"{case.case_id}: expected chunk was not retrieved")
        else:
            reciprocal_ranks.append(1.0 / rank)
            if rank != 1:
                failures.append(f"{case.case_id}: expected chunk ranked {rank}")

    timings: list[float] = []
    for _ in range(latency_repetitions):
        for case in cases:
            started_at = perf_counter()
            retriever.search(case.query, limit=limit)
            timings.append((perf_counter() - started_at) * 1000)
    timings.sort()
    p95_index = max(0, math.ceil(len(timings) * 0.95) - 1)

    return RetrievalMetrics(
        strategy=retriever.name,
        case_count=len(cases),
        hit_rate_at_1=hit_count / len(cases),
        mean_reciprocal_rank=sum(reciprocal_ranks) / len(cases),
        p95_latency_ms=timings[p95_index],
        failures=tuple(failures),
    )


def _rank_documents(
    documents: tuple[RetrievalDocument, ...],
    query: RetrievalQuery,
    *,
    limit: int,
    vector_weight: float,
) -> list[RetrievalHit]:
    """Score and deterministically rank documents."""

    if limit < 1:
        raise ValueError("limit must be positive")

    lexical_weight = 1.0 - vector_weight
    hits = []
    for document in documents:
        vector_score = cosine_similarity(query.embedding, document.embedding)
        lexical_score = lexical_coverage(query.text, document.content)
        hits.append(
            RetrievalHit(
                document=document,
                score=vector_weight * vector_score + lexical_weight * lexical_score,
                vector_score=vector_score,
                lexical_score=lexical_score,
            )
        )
    hits.sort(key=lambda hit: (-hit.score, hit.document.chunk_id.hex))
    return hits[:limit]


def cosine_similarity(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    """Return cosine similarity while rejecting incompatible embeddings."""

    if not left or not right:
        raise ValueError("embeddings must not be empty")
    if len(left) != len(right):
        raise ValueError("embedding dimensions must match")
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)


def lexical_coverage(query_text: str, document_text: str) -> float:
    """Return the fraction of query tokens present in a document."""

    query_tokens = _tokenize(query_text)
    if not query_tokens:
        return 0.0
    document_tokens = _tokenize(document_text)
    return len(query_tokens & document_tokens) / len(query_tokens)


def _tokenize(text: str) -> frozenset[str]:
    """Tokenize ASCII words and Chinese sequences without external dependencies."""

    normalized = text.casefold()
    tokens = set(ASCII_TOKEN_PATTERN.findall(normalized))
    for sequence in CJK_SEQUENCE_PATTERN.findall(normalized):
        tokens.add(sequence)
        if len(sequence) == 1:
            tokens.add(sequence)
        else:
            tokens.update(sequence[index : index + 2] for index in range(len(sequence) - 1))
    return frozenset(tokens)


def _matches_filters(document: RetrievalDocument, filters: RetrievalFilters) -> bool:
    """Return whether a document satisfies every requested hard filter."""

    if filters.tradition is not None and document.tradition is not filters.tradition:
        return False
    if filters.entity_ids and not filters.entity_ids.issubset(document.entity_ids):
        return False
    if filters.source_levels and document.source_level not in filters.source_levels:
        return False
    return not filters.require_published or document.review_status is ReviewStatus.PUBLISHED
