"""REST resources for controlled philosophical dialogue turns."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.agent.orchestrator import dialogue_orchestrator
from app.schemas.dialogue import DialogueRequest, DialogueResponse

router = APIRouter(prefix="/api/v1", tags=["dialogue"])


@router.post(
    "/dialogue-turns",
    response_model=DialogueResponse,
    status_code=status.HTTP_200_OK,
    summary="Create one controlled philosophical dialogue turn",
)
async def create_dialogue_turn(request: DialogueRequest) -> DialogueResponse:
    """Return one policy-checked assistant turn for the selected dialogue mode."""

    return dialogue_orchestrator.respond(request)
