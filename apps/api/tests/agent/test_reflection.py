"""Acceptance tests for editable reflection drafts and explicit memory confirmation."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from app.agent.reflection import (
    InMemoryReflectionRepository,
    ReflectionEvidence,
    ReflectionItem,
    ReflectionOrigin,
    ReflectionSection,
    ReflectionStatus,
    ReflectionWorkflow,
)
from app.models.memory import AttributionSubject


@pytest.fixture
def conversation_id() -> UUID:
    """Return an isolated conversation id."""

    return uuid4()


@pytest.fixture
def repository() -> InMemoryReflectionRepository:
    """Expose the memory boundary for acceptance assertions."""

    return InMemoryReflectionRepository()


@pytest.fixture
def workflow(repository: InMemoryReflectionRepository) -> ReflectionWorkflow:
    """Return a workflow backed by an observable repository."""

    return ReflectionWorkflow(repository)


def evidence(
    text: str, subject: AttributionSubject = AttributionSubject.USER
) -> ReflectionEvidence:
    """Build attributed source evidence for one reflection test."""

    return ReflectionEvidence(text=text, subject=subject, message_id=uuid4())


def item_for(draft_items: tuple[ReflectionItem, ...], section: ReflectionSection) -> ReflectionItem:
    """Return the first item in a section."""

    return next(item for item in draft_items if item.section is section)


def test_draft_contains_all_required_sections(
    workflow: ReflectionWorkflow, conversation_id: UUID
) -> None:
    """A completed dialogue produces the five review categories."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="诚实是否值得坚持？",
        evidence=(evidence("我认为诚实本身值得坚持。"), evidence("它维护人与人的信任。")),
    )

    assert {item.section for item in draft.items} == set(ReflectionSection)
    assert draft.status is ReflectionStatus.PENDING


def test_user_viewpoint_and_ai_suggestions_remain_distinct_in_data(
    workflow: ReflectionWorkflow, conversation_id: UUID
) -> None:
    """AI proposals can never be serialized as if the user originally stated them."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="诚实是否值得坚持？",
        evidence=(evidence("我认为诚实本身值得坚持。"),),
    )

    viewpoint = item_for(draft.items, ReflectionSection.VIEWPOINT)
    correction = item_for(draft.items, ReflectionSection.CONCEPT_CORRECTION)
    assert viewpoint.origin is ReflectionOrigin.USER
    assert viewpoint.evidence_message_ids
    assert correction.origin is ReflectionOrigin.AI_SUGGESTION
    assert correction.evidence_message_ids == ()


def test_third_party_report_is_excluded_from_user_summary(
    workflow: ReflectionWorkflow, conversation_id: UUID
) -> None:
    """Reported third-party opinions cannot become the current user viewpoint."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="什么是自由？",
        evidence=(evidence("我朋友认为自由就是随心所欲。", AttributionSubject.THIRD_PARTY),),
    )

    viewpoint = item_for(draft.items, ReflectionSection.VIEWPOINT)
    assert viewpoint.origin is ReflectionOrigin.UNRESOLVED
    assert "朋友" not in viewpoint.text


def test_generating_or_editing_a_draft_never_writes_long_term_memory(
    workflow: ReflectionWorkflow,
    repository: InMemoryReflectionRepository,
    conversation_id: UUID,
) -> None:
    """The memory gate remains closed throughout draft generation and revision."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="诚实是否值得坚持？",
        evidence=(evidence("我认为诚实本身值得坚持。"),),
    )
    viewpoint = item_for(draft.items, ReflectionSection.VIEWPOINT)
    workflow.revise_item(draft.id, viewpoint.id, "我认为诚实通常值得坚持，但并非没有例外。")

    assert repository.memory_for(conversation_id) == ()


def test_unresolved_viewpoint_requires_user_edit_before_selection(
    workflow: ReflectionWorkflow, conversation_id: UUID
) -> None:
    """An attribution placeholder cannot be silently confirmed as the user's view."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="什么是自由？",
        evidence=(),
    )
    viewpoint = item_for(draft.items, ReflectionSection.VIEWPOINT)

    with pytest.raises(ValueError, match="must be edited"):
        workflow.set_item_selected(draft.id, viewpoint.id, selected=True)

    revised = workflow.revise_item(draft.id, viewpoint.id, "我暂时认为自由需要可承担的选择。")
    revised_viewpoint = item_for(revised.items, ReflectionSection.VIEWPOINT)
    assert revised_viewpoint.origin is ReflectionOrigin.USER
    selected = workflow.set_item_selected(draft.id, viewpoint.id, selected=True)
    assert item_for(selected.items, ReflectionSection.VIEWPOINT).selected


def test_finalize_saves_only_explicitly_selected_items(
    workflow: ReflectionWorkflow,
    repository: InMemoryReflectionRepository,
    conversation_id: UUID,
) -> None:
    """Unchecked reasons and AI suggestions remain outside long-term memory."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="诚实是否值得坚持？",
        evidence=(evidence("我认为诚实本身值得坚持。"), evidence("它维护人与人的信任。")),
    )
    viewpoint = item_for(draft.items, ReflectionSection.VIEWPOINT)
    open_question = item_for(draft.items, ReflectionSection.OPEN_QUESTION)
    workflow.set_item_selected(draft.id, viewpoint.id, selected=True)
    workflow.set_item_selected(draft.id, open_question.id, selected=True)

    confirmed = workflow.finalize(draft.id)

    assert {item.id for item in confirmed.items} == {viewpoint.id, open_question.id}
    assert repository.memory_for(conversation_id) == (confirmed,)
    stored_draft = repository.get_draft(draft.id)
    assert stored_draft is not None
    assert stored_draft.status is ReflectionStatus.CONFIRMED


def test_ai_origin_survives_user_edit_and_confirmation(
    workflow: ReflectionWorkflow, conversation_id: UUID
) -> None:
    """Editing an AI suggestion does not relabel it as an original user claim."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="诚实是否值得坚持？",
        evidence=(evidence("我认为诚实本身值得坚持。"),),
    )
    viewpoint = item_for(draft.items, ReflectionSection.VIEWPOINT)
    suggestion = item_for(draft.items, ReflectionSection.RELATED_SUGGESTION)
    workflow.set_item_selected(draft.id, viewpoint.id, selected=True)
    revised = workflow.revise_item(draft.id, suggestion.id, "比较德性伦理与规则功利主义。")
    revised_suggestion = item_for(revised.items, ReflectionSection.RELATED_SUGGESTION)
    assert revised_suggestion.origin is ReflectionOrigin.AI_SUGGESTION
    workflow.set_item_selected(draft.id, suggestion.id, selected=True)

    confirmed = workflow.finalize(draft.id)
    saved_suggestion = next(item for item in confirmed.items if item.id == suggestion.id)
    assert saved_suggestion.origin is ReflectionOrigin.AI_SUGGESTION
    assert saved_suggestion.edited_by_user


def test_finalize_requires_selected_user_viewpoint(
    workflow: ReflectionWorkflow, conversation_id: UUID
) -> None:
    """Selecting an AI suggestion alone cannot create a long-term reflection."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="诚实是否值得坚持？",
        evidence=(evidence("我认为诚实本身值得坚持。"),),
    )
    suggestion = item_for(draft.items, ReflectionSection.OPEN_QUESTION)
    workflow.set_item_selected(draft.id, suggestion.id, selected=True)

    with pytest.raises(ValueError, match="user-owned viewpoint"):
        workflow.finalize(draft.id)


def test_confirmed_draft_cannot_be_modified(
    workflow: ReflectionWorkflow, conversation_id: UUID
) -> None:
    """Finalization closes the review draft against accidental mutation."""

    draft = workflow.create_draft(
        conversation_id=conversation_id,
        question="诚实是否值得坚持？",
        evidence=(evidence("我认为诚实本身值得坚持。"),),
    )
    viewpoint = item_for(draft.items, ReflectionSection.VIEWPOINT)
    workflow.set_item_selected(draft.id, viewpoint.id, selected=True)
    workflow.finalize(draft.id)

    with pytest.raises(ValueError, match="already confirmed"):
        workflow.revise_item(draft.id, viewpoint.id, "新的改写")
