"""Tests for public knowledge models, schemas, and migrations."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.knowledge import (
    Base,
    CopyrightStatus,
    EvidenceKind,
    ReviewStatus,
    Source,
    SourceChunk,
    SourceLevel,
    SourceType,
)
from app.schemas.knowledge import SourceChunkCreate, SourceCreate

API_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_TABLES = {
    "alembic_version",
    "philosophy_entities",
    "relations",
    "source_chunks",
    "sources",
}
ALEMBIC_ONLY = {"alembic_version"}


def source_input(**overrides: object) -> dict[str, object]:
    """Return valid source input with optional field overrides."""

    values: dict[str, object] = {
        "source_type": SourceType.PRIMARY,
        "source_level": SourceLevel.S1,
        "author": "伊曼努尔·康德",
        "title": "纯粹理性批判",
        "version_label": "A 版/B 版，测试校勘本",
        "language": "zh-CN",
        "copyright_status": CopyrightStatus.APPROVED,
        "quote_allowed": True,
    }
    values.update(overrides)
    return values


def chunk_input(**overrides: object) -> dict[str, object]:
    """Return valid source chunk input with optional field overrides."""

    values: dict[str, object] = {
        "source_id": uuid4(),
        "content": "思维无内容则空，直观无概念则盲。",
        "content_hash": "sha256:test-quote",
        "evidence_kind": EvidenceKind.DIRECT_QUOTE,
        "source_version": "A 版/B 版，测试校勘本",
        "review_status": ReviewStatus.PUBLISHED,
    }
    values.update(overrides)
    return values


def test_source_schema_requires_rights_review_before_quotes_are_allowed() -> None:
    """Unreviewed sources must not advertise quotation permission."""

    with pytest.raises(ValidationError, match="quote_allowed requires"):
        SourceCreate.model_validate(source_input(copyright_status=CopyrightStatus.RIGHTS_REVIEW))


def test_published_direct_quote_requires_concrete_source_version() -> None:
    """Schema validation blocks a versionless direct quote from publication."""

    with pytest.raises(ValidationError, match="requires a concrete source version"):
        SourceChunkCreate.model_validate(chunk_input(source_version="  "))

    draft = SourceChunkCreate.model_validate(
        chunk_input(source_version=None, review_status=ReviewStatus.DRAFT)
    )
    assert draft.review_status is ReviewStatus.DRAFT


def test_database_blocks_published_direct_quote_without_source_version() -> None:
    """The storage constraint remains effective if schema validation is bypassed."""

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        source = Source(**source_input())
        session.add(source)
        session.flush()
        session.add(
            SourceChunk(
                source_id=source.id,
                content="未经版本绑定的直接引语",
                content_hash="sha256:missing-version",
                evidence_kind=EvidenceKind.DIRECT_QUOTE,
                source_version=None,
                review_status=ReviewStatus.PUBLISHED,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_knowledge_migration_can_upgrade_downgrade_and_upgrade_again(tmp_path: Path) -> None:
    """The initial schema migration is reversible and repeatable."""

    database_path = tmp_path / "knowledge.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)

    command.upgrade(config, "head")
    engine = create_engine(database_url)
    assert set(inspect(engine).get_table_names()) == EXPECTED_TABLES
    engine.dispose()

    command.downgrade(config, "base")
    engine = create_engine(database_url)
    assert set(inspect(engine).get_table_names()) == ALEMBIC_ONLY
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(database_url)
    assert set(inspect(engine).get_table_names()) == EXPECTED_TABLES
    engine.dispose()
