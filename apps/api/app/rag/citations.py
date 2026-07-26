"""Non-bypassable citation policy for direct quotations."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from app.models.knowledge import CopyrightStatus, EvidenceKind, ReviewStatus, SourceLevel
from app.rag.retrievers import RetrievalDocument


class CitationBlockReason(StrEnum):
    """Stable reason codes for blocked direct quotations."""

    EMPTY_QUOTE = "empty_quote"
    CHUNK_NOT_PUBLISHED = "chunk_not_published"
    NOT_DIRECT_QUOTE_EVIDENCE = "not_direct_quote_evidence"
    SOURCE_NOT_PRIMARY = "source_not_primary"
    SOURCE_VERSION_MISSING = "source_version_missing"
    RIGHTS_NOT_APPROVED = "rights_not_approved"
    QUOTE_NOT_ALLOWED = "quote_not_allowed"
    QUOTE_NOT_EXACT = "quote_not_exact"


@dataclass(frozen=True, slots=True)
class CitationValidation:
    """Result of checking a proposed direct quote against its source chunk."""

    allowed: bool
    reason: CitationBlockReason | None = None
    message: str = ""


@dataclass(frozen=True, slots=True)
class Citation:
    """A direct quotation bound to an exact source version and chunk."""

    source_id: UUID
    chunk_id: UUID
    title: str
    author: str
    source_version: str
    location: str | None
    quote: str


class CitationPolicyError(ValueError):
    """Raised when a direct quotation fails a blocker rule."""

    def __init__(self, validation: CitationValidation) -> None:
        super().__init__(validation.message)
        self.reason = validation.reason


def validate_direct_quote(document: RetrievalDocument, proposed_quote: str) -> CitationValidation:
    """Apply all publication, version, rights, and exact-match blockers."""

    if not proposed_quote:
        return _blocked(CitationBlockReason.EMPTY_QUOTE, "direct quote must not be empty")
    if document.review_status is not ReviewStatus.PUBLISHED:
        return _blocked(
            CitationBlockReason.CHUNK_NOT_PUBLISHED,
            "source chunk must be published before quotation",
        )
    if document.evidence_kind is not EvidenceKind.DIRECT_QUOTE:
        return _blocked(
            CitationBlockReason.NOT_DIRECT_QUOTE_EVIDENCE,
            "source chunk is not reviewed as direct-quote evidence",
        )
    if document.source_level is not SourceLevel.S1:
        return _blocked(
            CitationBlockReason.SOURCE_NOT_PRIMARY,
            "direct quotes require an S1 primary source",
        )
    if not (document.source_version and document.source_version.strip()):
        return _blocked(
            CitationBlockReason.SOURCE_VERSION_MISSING,
            "direct quote requires a concrete source version",
        )
    if document.copyright_status not in {
        CopyrightStatus.APPROVED,
        CopyrightStatus.RESTRICTED,
    }:
        return _blocked(
            CitationBlockReason.RIGHTS_NOT_APPROVED,
            "source rights must be reviewed before quotation",
        )
    if not document.quote_allowed:
        return _blocked(
            CitationBlockReason.QUOTE_NOT_ALLOWED,
            "this source version does not allow quotation",
        )
    if proposed_quote not in document.content:
        return _blocked(
            CitationBlockReason.QUOTE_NOT_EXACT,
            "proposed quote does not exactly match the retrieved source chunk",
        )
    return CitationValidation(allowed=True)


def build_direct_quote_citation(document: RetrievalDocument, proposed_quote: str) -> Citation:
    """Build a version-bound citation or raise a policy error."""

    validation = validate_direct_quote(document, proposed_quote)
    if not validation.allowed:
        raise CitationPolicyError(validation)
    if document.source_version is None:
        raise AssertionError("validated citation unexpectedly lacks source version")
    return Citation(
        source_id=document.source_id,
        chunk_id=document.chunk_id,
        title=document.title,
        author=document.author,
        source_version=document.source_version,
        location=document.location,
        quote=proposed_quote,
    )


def _blocked(reason: CitationBlockReason, message: str) -> CitationValidation:
    """Create a consistent blocked validation result."""

    return CitationValidation(allowed=False, reason=reason, message=message)
