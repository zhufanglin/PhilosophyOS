"""Tests for question import, filtering, fallback, and repeat prevention."""

from __future__ import annotations

import csv
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from random import Random

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.importers.questions import import_questions
from app.models.knowledge import Base, ReviewStatus
from app.models.questions import DailyQuestion, QuestionDifficulty
from app.services.question_selector import QuestionSelector, SelectionPreferences

REPO_ROOT = Path(__file__).resolve().parents[4]
SEED_FILE = REPO_ROOT / "data" / "seed" / "questions.csv"
CSV_COLUMNS = [
    "id",
    "domain",
    "era",
    "difficulty",
    "question",
    "core_tension",
    "philosopher_refs",
    "followup_strategy",
    "status",
]
VALID_ROW = {
    "id": "q901",
    "domain": "伦理学",
    "era": "测试时代",
    "difficulty": "入门",
    "question": "一个测试问题是否仍然值得认真回答？",
    "core_tension": "测试与认真",
    "philosopher_refs": "socrates",
    "followup_strategy": "理由追问",
    "status": "reviewed",
}


@pytest.fixture
def session() -> Iterator[Session]:
    """Provide an isolated database containing all registered models."""

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as database_session:
        yield database_session
    engine.dispose()


def write_seed_file(path: Path, rows: list[dict[str, str]]) -> Path:
    """Write a temporary CSV fixture using production columns."""

    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def import_reviewed_bank(session: Session) -> None:
    """Import and assert the production question bank for selector tests."""

    report = import_questions(session, SEED_FILE)
    assert report.succeeded
    assert report.inserted == 60


def question_count(session: Session) -> int:
    """Return the number of persisted daily questions."""

    return session.scalar(select(func.count()).select_from(DailyQuestion)) or 0


def test_current_question_bank_imports_all_60_reviewed_rows(session: Session) -> None:
    """Every row in the current reviewed bank imports successfully."""

    report = import_questions(session, SEED_FILE)

    assert report.succeeded
    assert report.total_rows == 60
    assert report.inserted == 60
    assert report.skipped == 0
    assert report.diagnostics == []
    assert question_count(session) == 60
    assert (
        session.scalar(
            select(func.count())
            .select_from(DailyQuestion)
            .where(DailyQuestion.review_status == ReviewStatus.REVIEWED)
        )
        == 60
    )


def test_repeated_question_import_is_idempotent(session: Session) -> None:
    """Re-importing the same file only reports skips."""

    first = import_questions(session, SEED_FILE)
    second = import_questions(session, SEED_FILE)

    assert first.inserted == 60
    assert second.succeeded
    assert second.inserted == 0
    assert second.skipped == 60
    assert question_count(session) == 60


def test_invalid_and_duplicate_rows_include_clear_diagnostics(
    session: Session, tmp_path: Path
) -> None:
    """Bad difficulty and duplicate ids identify exact rows and accepted values."""

    invalid = {**VALID_ROW, "difficulty": "专家"}
    duplicate = {**VALID_ROW, "question": "另一个重复 ID 的问题？"}
    seed_file = write_seed_file(tmp_path / "invalid.csv", [invalid, VALID_ROW, duplicate])

    report = import_questions(session, seed_file)

    assert report.inserted == 1
    assert report.error_count == 2
    assert [diagnostic.row_number for diagnostic in report.diagnostics] == [2, 4]
    assert [diagnostic.code for diagnostic in report.diagnostics] == [
        "invalid_difficulty",
        "duplicate_id",
    ]
    assert "expected 入门 or 进阶" in report.diagnostics[0].message


def test_cold_start_selects_from_reviewed_bank_without_memory(session: Session) -> None:
    """A new local user needs no history or preference profile."""

    import_reviewed_bank(session)
    selector = QuestionSelector(session, random_source=Random(7))

    selection = selector.select(now=datetime(2026, 7, 26, tzinfo=UTC))

    assert selection.question.review_status is ReviewStatus.REVIEWED
    assert not selection.used_fallback
    assert "冷启动" in selection.reason


def test_thirty_daily_selections_never_repeat(session: Session) -> None:
    """The recent window provides 30 distinct questions for daily use."""

    import_reviewed_bank(session)
    selector = QuestionSelector(session, random_source=Random(11))
    start = datetime(2026, 7, 1, 8, tzinfo=UTC)

    selected_ids = {
        selector.select(now=start + timedelta(days=offset)).question.id for offset in range(30)
    }

    assert len(selected_ids) == 30


def test_preferences_filter_domain_and_difficulty(session: Session) -> None:
    """Active learner preferences narrow the reviewed candidate pool."""

    import_reviewed_bank(session)
    selector = QuestionSelector(session, random_source=Random(3))
    preferences = SelectionPreferences(
        domains=frozenset({"伦理学"}),
        difficulties=frozenset({QuestionDifficulty.BEGINNER}),
    )

    selection = selector.select(
        preferences=preferences,
        now=datetime(2026, 7, 26, tzinfo=UTC),
    )

    assert selection.question.domain == "伦理学"
    assert selection.question.difficulty is QuestionDifficulty.BEGINNER
    assert not selection.used_fallback


def test_unmatched_preferences_fall_back_to_reviewed_bank(session: Session) -> None:
    """Personalization failure does not prevent a safe reviewed-bank result."""

    import_reviewed_bank(session)
    selector = QuestionSelector(session, random_source=Random(5))
    preferences = SelectionPreferences(domains=frozenset({"不存在的领域"}))

    selection = selector.select(
        preferences=preferences,
        now=datetime(2026, 7, 26, tzinfo=UTC),
    )

    assert selection.question.review_status is ReviewStatus.REVIEWED
    assert selection.used_fallback
    assert "回退到审核问题库" in selection.reason


def test_skipped_question_remains_excluded(session: Session) -> None:
    """Explicit skips participate in the same 30-day exclusion window."""

    import_reviewed_bank(session)
    selector = QuestionSelector(session, random_source=Random(13))
    now = datetime(2026, 7, 26, tzinfo=UTC)
    first = selector.select(user_key="stu", now=now)
    selector.record_skip(first.question.id, user_key="stu", occurred_at=now)

    second = selector.select(user_key="stu", now=now + timedelta(minutes=1))

    assert second.question.id != first.question.id
