"""REST resources for durable thought-change snapshots."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.schemas.reflection_snapshots import (
    ReflectionSnapshotRequest,
    ReflectionSnapshotResponse,
)
from app.services.reflection_snapshots import create_reflection_snapshot
from app.settings import settings

router = APIRouter(prefix="/api/v1", tags=["reflection-snapshots"])


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
