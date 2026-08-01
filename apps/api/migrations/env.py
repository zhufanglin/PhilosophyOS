"""Alembic migration environment for PhilosophyOS."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.models.knowledge import Base
from app.models.memory import (
    AttributedClaim,
    DialogueMessage,
    DialogueSession,
    DialogueSessionMessage,
    ModelProfileConfig,
)
from app.models.questions import DailyQuestion, QuestionInteraction
from app.models.reflection import ReflectionSnapshotRecord
from app.models.tenancy import User, Workspace, WorkspaceMembership

_MEMORY_MODELS = (AttributedClaim, DialogueMessage)
_QUESTION_MODELS = (DailyQuestion, QuestionInteraction)
_REFLECTION_MODELS = (ReflectionSnapshotRecord,)
_DIALOGUE_SESSION_MODELS = (DialogueSession, DialogueSessionMessage, ModelProfileConfig)
_TENANCY_MODELS = (User, Workspace, WorkspaceMembership)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without creating a database connection."""

    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations with a database connection."""

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
