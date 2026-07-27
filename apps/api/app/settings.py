"""Typed runtime settings for PhilosophyOS API.

环境变量只在后端读取；浏览器不应接触 OpenAI key。
"""

from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator

AIProviderName = Literal["auto", "openai", "deterministic"]


class PhilosophyOSSettings(BaseModel):
    """Small typed settings object backed by environment variables."""

    openai_api_key: SecretStr | None = None
    openai_model: str = Field(default="gpt-5.6", min_length=1)
    ai_provider: AIProviderName = "auto"

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def blank_key_becomes_none(cls, value: object) -> object:
        """Treat empty environment variables as missing secrets."""

        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("openai_model")
    @classmethod
    def strip_model(cls, value: str) -> str:
        """Normalize model names without silently accepting emptiness."""

        return value.strip()

    @classmethod
    def from_env(cls) -> PhilosophyOSSettings:
        """Load settings from the process environment."""

        return cls(
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            openai_model=os.getenv("OPENAI_MODEL", "gpt-5.6"),
            ai_provider=os.getenv("PHILOSOPHYOS_AI_PROVIDER", "auto"),
        )


settings = PhilosophyOSSettings.from_env()
