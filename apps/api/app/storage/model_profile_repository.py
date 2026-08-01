"""SQLite persistence for local model profile configuration."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import insert, select, update

from app.models.memory import ModelProfileConfig
from app.services.model_profiles import decrypt_api_key, encrypt_api_key, is_encrypted_secret
from app.settings import ModelProfile, OpenAIAPIStyle, PhilosophyOSSettings
from app.storage.database import create_snapshot_engine


def _now() -> datetime:
    return datetime.now(UTC)


def restore_settings(current_settings: PhilosophyOSSettings) -> None:
    """Overlay saved local profiles on environment defaults after startup."""

    engine = create_snapshot_engine(current_settings.thought_snapshots_path)
    with engine.begin() as connection:
        rows = list(connection.execute(select(ModelProfileConfig)).mappings())

    for row in rows:
        profile = row["profile"]
        if profile not in {"free", "gpt", "deepseek"}:
            continue
        prefix = {"free": "free", "gpt": "gpt", "deepseek": "deepseek"}[profile]
        stored_api_key = row["api_key"]
        if stored_api_key:
            api_key = decrypt_api_key(stored_api_key)
            setattr(current_settings, f"{prefix}_api_key", api_key)
            if not is_encrypted_secret(stored_api_key):
                save_profile(
                    current_settings,
                    profile,
                    api_key=api_key,
                    model=row["model"],
                    base_url=row["base_url"],
                    api_style=row["api_style"],
                    selected=row["selected"],
                )
        setattr(current_settings, f"{prefix}_model", row["model"])
        setattr(current_settings, f"{prefix}_base_url", row["base_url"])
        setattr(current_settings, f"{prefix}_api_style", row["api_style"])
        if row["selected"]:
            current_settings.model_profile = profile


def save_profile(
    current_settings: PhilosophyOSSettings,
    profile: ModelProfile,
    *,
    api_key: str | None,
    model: str,
    base_url: str | None,
    api_style: OpenAIAPIStyle,
    selected: bool,
) -> None:
    """Upsert one profile and optionally make it the active profile."""

    engine = create_snapshot_engine(current_settings.thought_snapshots_path)
    values = {
        "profile": profile,
        "api_key": encrypt_api_key(api_key),
        "model": model,
        "base_url": base_url,
        "api_style": api_style,
        "selected": selected,
        "updated_at": _now(),
    }
    with engine.begin() as connection:
        existing = connection.execute(
            select(ModelProfileConfig.profile).where(ModelProfileConfig.profile == profile)
        ).first()
        if existing is None:
            connection.execute(insert(ModelProfileConfig).values(**values))
        else:
            connection.execute(
                update(ModelProfileConfig)
                .where(ModelProfileConfig.profile == profile)
                .values(**values)
            )
        if selected:
            connection.execute(
                update(ModelProfileConfig)
                .where(ModelProfileConfig.profile != profile)
                .values(selected=False)
            )


def seed_profile_rows(current_settings: PhilosophyOSSettings) -> None:
    """Copy environment defaults into SQLite only when no local rows exist."""

    engine = create_snapshot_engine(current_settings.thought_snapshots_path)
    with engine.begin() as connection:
        has_rows = connection.execute(select(ModelProfileConfig.profile).limit(1)).first()
    if has_rows is not None:
        return
    for profile in ("free", "gpt", "deepseek"):
        selected = current_settings.model_copy(update={"model_profile": profile})
        save_profile(
            current_settings,
            profile,
            api_key=selected.selected_api_key.get_secret_value()
            if selected.selected_api_key is not None
            else None,
            model=selected.selected_model,
            base_url=selected.selected_base_url,
            api_style=selected.selected_api_style,
            selected=current_settings.model_profile == profile,
        )
