"""Tests for the validated philosopher seed importer."""

from __future__ import annotations

import csv
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.importers.philosophers import import_philosophers
from app.models.knowledge import Base, PhilosophyEntity, Tradition

REPO_ROOT = Path(__file__).resolve().parents[4]
SEED_FILE = REPO_ROOT / "data" / "seed" / "philosophers.csv"
CSV_COLUMNS = [
    "id",
    "name_zh",
    "name_original",
    "tradition",
    "era",
    "period",
    "level",
    "domains",
    "status",
]
VALID_ROW = {
    "id": "test_philosopher",
    "name_zh": "测试哲学家",
    "name_original": "Test Philosopher",
    "tradition": "western",
    "era": "测试时代",
    "period": "约测试世纪",
    "level": "L1",
    "domains": "知识论|伦理学",
    "status": "seed",
}


@pytest.fixture
def session() -> Iterator[Session]:
    """Provide an isolated in-memory knowledge database."""

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as database_session:
        yield database_session
    engine.dispose()


def write_seed_file(path: Path, rows: list[dict[str, str]]) -> Path:
    """Write a temporary CSV fixture using the production column order."""

    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def entity_count(session: Session) -> int:
    """Return the number of imported public entities."""

    return session.scalar(select(func.count()).select_from(PhilosophyEntity)) or 0


def test_current_seed_file_imports_all_western_philosophers(session: Session) -> None:
    """Every reviewed row in the current seed file imports successfully."""

    report = import_philosophers(session, SEED_FILE)

    assert report.succeeded
    assert report.total_rows == 66
    assert report.inserted == 66
    assert report.skipped == 0
    assert report.diagnostics == []
    assert entity_count(session) == 66
    assert (
        session.scalar(
            select(func.count())
            .select_from(PhilosophyEntity)
            .where(PhilosophyEntity.tradition == Tradition.WESTERN)
        )
        == 66
    )


def test_repeated_import_is_idempotent(session: Session) -> None:
    """A second run reports skips and creates no duplicate entities."""

    first_report = import_philosophers(session, SEED_FILE)
    second_report = import_philosophers(session, SEED_FILE)

    assert first_report.inserted == 66
    assert second_report.succeeded
    assert second_report.inserted == 0
    assert second_report.skipped == 66
    assert entity_count(session) == 66


def test_duplicate_id_is_rejected_with_row_diagnostic(session: Session, tmp_path: Path) -> None:
    """Duplicate readable ids are rejected before database insertion."""

    duplicate = {**VALID_ROW, "name_zh": "另一个测试哲学家"}
    seed_file = write_seed_file(tmp_path / "duplicates.csv", [VALID_ROW, duplicate])

    report = import_philosophers(session, seed_file)

    assert report.inserted == 1
    assert report.error_count == 1
    diagnostic = report.diagnostics[0]
    assert diagnostic.row_number == 3
    assert diagnostic.record_id == "test_philosopher"
    assert diagnostic.code == "duplicate_id"
    assert "duplicate id 'test_philosopher'" in diagnostic.message


def test_invalid_tradition_and_level_have_actionable_diagnostics(
    session: Session, tmp_path: Path
) -> None:
    """Invalid enum values identify their exact rows and accepted values."""

    invalid_tradition = {**VALID_ROW, "id": "bad_tradition", "tradition": "unknown"}
    invalid_level = {**VALID_ROW, "id": "bad_level", "level": "L9"}
    seed_file = write_seed_file(tmp_path / "invalid.csv", [invalid_tradition, invalid_level])

    report = import_philosophers(session, seed_file)

    assert report.inserted == 0
    assert report.error_count == 2
    assert [diagnostic.row_number for diagnostic in report.diagnostics] == [2, 3]
    assert [diagnostic.code for diagnostic in report.diagnostics] == [
        "invalid_tradition",
        "invalid_level",
    ]
    assert "expected western" in report.diagnostics[0].message
    assert "expected L1, L2, or L3" in report.diagnostics[1].message
    assert entity_count(session) == 0


def test_chinese_seed_is_deferred_until_later_phase(session: Session, tmp_path: Path) -> None:
    """The reserved model enum does not enable Chinese imports in the Western MVP."""

    chinese = {**VALID_ROW, "id": "confucius", "tradition": "chinese"}
    seed_file = write_seed_file(tmp_path / "later-phase.csv", [chinese])

    report = import_philosophers(session, seed_file)

    assert report.inserted == 0
    assert report.diagnostics[0].code == "unsupported_tradition"
    assert "only western" in report.diagnostics[0].message
