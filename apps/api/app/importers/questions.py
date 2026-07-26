"""Validated, idempotent importer for the reviewed daily-question bank."""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.knowledge import ReviewStatus
from app.models.questions import DailyQuestion, QuestionDifficulty

QUESTION_NAMESPACE = UUID("5cd75147-98b7-56f6-b825-111079b93a1d")
QUESTION_ID_PATTERN = re.compile(r"^q\d{3}$")
PHILOSOPHER_REF_PATTERN = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
REQUIRED_COLUMNS = {
    "id",
    "domain",
    "era",
    "difficulty",
    "question",
    "core_tension",
    "philosopher_refs",
    "followup_strategy",
    "status",
}
STATUS_MAP = {
    "draft": ReviewStatus.DRAFT,
    "reviewed": ReviewStatus.REVIEWED,
}


@dataclass(frozen=True, slots=True)
class QuestionImportDiagnostic:
    """One actionable CSV validation or database diagnostic."""

    row_number: int
    record_id: str | None
    code: str
    message: str


@dataclass(slots=True)
class QuestionImportReport:
    """Summary returned by a daily-question import run."""

    source: str
    total_rows: int = 0
    inserted: int = 0
    skipped: int = 0
    diagnostics: list[QuestionImportDiagnostic] = field(default_factory=list)

    @property
    def error_count(self) -> int:
        """Return the number of rejected rows or file-level errors."""

        return len(self.diagnostics)

    @property
    def succeeded(self) -> bool:
        """Return whether every row passed validation."""

        return self.error_count == 0

    def add_error(self, row_number: int, record_id: str | None, code: str, message: str) -> None:
        """Append a stable diagnostic to the report."""

        self.diagnostics.append(
            QuestionImportDiagnostic(
                row_number=row_number,
                record_id=record_id,
                code=code,
                message=message,
            )
        )

    def as_dict(self) -> dict[str, object]:
        """Return a serialization-friendly representation."""

        return {
            "source": self.source,
            "total_rows": self.total_rows,
            "inserted": self.inserted,
            "skipped": self.skipped,
            "error_count": self.error_count,
            "succeeded": self.succeeded,
            "diagnostics": [
                {
                    "row_number": diagnostic.row_number,
                    "record_id": diagnostic.record_id,
                    "code": diagnostic.code,
                    "message": diagnostic.message,
                }
                for diagnostic in self.diagnostics
            ],
        }


@dataclass(frozen=True, slots=True)
class QuestionSeed:
    """Validated intermediate representation of a question row."""

    row_number: int
    seed_id: str
    domain: str
    era: str
    difficulty: QuestionDifficulty
    question: str
    core_tension: str
    philosopher_refs: tuple[str, ...]
    followup_strategy: str
    review_status: ReviewStatus

    @property
    def question_id(self) -> UUID:
        """Return the stable UUID for this seed id."""

        return question_uuid(self.seed_id)


def question_uuid(seed_id: str) -> UUID:
    """Map a readable question id to a deterministic UUID."""

    return uuid5(QUESTION_NAMESPACE, seed_id)


def import_questions(session: Session, csv_path: Path) -> QuestionImportReport:
    """Validate and import reviewed prompts without creating duplicates."""

    report = QuestionImportReport(source=str(csv_path))
    seeds = _read_seeds(csv_path, report)
    if not seeds:
        return report

    pending: list[DailyQuestion] = []
    for seed in seeds:
        existing_by_id = session.get(DailyQuestion, seed.question_id)
        if existing_by_id is not None:
            if _matches_seed(existing_by_id, seed):
                report.skipped += 1
            else:
                report.add_error(
                    seed.row_number,
                    seed.seed_id,
                    "conflicting_existing_id",
                    f"id '{seed.seed_id}' already exists with different question data",
                )
            continue

        existing_text_id = session.scalar(
            select(DailyQuestion.id).where(DailyQuestion.question == seed.question)
        )
        if existing_text_id is not None:
            report.add_error(
                seed.row_number,
                seed.seed_id,
                "duplicate_question_text",
                "the same question text already exists under another id",
            )
            continue
        pending.append(_to_model(seed))

    if not pending:
        return report

    session.add_all(pending)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        report.add_error(
            0,
            None,
            "database_integrity_error",
            f"database rejected the question import: {error.orig}",
        )
        return report

    report.inserted = len(pending)
    return report


def _read_seeds(csv_path: Path, report: QuestionImportReport) -> list[QuestionSeed]:
    """Read the CSV and accumulate row-level diagnostics."""

    try:
        source = csv_path.open(encoding="utf-8-sig", newline="")
    except OSError as error:
        report.add_error(0, None, "source_unreadable", f"cannot read seed file: {error}")
        return []

    with source:
        reader = csv.DictReader(source)
        missing_columns = sorted(REQUIRED_COLUMNS - set(reader.fieldnames or []))
        if missing_columns:
            report.add_error(
                1,
                None,
                "missing_columns",
                f"missing required columns: {', '.join(missing_columns)}",
            )
            return []

        seeds: list[QuestionSeed] = []
        seen_ids: set[str] = set()
        for row_number, row in enumerate(reader, start=2):
            report.total_rows += 1
            seed = _parse_row(row, row_number, report)
            if seed is None:
                continue
            if seed.seed_id in seen_ids:
                report.add_error(
                    row_number,
                    seed.seed_id,
                    "duplicate_id",
                    f"duplicate id '{seed.seed_id}' in seed file",
                )
                continue
            seen_ids.add(seed.seed_id)
            seeds.append(seed)
        return seeds


def _parse_row(
    row: dict[str | None, str | None],
    row_number: int,
    report: QuestionImportReport,
) -> QuestionSeed | None:
    """Validate a raw CSV row and return its typed representation."""

    values = {column: (row.get(column) or "").strip() for column in REQUIRED_COLUMNS}
    record_id = values["id"] or None
    missing_values = sorted(column for column, value in values.items() if not value)
    if missing_values:
        report.add_error(
            row_number,
            record_id,
            "missing_values",
            f"required values are blank: {', '.join(missing_values)}",
        )
        return None

    seed_id = values["id"]
    if QUESTION_ID_PATTERN.fullmatch(seed_id) is None:
        report.add_error(
            row_number,
            seed_id,
            "invalid_id",
            "question id must use the q001 format",
        )
        return None

    try:
        difficulty = QuestionDifficulty(values["difficulty"])
    except ValueError:
        report.add_error(
            row_number,
            seed_id,
            "invalid_difficulty",
            f"invalid difficulty '{values['difficulty']}'; expected 入门 or 进阶",
        )
        return None

    review_status = STATUS_MAP.get(values["status"])
    if review_status is None:
        report.add_error(
            row_number,
            seed_id,
            "invalid_status",
            f"invalid question status '{values['status']}'; expected draft or reviewed",
        )
        return None

    philosopher_refs = tuple(
        reference.strip()
        for reference in values["philosopher_refs"].split("|")
        if reference.strip()
    )
    invalid_refs = [
        reference
        for reference in philosopher_refs
        if PHILOSOPHER_REF_PATTERN.fullmatch(reference) is None
    ]
    if invalid_refs:
        report.add_error(
            row_number,
            seed_id,
            "invalid_philosopher_ref",
            f"invalid philosopher refs: {', '.join(invalid_refs)}",
        )
        return None

    return QuestionSeed(
        row_number=row_number,
        seed_id=seed_id,
        domain=values["domain"],
        era=values["era"],
        difficulty=difficulty,
        question=values["question"],
        core_tension=values["core_tension"],
        philosopher_refs=philosopher_refs,
        followup_strategy=values["followup_strategy"],
        review_status=review_status,
    )


def _to_model(seed: QuestionSeed) -> DailyQuestion:
    """Create an ORM question from a validated seed."""

    return DailyQuestion(
        id=seed.question_id,
        seed_id=seed.seed_id,
        domain=seed.domain,
        era=seed.era,
        difficulty=seed.difficulty,
        question=seed.question,
        core_tension=seed.core_tension,
        philosopher_refs=list(seed.philosopher_refs),
        followup_strategy=seed.followup_strategy,
        review_status=seed.review_status,
    )


def _matches_seed(record: DailyQuestion, seed: QuestionSeed) -> bool:
    """Return whether an existing record is the same immutable seed."""

    return (
        record.id == seed.question_id
        and record.seed_id == seed.seed_id
        and record.domain == seed.domain
        and record.era == seed.era
        and record.difficulty is seed.difficulty
        and record.question == seed.question
        and record.core_tension == seed.core_tension
        and record.philosopher_refs == list(seed.philosopher_refs)
        and record.followup_strategy == seed.followup_strategy
        and record.review_status is seed.review_status
    )
