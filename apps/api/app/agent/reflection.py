"""Editable reflection drafts with an explicit long-term-memory confirmation gate."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from app.models.memory import AttributionSubject


class ReflectionSection(StrEnum):
    """The five reviewable parts of a completed philosophical dialogue."""

    VIEWPOINT = "viewpoint"
    REASON = "reason"
    CONCEPT_CORRECTION = "concept_correction"
    OPEN_QUESTION = "open_question"
    RELATED_SUGGESTION = "related_suggestion"


class ReflectionOrigin(StrEnum):
    """Whether content came from the user, AI, or unresolved attribution."""

    USER = "user"
    AI_SUGGESTION = "ai_suggestion"
    UNRESOLVED = "unresolved"


class ReflectionStatus(StrEnum):
    """Lifecycle of a generated reflection."""

    PENDING = "pending"
    CONFIRMED = "confirmed"


@dataclass(frozen=True, slots=True)
class ReflectionEvidence:
    """One attributed proposition used to construct the reflection draft."""

    text: str
    subject: AttributionSubject
    message_id: UUID


@dataclass(frozen=True, slots=True)
class ReflectionItem:
    """One independently editable and confirmable reflection field."""

    id: UUID
    section: ReflectionSection
    text: str
    origin: ReflectionOrigin
    evidence_message_ids: tuple[UUID, ...] = ()
    selected: bool = False
    edited_by_user: bool = False
    rejected: bool = False
    decision_reason: str | None = None


@dataclass(frozen=True, slots=True)
class ReflectionDraft:
    """A review-only draft that has not entered long-term memory."""

    id: UUID
    conversation_id: UUID
    question: str
    items: tuple[ReflectionItem, ...]
    status: ReflectionStatus = ReflectionStatus.PENDING


@dataclass(frozen=True, slots=True)
class ConfirmedReflection:
    """Only the explicitly selected subset persisted as long-term memory."""

    id: UUID
    draft_id: UUID
    conversation_id: UUID
    question: str
    items: tuple[ReflectionItem, ...]
    confirmed_at: datetime


class InMemoryReflectionRepository:
    """Repository boundary used until the persistent viewpoint store is added in 4.1."""

    def __init__(self) -> None:
        self._drafts: dict[UUID, ReflectionDraft] = {}
        self._confirmed: list[ConfirmedReflection] = []

    def save_draft(self, draft: ReflectionDraft) -> None:
        """Store or update a review draft outside long-term memory."""

        self._drafts[draft.id] = draft

    def get_draft(self, draft_id: UUID) -> ReflectionDraft | None:
        """Return one review draft if it exists."""

        return self._drafts.get(draft_id)

    def save_confirmed(self, reflection: ConfirmedReflection) -> None:
        """Append an explicitly finalized reflection to long-term memory."""

        self._confirmed.append(reflection)

    def memory_for(self, conversation_id: UUID) -> tuple[ConfirmedReflection, ...]:
        """Return confirmed memory only, never pending drafts."""

        return tuple(
            reflection
            for reflection in self._confirmed
            if reflection.conversation_id == conversation_id
        )


class ReflectionWorkflow:
    """Generate, edit, select, and explicitly finalize a dialogue reflection."""

    def __init__(self, repository: InMemoryReflectionRepository | None = None) -> None:
        self.repository = repository or InMemoryReflectionRepository()

    def create_draft(
        self,
        *,
        conversation_id: UUID,
        question: str,
        evidence: tuple[ReflectionEvidence, ...],
    ) -> ReflectionDraft:
        """Create all review sections without writing anything to long-term memory."""

        normalized_question = question.strip()
        if not normalized_question:
            raise ValueError("question must not be blank")

        user_evidence = tuple(
            item
            for item in evidence
            if item.subject is AttributionSubject.USER and item.text.strip()
        )
        if user_evidence:
            viewpoint = _evidence_item(ReflectionSection.VIEWPOINT, user_evidence[0])
            reasons = tuple(
                _evidence_item(ReflectionSection.REASON, item) for item in user_evidence[1:]
            ) or (
                _unresolved_item(
                    ReflectionSection.REASON,
                    "尚未从对话中识别出明确理由，请补充或修改。",
                ),
            )
        else:
            viewpoint = _unresolved_item(
                ReflectionSection.VIEWPOINT,
                "尚未识别出明确的用户观点，请用自己的话补充。",
            )
            reasons = (
                _unresolved_item(
                    ReflectionSection.REASON,
                    "尚未识别出明确理由，请补充或修改。",
                ),
            )

        items = (
            viewpoint,
            *reasons,
            _ai_item(
                ReflectionSection.CONCEPT_CORRECTION,
                "把“诚实”区分为不说假话、完整披露和忠于承诺，避免把不同义务混为一谈。",
            ),
            _ai_item(
                ReflectionSection.OPEN_QUESTION,
                "当诚实会伤害无辜者时，例外的判断标准应由什么决定？",
            ),
            _ai_item(
                ReflectionSection.RELATED_SUGGESTION,
                "比较苏格拉底的德性立场与结果论对行动后果的衡量。",
            ),
        )
        draft = ReflectionDraft(
            id=uuid4(),
            conversation_id=conversation_id,
            question=normalized_question,
            items=items,
        )
        self.repository.save_draft(draft)
        return draft

    def revise_item(self, draft_id: UUID, item_id: UUID, text: str) -> ReflectionDraft:
        """Apply a user edit while preserving whether the original proposal came from AI."""

        normalized_text = text.strip()
        if not normalized_text:
            raise ValueError("reflection item text must not be blank")
        draft = self._pending_draft(draft_id)
        current = _find_item(draft, item_id)
        origin = (
            ReflectionOrigin.USER
            if current.origin is ReflectionOrigin.UNRESOLVED
            else current.origin
        )
        revised = replace(
            current,
            text=normalized_text,
            origin=origin,
            edited_by_user=True,
        )
        updated = _replace_item(draft, revised)
        self.repository.save_draft(updated)
        return updated

    def set_item_selected(
        self,
        draft_id: UUID,
        item_id: UUID,
        *,
        selected: bool,
    ) -> ReflectionDraft:
        """Record an explicit per-item confirmation choice in the pending draft."""

        draft = self._pending_draft(draft_id)
        current = _find_item(draft, item_id)
        if selected and current.origin is ReflectionOrigin.UNRESOLVED:
            raise ValueError("unresolved content must be edited before confirmation")
        updated = _replace_item(
            draft,
            replace(
                current,
                selected=selected,
                rejected=False if selected else current.rejected,
            ),
        )
        self.repository.save_draft(updated)
        return updated

    def reject_item(self, draft_id: UUID, item_id: UUID, reason: str) -> ReflectionDraft:
        """Record that the user rejected one AI suggestion or follow-up question."""

        normalized_reason = reason.strip()
        if not normalized_reason:
            raise ValueError("rejection reason must not be blank")
        draft = self._pending_draft(draft_id)
        current = _find_item(draft, item_id)
        updated = _replace_item(
            draft,
            replace(
                current,
                selected=False,
                rejected=True,
                decision_reason=normalized_reason,
            ),
        )
        self.repository.save_draft(updated)
        return updated

    def finalize(self, draft_id: UUID) -> ConfirmedReflection:
        """Persist only explicitly selected items after the user confirms a viewpoint."""

        draft = self._pending_draft(draft_id)
        selected_items = tuple(item for item in draft.items if item.selected)
        has_user_viewpoint = any(
            item.section is ReflectionSection.VIEWPOINT
            and item.origin is ReflectionOrigin.USER
            and item.selected
            for item in draft.items
        )
        if not has_user_viewpoint:
            raise ValueError("a user-owned viewpoint must be confirmed before finalizing")

        confirmed = ConfirmedReflection(
            id=uuid4(),
            draft_id=draft.id,
            conversation_id=draft.conversation_id,
            question=draft.question,
            items=selected_items,
            confirmed_at=datetime.now(UTC),
        )
        self.repository.save_draft(replace(draft, status=ReflectionStatus.CONFIRMED))
        self.repository.save_confirmed(confirmed)
        return confirmed

    def _pending_draft(self, draft_id: UUID) -> ReflectionDraft:
        """Return a mutable-stage draft or reject missing/finalized records."""

        draft = self.repository.get_draft(draft_id)
        if draft is None:
            raise ValueError("reflection draft does not exist")
        if draft.status is ReflectionStatus.CONFIRMED:
            raise ValueError("reflection draft is already confirmed")
        return draft


def _evidence_item(section: ReflectionSection, evidence: ReflectionEvidence) -> ReflectionItem:
    """Build one user-owned draft item linked to its source message."""

    return ReflectionItem(
        id=uuid4(),
        section=section,
        text=evidence.text.strip(),
        origin=ReflectionOrigin.USER,
        evidence_message_ids=(evidence.message_id,),
    )


def _unresolved_item(section: ReflectionSection, text: str) -> ReflectionItem:
    """Build a placeholder that cannot be confirmed until the user edits it."""

    return ReflectionItem(
        id=uuid4(),
        section=section,
        text=text,
        origin=ReflectionOrigin.UNRESOLVED,
    )


def _ai_item(
    section: ReflectionSection,
    text: str,
    *,
    decision_reason: str | None = None,
) -> ReflectionItem:
    """Build an AI suggestion that remains distinguishable after user edits."""

    followup_reason = decision_reason
    if followup_reason is None and section is ReflectionSection.OPEN_QUESTION:
        followup_reason = (
            "\u8fd9\u6761\u8ffd\u95ee\u4fdd\u7559\u4e86\u672c\u6b21\u5bf9\u8bdd\u5c1a\u672a\u89e3\u5f00\u7684\u5224\u65ad\u6807\u51c6\uff0c"
            "\u9002\u5408\u4e0b\u6b21\u7ee7\u7eed\u68c0\u9a8c\u3002"
        )

    return ReflectionItem(
        id=uuid4(),
        section=section,
        text=text,
        origin=ReflectionOrigin.AI_SUGGESTION,
        decision_reason=followup_reason,
    )


def _find_item(draft: ReflectionDraft, item_id: UUID) -> ReflectionItem:
    """Resolve one item inside a draft."""

    item = next((candidate for candidate in draft.items if candidate.id == item_id), None)
    if item is None:
        raise ValueError("reflection item does not exist")
    return item


def _replace_item(draft: ReflectionDraft, item: ReflectionItem) -> ReflectionDraft:
    """Return a draft with one item immutably replaced."""

    return replace(
        draft,
        items=tuple(item if current.id == item.id else current for current in draft.items),
    )
