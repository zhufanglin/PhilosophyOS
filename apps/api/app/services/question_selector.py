"""Daily-question selection with preference fallback and a 30-day repeat window."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from random import Random
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import ReviewStatus
from app.models.questions import (
    DailyQuestion,
    QuestionDifficulty,
    QuestionInteraction,
    QuestionInteractionAction,
)

RECENT_WINDOW_DAYS = 30
DEFAULT_USER_KEY = "local-default"


class QuestionPoolExhaustedError(RuntimeError):
    """Raised when no reviewed, non-recent question remains."""


@dataclass(frozen=True, slots=True)
class SelectionPreferences:
    """Optional learner filters; empty sets represent a cold start."""

    domains: frozenset[str] = field(default_factory=frozenset)
    difficulties: frozenset[QuestionDifficulty] = field(default_factory=frozenset)
    eras: frozenset[str] = field(default_factory=frozenset)

    @property
    def active(self) -> bool:
        """Return whether any personalization filter is configured."""

        return bool(self.domains or self.difficulties or self.eras)


@dataclass(frozen=True, slots=True)
class QuestionSelection:
    """Selected prompt and the reason for its recommendation path."""

    question: DailyQuestion
    used_fallback: bool
    reason: str


class QuestionSelector:
    """Choose reviewed prompts while enforcing the recent-history boundary."""

    def __init__(self, session: Session, *, random_source: Random | None = None) -> None:
        self._session = session
        self._random = random_source or Random()

    def select(
        self,
        *,
        user_key: str = DEFAULT_USER_KEY,
        preferences: SelectionPreferences | None = None,
        now: datetime | None = None,
    ) -> QuestionSelection:
        """Select and record one reviewed question without a 30-day repeat."""

        normalized_user_key = user_key.strip()
        if not normalized_user_key:
            raise ValueError("user_key must not be blank")
        selected_at = now or datetime.now(UTC)
        if selected_at.tzinfo is None:
            raise ValueError("now must be timezone-aware")

        reviewed_questions = list(
            self._session.scalars(
                select(DailyQuestion)
                .where(DailyQuestion.review_status == ReviewStatus.REVIEWED)
                .order_by(DailyQuestion.seed_id)
            )
        )
        recent_ids = self._recent_question_ids(normalized_user_key, selected_at)
        eligible = [question for question in reviewed_questions if question.id not in recent_ids]
        if not eligible:
            raise QuestionPoolExhaustedError(
                "no reviewed question remains outside the 30-day repeat window"
            )

        active_preferences = preferences or SelectionPreferences()
        preferred = [
            question for question in eligible if _matches_preferences(question, active_preferences)
        ]
        used_fallback = active_preferences.active and not preferred
        pool = eligible if used_fallback or not active_preferences.active else preferred
        selected = pool[self._random.randrange(len(pool))]

        self._session.add(
            QuestionInteraction(
                user_key=normalized_user_key,
                question_id=selected.id,
                action=QuestionInteractionAction.PRESENTED,
                occurred_at=selected_at,
            )
        )
        self._session.commit()

        if used_fallback:
            reason = "个性化条件暂无匹配，已回退到审核问题库。"
        elif active_preferences.active:
            reason = "匹配你的领域、难度或时代偏好。"
        else:
            reason = "冷启动：从审核问题库中选择，无需历史记忆。"
        return QuestionSelection(
            question=selected,
            used_fallback=used_fallback,
            reason=reason,
        )

    def record_skip(
        self,
        question_id: UUID,
        *,
        user_key: str = DEFAULT_USER_KEY,
        occurred_at: datetime | None = None,
    ) -> None:
        """Record a skip so the question stays excluded from subsequent selection."""

        normalized_user_key = user_key.strip()
        if not normalized_user_key:
            raise ValueError("user_key must not be blank")
        timestamp = occurred_at or datetime.now(UTC)
        if timestamp.tzinfo is None:
            raise ValueError("occurred_at must be timezone-aware")
        if self._session.get(DailyQuestion, question_id) is None:
            raise ValueError("question_id does not exist")
        self._session.add(
            QuestionInteraction(
                user_key=normalized_user_key,
                question_id=question_id,
                action=QuestionInteractionAction.SKIPPED,
                occurred_at=timestamp,
            )
        )
        self._session.commit()

    def _recent_question_ids(self, user_key: str, now: datetime) -> set[UUID]:
        """Return questions presented, skipped, or completed in the last 30 days."""

        cutoff = now - timedelta(days=RECENT_WINDOW_DAYS)
        return set(
            self._session.scalars(
                select(QuestionInteraction.question_id).where(
                    QuestionInteraction.user_key == user_key,
                    QuestionInteraction.occurred_at >= cutoff,
                    QuestionInteraction.occurred_at <= now,
                )
            )
        )


def _matches_preferences(question: DailyQuestion, preferences: SelectionPreferences) -> bool:
    """Return whether a question satisfies every active preference dimension."""

    if preferences.domains and question.domain not in preferences.domains:
        return False
    if preferences.difficulties and question.difficulty not in preferences.difficulties:
        return False
    return not preferences.eras or question.era in preferences.eras
