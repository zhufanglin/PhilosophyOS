"""Repository for resumable local dialogue sessions."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.knowledge import utc_now
from app.models.memory import DialogueRole, DialogueSession, DialogueSessionMessage


class DialogueRepository:
    """Persist dialogue turns and load recent sessions."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def save_turn(
        self,
        *,
        conversation_id: UUID,
        topic: str,
        mode: str,
        model_profile: str,
        turn_number: int,
        user_message: str,
        assistant_message: str,
        initial_assistant_message: str | None,
        provider: str,
        provider_model: str | None,
    ) -> None:
        """Store a user/assistant turn and create its session when needed."""

        with Session(self.engine) as session:
            dialogue = session.get(DialogueSession, conversation_id)
            if dialogue is None:
                dialogue = DialogueSession(
                    id=conversation_id,
                    topic=topic,
                    title=topic[:200],
                    current_mode=mode,
                    model_profile=model_profile,
                )
                session.add(dialogue)
                if initial_assistant_message:
                    session.add(
                        DialogueSessionMessage(
                            conversation_id=conversation_id,
                            role=DialogueRole.ASSISTANT,
                            content=initial_assistant_message,
                            turn_number=0,
                            mode="socratic",
                            model_profile=model_profile,
                            provider="local",
                        )
                    )

            dialogue.current_mode = mode
            dialogue.model_profile = model_profile
            dialogue.updated_at = utc_now()

            existing_roles = set(
                session.scalars(
                    select(DialogueSessionMessage.role).where(
                        DialogueSessionMessage.conversation_id == conversation_id,
                        DialogueSessionMessage.turn_number == turn_number,
                    )
                )
            )
            if DialogueRole.USER not in existing_roles:
                session.add(
                    DialogueSessionMessage(
                        conversation_id=conversation_id,
                        role=DialogueRole.USER,
                        content=user_message,
                        turn_number=turn_number,
                        mode=mode,
                        model_profile=model_profile,
                    )
                )
            if DialogueRole.ASSISTANT not in existing_roles:
                session.add(
                    DialogueSessionMessage(
                        conversation_id=conversation_id,
                        role=DialogueRole.ASSISTANT,
                        content=assistant_message,
                        turn_number=turn_number,
                        mode=mode,
                        model_profile=model_profile,
                        provider=provider,
                        provider_model=provider_model,
                    )
                )
            session.commit()

    def list_recent(self, *, limit: int) -> list[tuple[DialogueSession, int]]:
        """Return recent sessions with their user-turn counts."""

        turn_count = func.count(DialogueSessionMessage.id).filter(
            DialogueSessionMessage.role == DialogueRole.USER
        )
        statement = (
            select(DialogueSession, turn_count)
            .outerjoin(
                DialogueSessionMessage,
                DialogueSessionMessage.conversation_id == DialogueSession.id,
            )
            .group_by(DialogueSession.id)
            .order_by(DialogueSession.updated_at.desc())
            .limit(limit)
        )
        with Session(self.engine) as session:
            return list(session.execute(statement).tuples())

    def get(self, conversation_id: UUID) -> DialogueSession | None:
        """Load one session and all messages before closing the DB session."""

        statement = (
            select(DialogueSession)
            .options(selectinload(DialogueSession.messages))
            .where(DialogueSession.id == conversation_id)
        )
        with Session(self.engine) as session:
            return session.scalar(statement)


def iso_timestamp(value: datetime) -> str:
    """Serialize SQLite timestamps consistently for the API."""

    return value.isoformat()
