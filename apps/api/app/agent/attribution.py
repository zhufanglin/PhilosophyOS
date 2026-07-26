"""Conservative viewpoint-subject recognition with auditable corrections."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import utc_now
from app.models.memory import (
    AttributedClaim,
    AttributionBasis,
    AttributionSubject,
    DialogueMessage,
    DialogueRole,
)

DEFAULT_AUTHOR_ALIASES: dict[str, str] = {
    "苏格拉底": "苏格拉底",
    "柏拉图": "柏拉图",
    "亚里士多德": "亚里士多德",
    "奥古斯丁": "奥古斯丁",
    "阿奎那": "托马斯·阿奎那",
    "笛卡尔": "勒内·笛卡尔",
    "斯宾诺莎": "巴鲁赫·斯宾诺莎",
    "休谟": "大卫·休谟",
    "康德": "伊曼努尔·康德",
    "黑格尔": "格奥尔格·黑格尔",
    "克尔凯郭尔": "索伦·克尔凯郭尔",
    "马克思": "卡尔·马克思",
    "尼采": "弗里德里希·尼采",
    "胡塞尔": "埃德蒙德·胡塞尔",
    "海德格尔": "马丁·海德格尔",
    "萨特": "让-保罗·萨特",
    "波伏瓦": "西蒙娜·德·波伏瓦",
    "维特根斯坦": "路德维希·维特根斯坦",
    "罗尔斯": "约翰·罗尔斯",
    "福柯": "米歇尔·福柯",
}

_THIRD_PARTY_MARKERS = (
    "我朋友",
    "朋友说",
    "他说",
    "她说",
    "他们说",
    "有人认为",
    "有人主张",
    "老师说",
    "同学说",
    "家人说",
    "别人说",
    "据说",
)
_USER_MARKERS = (
    "我认为",
    "我觉得",
    "我的观点",
    "我主张",
    "对我来说",
    "在我看来",
    "我相信",
    "我同意",
    "我不同意",
    "我赞成",
    "我反对",
)
_AUTHOR_VERBS = ("认为", "主张", "指出", "写道", "提出", "论证", "批判")
_CLAUSE_BOUNDARY = re.compile(r"(?<=[。！？!?；;])|(?:，|,)(?=(?:但|不过|然而|而我|我))")


@dataclass(frozen=True, slots=True)
class AttributionResult:
    """Persisted evidence message and every claim extracted from it."""

    message: DialogueMessage
    claims: tuple[AttributedClaim, ...]


@dataclass(frozen=True, slots=True)
class CorrectionResult:
    """The deactivated claim, replacement attribution, and correction evidence."""

    original_claim: AttributedClaim
    corrected_claim: AttributedClaim
    correction_message: DialogueMessage


@dataclass(frozen=True, slots=True)
class SubjectDecision:
    """Pure classification result used before persistence."""

    subject: AttributionSubject
    subject_name: str | None
    basis: AttributionBasis


class AttributionEngine:
    """Attribute explicit claims while avoiding unsafe user-stance inference."""

    def __init__(
        self,
        session: Session,
        *,
        author_aliases: Mapping[str, str] | None = None,
    ) -> None:
        self._session = session
        self._author_aliases = dict(author_aliases or DEFAULT_AUTHOR_ALIASES)

    def attribute_message(
        self,
        *,
        conversation_id: UUID,
        role: DialogueRole,
        content: str,
    ) -> AttributionResult:
        """Save the raw message, classify its clauses, and persist each claim."""

        if not content.strip():
            raise ValueError("content must not be blank")

        message = DialogueMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
        )
        self._session.add(message)
        self._session.flush()

        claims = tuple(
            AttributedClaim(
                conversation_id=conversation_id,
                message_id=message.id,
                claim_text=clause,
                subject=decision.subject,
                subject_name=decision.subject_name,
                basis=decision.basis,
            )
            for clause in _split_claims(content)
            for decision in (self._classify(clause, role),)
        )
        self._session.add_all(claims)
        self._session.commit()
        return AttributionResult(message=message, claims=claims)

    def active_user_claims(self, conversation_id: UUID) -> tuple[AttributedClaim, ...]:
        """Return only active propositions explicitly attributed to the user."""

        return tuple(
            self._session.scalars(
                select(AttributedClaim)
                .where(
                    AttributedClaim.conversation_id == conversation_id,
                    AttributedClaim.subject == AttributionSubject.USER,
                    AttributedClaim.is_active.is_(True),
                )
                .order_by(AttributedClaim.created_at, AttributedClaim.id)
            )
        )

    def correct_attribution(
        self,
        claim_id: UUID,
        *,
        correction_text: str,
        corrected_subject: AttributionSubject = AttributionSubject.UNKNOWN,
        corrected_subject_name: str | None = None,
    ) -> CorrectionResult:
        """Deactivate a wrong attribution without rewriting its original evidence."""

        if not correction_text.strip():
            raise ValueError("correction_text must not be blank")
        original = self._session.get(AttributedClaim, claim_id)
        if original is None:
            raise ValueError("claim_id does not exist")
        if not original.is_active:
            raise ValueError("claim attribution is already inactive")

        correction_message = DialogueMessage(
            conversation_id=original.conversation_id,
            role=DialogueRole.USER,
            content=correction_text,
        )
        self._session.add(correction_message)
        self._session.flush()

        original.is_active = False
        original.corrected_at = utc_now()
        original.correction_message_id = correction_message.id
        replacement = AttributedClaim(
            conversation_id=original.conversation_id,
            message_id=original.message_id,
            claim_text=original.claim_text,
            subject=corrected_subject,
            subject_name=corrected_subject_name,
            basis=AttributionBasis.CORRECTION,
            correction_message_id=correction_message.id,
        )
        self._session.add(replacement)
        self._session.commit()
        return CorrectionResult(
            original_claim=original,
            corrected_claim=replacement,
            correction_message=correction_message,
        )

    def _classify(self, claim: str, role: DialogueRole) -> SubjectDecision:
        """Classify one clause with conservative, precedence-ordered rules."""

        if role is DialogueRole.ASSISTANT:
            return SubjectDecision(
                subject=AttributionSubject.ASSISTANT,
                subject_name="PhilosophyOS",
                basis=AttributionBasis.ROLE,
            )

        if any(marker in claim for marker in _THIRD_PARTY_MARKERS):
            return SubjectDecision(
                subject=AttributionSubject.THIRD_PARTY,
                subject_name=_third_party_name(claim),
                basis=AttributionBasis.EXPLICIT,
            )

        if any(marker in claim for marker in _USER_MARKERS):
            return SubjectDecision(
                subject=AttributionSubject.USER,
                subject_name=None,
                basis=AttributionBasis.EXPLICIT,
            )

        for alias, canonical_name in self._author_aliases.items():
            if alias in claim and any(f"{alias}{verb}" in claim for verb in _AUTHOR_VERBS):
                return SubjectDecision(
                    subject=AttributionSubject.AUTHOR,
                    subject_name=canonical_name,
                    basis=AttributionBasis.EXPLICIT,
                )

        return SubjectDecision(
            subject=AttributionSubject.UNKNOWN,
            subject_name=None,
            basis=AttributionBasis.UNCERTAIN,
        )


def _split_claims(content: str) -> tuple[str, ...]:
    """Split a message into non-empty clauses without discarding original wording."""

    return tuple(clause.strip() for clause in _CLAUSE_BOUNDARY.split(content) if clause.strip())


def _third_party_name(claim: str) -> str:
    """Return a cautious display label for an explicitly mentioned third party."""

    labels = {
        "朋友": "朋友",
        "老师": "老师",
        "同学": "同学",
        "家人": "家人",
    }
    return next((label for marker, label in labels.items() if marker in claim), "第三方")
