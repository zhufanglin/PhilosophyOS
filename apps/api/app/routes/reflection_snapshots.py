"""REST resources for durable thought-change snapshots."""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.schemas.reflection_snapshots import (
    ReflectionSnapshotListResponse,
    ReflectionSnapshotRequest,
    ReflectionSnapshotResponse,
)
from app.services.reflection_snapshots import create_reflection_snapshot, list_reflection_snapshots
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
