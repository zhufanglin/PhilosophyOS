"""Application service for durable dialogue sessions."""

from __future__ import annotations

from uuid import UUID, uuid4

from app.models.memory import DialogueRole, DialogueSession
from app.schemas.dialogue import (
    DialogueRequest,
    DialogueResponse,
    DialogueSessionDetail,
    DialogueSessionListResponse,
    DialogueSessionMessage,
    DialogueSessionSummary,
)
from app.settings import PhilosophyOSSettings
from app.storage.database import create_snapshot_engine
from app.storage.dialogue_repository import DialogueRepository, iso_timestamp


def dialogue_repository(current_settings: PhilosophyOSSettings) -> DialogueRepository:
    """Open the shared local SQLite store."""

    return DialogueRepository(create_snapshot_engine(current_settings.thought_snapshots_path))


def persist_dialogue_turn(
    request: DialogueRequest,
    response: DialogueResponse,
    current_settings: PhilosophyOSSettings,
) -> DialogueResponse:
    """Persist one complete turn and return its stable conversation id."""

    conversation_id = request.conversation_id or uuid4()
    topic = request.topic or request.user_message[:300]
    dialogue_repository(current_settings).save_turn(
        conversation_id=conversation_id,
        topic=topic,
        mode=response.mode.value,
        model_profile=response.model_profile.value,
        turn_number=request.turn_number,
        user_message=request.user_message,
        assistant_message=response.assistant_message,
        initial_assistant_message=request.initial_assistant_message,
        provider=response.provider,
        provider_model=response.provider_model,
    )
    return response.model_copy(update={"conversation_id": conversation_id})


def session_summary(dialogue: DialogueSession, turn_count: int) -> DialogueSessionSummary:
    """Map a database session to its public summary."""

    return DialogueSessionSummary(
        conversation_id=dialogue.id,
        title=dialogue.title,
        topic=dialogue.topic,
        current_mode=dialogue.current_mode,
        model_profile=dialogue.model_profile,
        turn_count=turn_count,
        finished=dialogue.finished,
        created_at=iso_timestamp(dialogue.created_at),
        updated_at=iso_timestamp(dialogue.updated_at),
    )


def list_dialogue_sessions(
    current_settings: PhilosophyOSSettings,
    *,
    limit: int,
) -> DialogueSessionListResponse:
    """List recent local dialogue sessions."""

    items = [
        session_summary(dialogue, turn_count)
        for dialogue, turn_count in dialogue_repository(current_settings).list_recent(limit=limit)
    ]
    return DialogueSessionListResponse(items=items)


def get_dialogue_session(
    conversation_id: UUID,
    current_settings: PhilosophyOSSettings,
) -> DialogueSessionDetail | None:
    """Load a complete resumable dialogue session."""

    dialogue = dialogue_repository(current_settings).get(conversation_id)
    if dialogue is None:
        return None
    messages = [
        DialogueSessionMessage(
            message_id=message.id,
            role="assistant" if message.role is DialogueRole.ASSISTANT else "user",
            body=message.content,
            turn_number=message.turn_number,
            mode=message.mode,
            model_profile=message.model_profile,
            provider_model=message.provider_model,
            created_at=iso_timestamp(message.created_at),
        )
        for message in dialogue.messages
    ]
    turn_count = sum(message.role is DialogueRole.USER for message in dialogue.messages)
    summary = session_summary(dialogue, turn_count)
    return DialogueSessionDetail(**summary.model_dump(), messages=messages)
