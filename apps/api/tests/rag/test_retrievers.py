"""Regression tests for retrieval strategies and citation blockers."""

from __future__ import annotations

from dataclasses import replace
from uuid import UUID, uuid5

import pytest

from app.models.knowledge import (
    CopyrightStatus,
    EvidenceKind,
    ReviewStatus,
    SourceLevel,
    Tradition,
)
from app.rag.citations import (
    CitationBlockReason,
    CitationPolicyError,
    build_direct_quote_citation,
    validate_direct_quote,
)
from app.rag.retrievers import (
    EvaluationCase,
    HybridRetriever,
    PureVectorRetriever,
    RetrievalDocument,
    RetrievalFilters,
    RetrievalQuery,
    StructuredFilterRetriever,
    evaluate_retriever,
)

TEST_NAMESPACE = UUID("e04f4aab-1609-5658-9bd0-960375750557")
KANT_ID = uuid5(TEST_NAMESPACE, "kant")
SPINOZA_ID = uuid5(TEST_NAMESPACE, "spinoza")
NIETZSCHE_ID = uuid5(TEST_NAMESPACE, "nietzsche")
HUME_ID = uuid5(TEST_NAMESPACE, "hume")


def identifier(value: str) -> UUID:
    """Create stable identifiers for retrieval fixtures."""

    return uuid5(TEST_NAMESPACE, value)


def document(
    slug: str,
    content: str,
    embedding: tuple[float, ...],
    entity_id: UUID,
    **overrides: object,
) -> RetrievalDocument:
    """Build a valid, quotable S1 retrieval fixture."""

    values: dict[str, object] = {
        "chunk_id": identifier(f"chunk:{slug}"),
        "source_id": identifier(f"source:{slug}"),
        "title": f"测试原典：{slug}",
        "author": slug,
        "content": content,
        "embedding": embedding,
        "tradition": Tradition.WESTERN,
        "entity_ids": frozenset({entity_id}),
        "source_level": SourceLevel.S1,
        "copyright_status": CopyrightStatus.APPROVED,
        "quote_allowed": True,
        "review_status": ReviewStatus.PUBLISHED,
        "evidence_kind": EvidenceKind.DIRECT_QUOTE,
        "source_version": "测试校勘本 v1",
        "location": "测试章节 1",
    }
    values.update(overrides)
    return RetrievalDocument(**values)  # type: ignore[arg-type]


@pytest.fixture
def corpus() -> list[RetrievalDocument]:
    """Return a small corpus with one intentional semantic collision."""

    return [
        document(
            "kant",
            "康德区分自然因果与实践自由，并讨论实践理性的设准。",
            (1.0, 0.0, 0.0),
            KANT_ID,
        ),
        document(
            "spinoza",
            "斯宾诺莎把自由理解为依据自身本性的必然性而行动。",
            (0.99, 0.01, 0.0),
            SPINOZA_ID,
        ),
        document(
            "nietzsche",
            "尼采通过道德谱系追问价值评价的历史条件。",
            (0.0, 1.0, 0.0),
            NIETZSCHE_ID,
        ),
        document(
            "hume",
            "休谟讨论因果观念如何来自经验中的恒常结合。",
            (0.0, 0.0, 1.0),
            HUME_ID,
        ),
    ]


def evaluation_cases(corpus: list[RetrievalDocument]) -> list[EvaluationCase]:
    """Build the fixed accuracy set used by the spike report."""

    chunks = {item.author: item.chunk_id for item in corpus}
    return [
        EvaluationCase(
            case_id="spinoza_freedom_collision",
            query=RetrievalQuery(
                text="斯宾诺莎如何理解自由",
                embedding=(1.0, 0.0, 0.0),
                filters=RetrievalFilters(
                    tradition=Tradition.WESTERN,
                    entity_ids=frozenset({SPINOZA_ID}),
                ),
            ),
            expected_chunk_id=chunks["spinoza"],
        ),
        EvaluationCase(
            case_id="kant_freedom",
            query=RetrievalQuery(
                text="康德的实践自由",
                embedding=(1.0, 0.0, 0.0),
                filters=RetrievalFilters(entity_ids=frozenset({KANT_ID})),
            ),
            expected_chunk_id=chunks["kant"],
        ),
        EvaluationCase(
            case_id="nietzsche_genealogy",
            query=RetrievalQuery(
                text="尼采的道德谱系",
                embedding=(0.0, 1.0, 0.0),
                filters=RetrievalFilters(entity_ids=frozenset({NIETZSCHE_ID})),
            ),
            expected_chunk_id=chunks["nietzsche"],
        ),
        EvaluationCase(
            case_id="hume_causality",
            query=RetrievalQuery(
                text="休谟如何解释因果",
                embedding=(0.0, 0.0, 1.0),
                filters=RetrievalFilters(entity_ids=frozenset({HUME_ID})),
            ),
            expected_chunk_id=chunks["hume"],
        ),
    ]


def test_three_retrieval_strategies_expose_expected_tradeoffs(
    corpus: list[RetrievalDocument],
) -> None:
    """Hybrid resolves lexical collisions and structured filtering is deterministic."""

    cases = evaluation_cases(corpus)
    vector_metrics = evaluate_retriever(PureVectorRetriever(corpus), cases)
    hybrid_metrics = evaluate_retriever(HybridRetriever(corpus), cases)
    structured_metrics = evaluate_retriever(StructuredFilterRetriever(corpus), cases)

    assert vector_metrics.hit_rate_at_1 == 0.75
    assert vector_metrics.failures == ("spinoza_freedom_collision: expected chunk ranked 2",)
    assert hybrid_metrics.hit_rate_at_1 == 1.0
    assert structured_metrics.hit_rate_at_1 == 1.0
    assert structured_metrics.failures == ()
    assert structured_metrics.p95_latency_ms < 10_000


def test_structured_filter_removes_wrong_entity_and_unpublished_chunks(
    corpus: list[RetrievalDocument],
) -> None:
    """Hard filters run before ranking and do not leak disallowed candidates."""

    unpublished = replace(
        corpus[1],
        chunk_id=identifier("chunk:spinoza-draft"),
        review_status=ReviewStatus.DRAFT,
    )
    retriever = StructuredFilterRetriever([corpus[0], corpus[1], unpublished])
    query = RetrievalQuery(
        text="自由",
        embedding=(1.0, 0.0, 0.0),
        filters=RetrievalFilters(entity_ids=frozenset({SPINOZA_ID})),
    )

    hits = retriever.search(query)

    assert [hit.document.chunk_id for hit in hits] == [corpus[1].chunk_id]


@pytest.mark.parametrize(
    ("overrides", "quote", "expected_reason"),
    [
        ({"review_status": ReviewStatus.DRAFT}, "自由", CitationBlockReason.CHUNK_NOT_PUBLISHED),
        (
            {"evidence_kind": EvidenceKind.PARAPHRASE},
            "自由",
            CitationBlockReason.NOT_DIRECT_QUOTE_EVIDENCE,
        ),
        ({"source_level": SourceLevel.S2}, "自由", CitationBlockReason.SOURCE_NOT_PRIMARY),
        ({"source_version": None}, "自由", CitationBlockReason.SOURCE_VERSION_MISSING),
        (
            {"copyright_status": CopyrightStatus.RIGHTS_REVIEW},
            "自由",
            CitationBlockReason.RIGHTS_NOT_APPROVED,
        ),
        ({"quote_allowed": False}, "自由", CitationBlockReason.QUOTE_NOT_ALLOWED),
        ({}, "模型编造的句子", CitationBlockReason.QUOTE_NOT_EXACT),
        ({}, "", CitationBlockReason.EMPTY_QUOTE),
    ],
)
def test_direct_quote_blockers(
    corpus: list[RetrievalDocument],
    overrides: dict[str, object],
    quote: str,
    expected_reason: CitationBlockReason,
) -> None:
    """Every citation blocker returns a stable reason and prevents construction."""

    candidate = replace(corpus[0], **overrides)  # type: ignore[arg-type]
    validation = validate_direct_quote(candidate, quote)

    assert not validation.allowed
    assert validation.reason is expected_reason
    with pytest.raises(CitationPolicyError) as error:
        build_direct_quote_citation(candidate, quote)
    assert error.value.reason is expected_reason


def test_valid_direct_quote_is_bound_to_exact_version_and_location(
    corpus: list[RetrievalDocument],
) -> None:
    """A valid exact quote produces complete, version-specific citation metadata."""

    quote = "康德区分自然因果与实践自由"
    citation = build_direct_quote_citation(corpus[0], quote)

    assert citation.quote == quote
    assert citation.source_version == "测试校勘本 v1"
    assert citation.location == "测试章节 1"
    assert citation.chunk_id == corpus[0].chunk_id
