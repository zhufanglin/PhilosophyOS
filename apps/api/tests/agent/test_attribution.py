"""Acceptance tests for conservative and reversible viewpoint attribution."""

from __future__ import annotations

from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.agent.attribution import AttributionEngine
from app.models.knowledge import Base
from app.models.memory import (
    AttributedClaim,
    AttributionBasis,
    AttributionSubject,
    DialogueMessage,
    DialogueRole,
)


@pytest.fixture
def session() -> Iterator[Session]:
    """Provide an isolated attribution database."""

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as database_session:
        yield database_session
    engine.dispose()


@pytest.fixture
def conversation_id() -> UUID:
    """Return one stable conversation boundary per test."""

    return uuid4()


def test_explicit_first_person_claim_enters_user_stance(
    session: Session, conversation_id: UUID
) -> None:
    """Only an explicit first-person proposition becomes a user viewpoint."""

    engine = AttributionEngine(session)
    result = engine.attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content="我认为自由必须包含承担责任。",
    )

    assert len(result.claims) == 1
    assert result.claims[0].subject is AttributionSubject.USER
    assert engine.active_user_claims(conversation_id) == result.claims


def test_third_party_report_never_enters_user_stance(
    session: Session, conversation_id: UUID
) -> None:
    """A friend's reported opinion remains separate from the user's position."""

    engine = AttributionEngine(session)
    result = engine.attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content="我朋友认为只要没有约束就是自由。",
    )

    assert result.claims[0].subject is AttributionSubject.THIRD_PARTY
    assert result.claims[0].subject_name == "朋友"
    assert engine.active_user_claims(conversation_id) == ()


def test_mixed_report_and_personal_response_are_split(
    session: Session, conversation_id: UUID
) -> None:
    """A mixed message does not let the reported view contaminate the user claim."""

    engine = AttributionEngine(session)
    result = engine.attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content="我朋友认为自由就是随心所欲，但我不同意。",
    )

    assert [claim.subject for claim in result.claims] == [
        AttributionSubject.THIRD_PARTY,
        AttributionSubject.USER,
    ]
    assert engine.active_user_claims(conversation_id) == (result.claims[1],)


def test_philosopher_statement_is_attributed_to_author(
    session: Session, conversation_id: UUID
) -> None:
    """A named philosopher's proposition is not stored as the user's view."""

    engine = AttributionEngine(session)
    result = engine.attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content="康德认为实践自由与道德责任相关。",
    )

    assert result.claims[0].subject is AttributionSubject.AUTHOR
    assert result.claims[0].subject_name == "伊曼努尔·康德"
    assert engine.active_user_claims(conversation_id) == ()


def test_assistant_text_is_attributed_by_message_role(
    session: Session, conversation_id: UUID
) -> None:
    """Assistant output remains visibly separate from every human viewpoint."""

    result = AttributionEngine(session).attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.ASSISTANT,
        content="可以把这个分歧理解为两种责任标准。",
    )

    assert result.claims[0].subject is AttributionSubject.ASSISTANT
    assert result.claims[0].basis is AttributionBasis.ROLE


def test_ambiguous_user_text_defaults_to_unknown(session: Session, conversation_id: UUID) -> None:
    """The engine does not invent user ownership for an unmarked statement."""

    engine = AttributionEngine(session)
    result = engine.attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content="自由与责任之间存在紧张关系。",
    )

    assert result.claims[0].subject is AttributionSubject.UNKNOWN
    assert result.claims[0].basis is AttributionBasis.UNCERTAIN
    assert engine.active_user_claims(conversation_id) == ()


def test_original_evidence_message_is_saved_verbatim(
    session: Session, conversation_id: UUID
) -> None:
    """Attribution keeps the exact source message and claim link."""

    raw_content = "  我觉得人的选择会受到历史条件影响。  "
    result = AttributionEngine(session).attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content=raw_content,
    )

    stored = session.get(DialogueMessage, result.message.id)
    assert stored is not None
    assert stored.content == raw_content
    assert result.claims[0].message_id == stored.id
    assert result.claims[0].evidence_message.content == raw_content


def test_user_correction_removes_wrong_user_attribution_without_erasing_evidence(
    session: Session, conversation_id: UUID
) -> None:
    """A correction deactivates the user claim while retaining both raw messages."""

    engine = AttributionEngine(session)
    initial = engine.attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content="我认为自由就是没有任何原因。",
    )
    original_message_id = initial.message.id
    correction = engine.correct_attribution(
        initial.claims[0].id,
        correction_text="更正：那不是我的观点，是我在转述别人的说法。",
        corrected_subject=AttributionSubject.THIRD_PARTY,
        corrected_subject_name="未具名第三方",
    )

    assert not correction.original_claim.is_active
    assert correction.original_claim.corrected_at is not None
    assert correction.corrected_claim.subject is AttributionSubject.THIRD_PARTY
    assert correction.corrected_claim.basis is AttributionBasis.CORRECTION
    assert engine.active_user_claims(conversation_id) == ()
    assert session.get(DialogueMessage, original_message_id).content == initial.message.content  # type: ignore[union-attr]
    assert correction.correction_message.content.startswith("更正")
    assert (
        session.scalar(
            select(func.count())
            .select_from(DialogueMessage)
            .where(DialogueMessage.conversation_id == conversation_id)
        )
        == 2
    )


def test_inactive_attribution_cannot_be_corrected_twice(
    session: Session, conversation_id: UUID
) -> None:
    """Repeated corrections must target the currently active replacement claim."""

    engine = AttributionEngine(session)
    initial = engine.attribute_message(
        conversation_id=conversation_id,
        role=DialogueRole.USER,
        content="我认为责任并不存在。",
    )
    engine.correct_attribution(
        initial.claims[0].id,
        correction_text="这不是我的立场。",
    )

    with pytest.raises(ValueError, match="already inactive"):
        engine.correct_attribution(
            initial.claims[0].id,
            correction_text="再次更正。",
        )


def test_blank_message_is_rejected_without_persistence(
    session: Session, conversation_id: UUID
) -> None:
    """Empty evidence never reaches the database."""

    with pytest.raises(ValueError, match="must not be blank"):
        AttributionEngine(session).attribute_message(
            conversation_id=conversation_id,
            role=DialogueRole.USER,
            content="   ",
        )

    assert session.scalar(select(func.count()).select_from(AttributedClaim)) == 0
