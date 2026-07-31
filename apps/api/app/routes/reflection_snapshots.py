"""REST resources for durable thought-change snapshots."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.schemas.reflection_snapshots import (
    ReflectionArchiveClearRequest,
    ReflectionArchiveDeleteResponse,
    ReflectionArchiveImportResponse,
    ReflectionArchivePackage,
    ReflectionPhilosopherInfluenceResponse,
    ReflectionSnapshotCorrectionRequest,
    ReflectionSnapshotCorrectionResponse,
    ReflectionSnapshotDecisionRequest,
    ReflectionSnapshotDecisionResponse,
    ReflectionSnapshotListItem,
    ReflectionSnapshotListResponse,
    ReflectionSnapshotRequest,
    ReflectionSnapshotResponse,
    ReflectionSnapshotReviewRequest,
    ReflectionSnapshotReviewResponse,
)
from app.services.reflection_snapshots import (
    correct_reflection_snapshot,
    create_reflection_snapshot,
    delete_all_reflection_snapshots,
    delete_reflection_snapshot,
    export_reflection_archive,
    import_reflection_archive,
    list_reflection_snapshots,
    list_philosopher_influences as aggregate_philosopher_influences,
    render_reflection_archive_markdown,
    retry_reflection_snapshot,
    update_reflection_snapshot_decision,
    update_reflection_snapshot_review,
)
from app.settings import settings

router = APIRouter(prefix="/api/v1", tags=["reflection-snapshots"])


@router.get(
    "/reflection-archive/export",
    response_model=ReflectionArchivePackage,
    summary="Export a complete portable thought archive",
)
async def export_reflection_archive_endpoint() -> Response:
    """Download a lossless JSON archive package."""

    package = export_reflection_archive(settings)
    return Response(
        content=package.model_dump_json(indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=philosophyos-archive.json"},
    )


@router.get(
    "/reflection-archive/export.md",
    summary="Export a readable Markdown thought archive",
)
async def export_reflection_archive_markdown_endpoint() -> Response:
    """Download a human-readable Markdown copy."""

    content = render_reflection_archive_markdown(export_reflection_archive(settings))
    return Response(
        content=content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=philosophyos-archive.md"},
    )


@router.post(
    "/reflection-archive/import",
    response_model=ReflectionArchiveImportResponse,
    summary="Validate and restore a portable thought archive",
)
async def import_reflection_archive_endpoint(
    package: ReflectionArchivePackage,
) -> ReflectionArchiveImportResponse:
    """Validate all records before performing an atomic merge."""

    try:
        return import_reflection_archive(package, settings)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error


@router.delete(
    "/reflection-archive",
    response_model=ReflectionArchiveDeleteResponse,
    summary="Delete every local reflection snapshot",
)
async def delete_reflection_archive_endpoint(
    request: ReflectionArchiveClearRequest,
) -> ReflectionArchiveDeleteResponse:
    """Clear the complete archive only after an exact confirmation phrase."""

    return delete_all_reflection_snapshots(settings)


@router.delete(
    "/reflection-snapshots/{snapshot_id}",
    response_model=ReflectionArchiveDeleteResponse,
    summary="Delete one local reflection snapshot",
)
async def delete_reflection_snapshot_endpoint(
    snapshot_id: str,
) -> ReflectionArchiveDeleteResponse:
    """Delete one selected snapshot."""

    response = delete_reflection_snapshot(snapshot_id, settings)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return response


@router.get(
    "/reflection-snapshots",
    response_model=ReflectionSnapshotListResponse,
    status_code=status.HTTP_200_OK,
    summary="List recent reflection snapshots",
)
async def list_reflection_snapshots_endpoint(
    limit: int = Query(default=30, ge=1, le=100),
    search: str | None = Query(default=None, max_length=120),
    topic: str | None = Query(default=None, max_length=120),
    philosopher: str | None = Query(default=None, max_length=80),
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
) -> ReflectionSnapshotListResponse:
    """Return local thought snapshots matching the archive filters."""

    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_date must not be later than to_date",
        )

    response = list_reflection_snapshots(settings, limit=100)
    search_term = (search or "").strip().casefold()
    topic_term = (topic or "").strip().casefold()
    philosopher_term = (philosopher or "").strip().casefold()

    def matches(snapshot_item: ReflectionSnapshotListItem) -> bool:
        created_on = date.fromisoformat(snapshot_item.created_at[:10])
        if from_date and created_on < from_date:
            return False
        if to_date and created_on > to_date:
            return False

        content = snapshot_item.snapshot.content
        if content is None:
            if topic_term or philosopher_term:
                return False
            searchable = snapshot_item.question.casefold()
            return not search_term or search_term in searchable

        philosopher_names = [entry.name for entry in content.related_philosophers]
        if topic_term and topic_term not in content.topic.casefold():
            return False
        if philosopher_term and not any(
            philosopher_term in name.casefold() for name in philosopher_names
        ):
            return False
        searchable = " ".join(
            [
                snapshot_item.question,
                content.title,
                content.topic,
                content.user_position,
                content.core_question,
                *content.tensions,
                *content.tags,
                *philosopher_names,
            ]
        ).casefold()
        return not search_term or search_term in searchable

    return ReflectionSnapshotListResponse(
        items=[item for item in response.items if matches(item)][:limit]
    )


@router.get(
    "/reflection-archive/philosopher-influences",
    response_model=ReflectionPhilosopherInfluenceResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate philosophers that repeatedly influence the archive",
)
async def list_philosopher_influences_endpoint(
    limit: int = Query(default=8, ge=1, le=20),
) -> ReflectionPhilosopherInfluenceResponse:
    """Return philosophers ranked by repeated appearance in completed snapshots."""

    return aggregate_philosopher_influences(settings, limit=limit)


@router.post(
    "/reflection-snapshots",
    response_model=ReflectionSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a durable AI reflection snapshot",
)
async def create_reflection_snapshot_endpoint(
    request: ReflectionSnapshotRequest,
) -> ReflectionSnapshotResponse:
    """Create one thought snapshot or a pending record when the model is unavailable."""

    return create_reflection_snapshot(request, settings)


@router.post(
    "/reflection-snapshots/{snapshot_id}/retry",
    response_model=ReflectionSnapshotResponse,
    status_code=status.HTTP_200_OK,
    summary="Retry one pending reflection snapshot",
)
async def retry_reflection_snapshot_endpoint(snapshot_id: str) -> ReflectionSnapshotResponse:
    """Retry only the selected snapshot without duplicating its source record."""

    response = retry_reflection_snapshot(snapshot_id, settings)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return response


@router.patch(
    "/reflection-snapshots/{snapshot_id}/content",
    response_model=ReflectionSnapshotCorrectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Correct user-owned reflection snapshot fields",
)
async def correct_reflection_snapshot_endpoint(
    snapshot_id: str,
    request: ReflectionSnapshotCorrectionRequest,
) -> ReflectionSnapshotCorrectionResponse:
    """Store user corrections with the previous AI wording and update time."""

    try:
        response = correct_reflection_snapshot(snapshot_id, request, settings)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return response


@router.patch(
    "/reflection-snapshots/{snapshot_id}/decision",
    response_model=ReflectionSnapshotDecisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Store the user's decision about a reflection snapshot",
)
async def update_reflection_snapshot_decision_endpoint(
    snapshot_id: str,
    request: ReflectionSnapshotDecisionRequest,
) -> ReflectionSnapshotDecisionResponse:
    """Persist whether the user approved, edited, rejected, or kept only raw text."""

    response = update_reflection_snapshot_decision(snapshot_id, request.decision, settings)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return response


@router.patch(
    "/reflection-snapshots/{snapshot_id}/review",
    response_model=ReflectionSnapshotReviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Store the user's review of a reflection snapshot",
)
async def update_reflection_snapshot_review_endpoint(
    snapshot_id: str,
    request: ReflectionSnapshotReviewRequest,
) -> ReflectionSnapshotReviewResponse:
    """Persist the user's later review note and accuracy verdict for a thought node."""

    response = update_reflection_snapshot_review(
        snapshot_id,
        request.verdict,
        request.note,
        settings,
    )
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return response
