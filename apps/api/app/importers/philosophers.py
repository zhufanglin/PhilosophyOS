"""Validated, idempotent importer for philosopher seed data."""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.knowledge import (
    DepthLevel,
    EntityType,
    PhilosophyEntity,
    ReviewStatus,
    Tradition,
)

PHILOSOPHER_NAMESPACE = UUID("ac119a13-7478-5ac0-ae7c-3863f8f5ac7c")
SEED_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
REQUIRED_COLUMNS = {
    "id",
    "name_zh",
    "name_original",
    "tradition",
    "era",
    "period",
    "level",
    "domains",
    "status",
}
SEED_STATUS_MAP = {"seed": ReviewStatus.DRAFT, "draft": ReviewStatus.DRAFT}


class DiagnosticSeverity(StrEnum):
    """Severity of a seed-import diagnostic."""

    ERROR = "error"
    INFO = "info"


@dataclass(frozen=True, slots=True)
class ImportDiagnostic:
    """One actionable message tied to a CSV row."""

    row_number: int
    record_id: str | None
    code: str
    message: str
    severity: DiagnosticSeverity = DiagnosticSeverity.ERROR


@dataclass(slots=True)
class ImportReport:
    """Machine-readable summary of a philosopher import run."""

    source: str
    total_rows: int = 0
    inserted: int = 0
    skipped: int = 0
    diagnostics: list[ImportDiagnostic] = field(default_factory=list)

    @property
    def error_count(self) -> int:
        """Return the number of rejected rows or file-level errors."""

        return sum(
            diagnostic.severity is DiagnosticSeverity.ERROR for diagnostic in self.diagnostics
        )

    @property
    def succeeded(self) -> bool:
        """Return whether the import completed without validation errors."""

        return self.error_count == 0

    def add_error(self, row_number: int, record_id: str | None, code: str, message: str) -> None:
        """Append a row-specific error to the report."""

        self.diagnostics.append(
            ImportDiagnostic(
                row_number=row_number,
                record_id=record_id,
                code=code,
                message=message,
            )
        )

    def as_dict(self) -> dict[str, object]:
        """Return a serialization-friendly report for CLI or API output."""

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
                    "severity": diagnostic.severity.value,
                }
                for diagnostic in self.diagnostics
            ],
        }


@dataclass(frozen=True, slots=True)
class PhilosopherSeed:
    """Validated intermediate representation of one CSV row."""

    row_number: int
    seed_id: str
    canonical_name: str
    original_name: str
    tradition: Tradition
    era: str
    period: str
    depth_level: DepthLevel
    domains: tuple[str, ...]
    review_status: ReviewStatus

    @property
    def entity_id(self) -> UUID:
        """Map the readable seed id to a stable database UUID."""

        return philosopher_uuid(self.seed_id)

    @property
    def summary(self) -> str:
        """Build a conservative seed summary from reviewed CSV fields only."""

        return f"{self.era}，{self.period}。核心领域：{'、'.join(self.domains)}。"


def philosopher_uuid(seed_id: str) -> UUID:
    """Return the deterministic UUID assigned to a philosopher seed id."""

    return uuid5(PHILOSOPHER_NAMESPACE, seed_id)


def import_philosophers(session: Session, csv_path: Path) -> ImportReport:
    """Validate and import philosopher rows without duplicating existing entities."""

    report = ImportReport(source=str(csv_path))
    seeds = _read_seeds(csv_path, report)
    if not seeds:
        return report

    pending: list[PhilosophyEntity] = []
    for seed in seeds:
        existing_by_id = session.get(PhilosophyEntity, seed.entity_id)
        if existing_by_id is not None:
            if _matches_seed(existing_by_id, seed):
                report.skipped += 1
            else:
                report.add_error(
                    seed.row_number,
                    seed.seed_id,
                    "conflicting_existing_id",
                    f"id '{seed.seed_id}' already exists with different philosopher data",
                )
            continue

        existing_name_id = session.scalar(
            select(PhilosophyEntity.id).where(
                PhilosophyEntity.tradition == seed.tradition,
                PhilosophyEntity.entity_type == EntityType.PHILOSOPHER,
                PhilosophyEntity.canonical_name == seed.canonical_name,
            )
        )
        if existing_name_id is not None:
            report.add_error(
                seed.row_number,
                seed.seed_id,
                "duplicate_canonical_name",
                f"philosopher name '{seed.canonical_name}' already exists under another id",
            )
            continue

        pending.append(_to_entity(seed))

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
            f"database rejected the import: {error.orig}",
        )
        return report

    report.inserted = len(pending)
    return report


def _read_seeds(csv_path: Path, report: ImportReport) -> list[PhilosopherSeed]:
    """Read and validate CSV rows, collecting all actionable diagnostics."""

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

        seeds: list[PhilosopherSeed] = []
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
    row: dict[str | None, str | None], row_number: int, report: ImportReport
) -> PhilosopherSeed | None:
    """Convert a raw CSV row into a validated seed record."""

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
    if SEED_ID_PATTERN.fullmatch(seed_id) is None:
        report.add_error(
            row_number,
            seed_id,
            "invalid_id",
            "id must contain lowercase letters, numbers, and single underscores only",
        )
        return None

    try:
        tradition = Tradition(values["tradition"])
    except ValueError:
        report.add_error(
            row_number,
            seed_id,
            "invalid_tradition",
            f"unknown tradition '{values['tradition']}'; expected western",
        )
        return None
    if tradition is not Tradition.WESTERN:
        report.add_error(
            row_number,
            seed_id,
            "unsupported_tradition",
            "only western philosopher seeds are enabled in the MVP",
        )
        return None

    try:
        depth_level = DepthLevel(values["level"])
    except ValueError:
        report.add_error(
            row_number,
            seed_id,
            "invalid_level",
            f"invalid level '{values['level']}'; expected L1, L2, or L3",
        )
        return None

    review_status = SEED_STATUS_MAP.get(values["status"])
    if review_status is None:
        report.add_error(
            row_number,
            seed_id,
            "invalid_status",
            f"invalid seed status '{values['status']}'; expected seed or draft",
        )
        return None

    domains = tuple(domain.strip() for domain in values["domains"].split("|") if domain.strip())
    if not domains:
        report.add_error(
            row_number,
            seed_id,
            "missing_domains",
            "domains must contain at least one non-blank value",
        )
        return None

    return PhilosopherSeed(
        row_number=row_number,
        seed_id=seed_id,
        canonical_name=values["name_zh"],
        original_name=values["name_original"],
        tradition=tradition,
        era=values["era"],
        period=values["period"],
        depth_level=depth_level,
        domains=domains,
        review_status=review_status,
    )


def _to_entity(seed: PhilosopherSeed) -> PhilosophyEntity:
    """Create an ORM entity from a validated seed."""

    return PhilosophyEntity(
        id=seed.entity_id,
        tradition=seed.tradition,
        entity_type=EntityType.PHILOSOPHER,
        canonical_name=seed.canonical_name,
        original_name=seed.original_name,
        aliases=[],
        summary=seed.summary,
        period_id=None,
        depth_level=seed.depth_level,
        review_status=seed.review_status,
    )


def _matches_seed(entity: PhilosophyEntity, seed: PhilosopherSeed) -> bool:
    """Return whether an existing record is the same immutable seed record."""

    return (
        entity.id == seed.entity_id
        and entity.tradition is seed.tradition
        and entity.entity_type is EntityType.PHILOSOPHER
        and entity.canonical_name == seed.canonical_name
        and entity.original_name == seed.original_name
        and entity.summary == seed.summary
        and entity.depth_level is seed.depth_level
        and entity.review_status is seed.review_status
    )
