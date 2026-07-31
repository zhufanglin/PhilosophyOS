"""REST resources for controlled philosophical dialogue turns."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.agent.orchestrator import dialogue_orchestrator
from app.schemas.dialogue import (
    DialogueRequest,
    DialogueResponse,
    DialogueSessionDetail,
    DialogueSessionListResponse,
)
from app.services.dialogue_sessions import (
    get_dialogue_session,
    list_dialogue_sessions,
    persist_dialogue_turn,
)
from app.settings import settings

router = APIRouter(prefix="/api/v1", tags=["dialogue"])


@router.post(
    "/dialogue-turns",
    response_model=DialogueResponse,
    status_code=status.HTTP_200_OK,
    summary="Create one controlled philosophical dialogue turn",
)
async def create_dialogue_turn(request: DialogueRequest) -> DialogueResponse:
    """Return one policy-checked assistant turn for the selected dialogue mode."""

    response = dialogue_orchestrator.respond(request)
    return persist_dialogue_turn(request, response, settings)


@router.get(
    "/dialogue-sessions",
    response_model=DialogueSessionListResponse,
    status_code=status.HTTP_200_OK,
    summary="List recent local dialogue sessions",
)
async def list_dialogue_sessions_endpoint(
    limit: int = Query(default=8, ge=1, le=30),
) -> DialogueSessionListResponse:
    """Return recent sessions for the dialogue resume picker."""

    return list_dialogue_sessions(settings, limit=limit)


@router.get(
    "/dialogue-sessions/{conversation_id}",
    response_model=DialogueSessionDetail,
    status_code=status.HTTP_200_OK,
    summary="Load one local dialogue session",
)
async def get_dialogue_session_endpoint(conversation_id: UUID) -> DialogueSessionDetail:
    """Return one session with its complete ordered message history."""

    response = get_dialogue_session(conversation_id, settings)
    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dialogue session not found",
        )
    return response
