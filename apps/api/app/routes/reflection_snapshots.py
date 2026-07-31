"""REST resources for durable thought-change snapshots."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.reflection_snapshots import (
    ReflectionSnapshotCorrectionRequest,
    ReflectionSnapshotCorrectionResponse,
    ReflectionSnapshotDecisionRequest,
    ReflectionSnapshotDecisionResponse,
    ReflectionSnapshotListResponse,
    ReflectionSnapshotRequest,
    ReflectionSnapshotResponse,
    ReflectionSnapshotReviewRequest,
    ReflectionSnapshotReviewResponse,
)
from app.services.reflection_snapshots import (
    correct_reflection_snapshot,
    create_reflection_snapshot,
    list_reflection_snapshots,
    retry_reflection_snapshot,
    update_reflection_snapshot_decision,
    update_reflection_snapshot_review,
)
from app.settings import settings

router = APIRouter(prefix="/api/v1", tags=["reflection-snapshots"])


@router.get(
    "/reflection-snapshots",
    response_model=ReflectionSnapshotListResponse,
    status_code=status.HTTP_200_OK,
    summary="List recent reflection snapshots",
)
async def list_reflection_snapshots_endpoint(
    limit: int = Query(default=30, ge=1, le=100),
) -> ReflectionSnapshotListResponse:
    """Return recent local thought snapshot records for timeline display."""

    return list_reflection_snapshots(settings, limit=limit)


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
