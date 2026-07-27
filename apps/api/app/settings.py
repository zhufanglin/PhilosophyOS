"""Typed runtime settings for PhilosophyOS API.

环境变量只在后端读取；浏览器不应接触 OpenAI key。
"""

from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator

AIProviderName = Literal["auto", "openai", "deterministic"]
OpenAIAPIStyle = Literal["responses", "chat_completions"]
ModelProfile = Literal["free", "gpt", "deepseek"]


class PhilosophyOSSettings(BaseModel):
    """Small typed settings object backed by environment variables."""

    openai_api_key: SecretStr | None = None
    openai_model: str = Field(default="gpt-5.6", min_length=1)
    openai_base_url: str | None = None
    openai_api_style: OpenAIAPIStyle = "responses"
    model_profile: ModelProfile = "free"
    free_api_key: SecretStr | None = None
    free_model: str = Field(default="doubao-seed-2-0-lite-260428", min_length=1)
    free_base_url: str = Field(default="https://ark.cn-beijing.volces.com/api/v3", min_length=1)
    free_api_style: OpenAIAPIStyle = "responses"
    gpt_api_key: SecretStr | None = None
    gpt_model: str | None = None
    gpt_base_url: str | None = None
    gpt_api_style: OpenAIAPIStyle | None = None
    deepseek_api_key: SecretStr | None = None
    deepseek_model: str = Field(default="deepseek-v4-flash", min_length=1)
    deepseek_base_url: str = Field(default="https://api.deepseek.com", min_length=1)
    deepseek_api_style: OpenAIAPIStyle = "chat_completions"
    ai_provider: AIProviderName = "auto"

    @field_validator(
        "openai_api_key",
        "openai_base_url",
        "gpt_api_key",
        "gpt_model",
        "gpt_base_url",
        "gpt_api_style",
        "free_api_key",
        "deepseek_api_key",
        mode="before",
    )
    @classmethod
    def blank_optional_values_become_none(cls, value: object) -> object:
        """Treat empty optional environment variables as missing values."""

        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("openai_base_url", "gpt_base_url")
    @classmethod
    def strip_base_url(cls, value: str | None) -> str | None:
        """Normalize an optional OpenAI-compatible base URL."""

        if value is None:
            return None
        return value.strip()

    @field_validator(
        "openai_model",
        "free_model",
        "free_base_url",
        "deepseek_model",
        "deepseek_base_url",
    )
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        """Normalize required settings without silently accepting emptiness."""

        return value.strip()

    @field_validator("gpt_model")
    @classmethod
    def strip_optional_model(cls, value: str | None) -> str | None:
        """Normalize optional model names."""

        if value is None:
            return None
        return value.strip()

    @property
    def selected_api_key(self) -> SecretStr | None:
        """Return the API key for the selected model profile."""

        if self.model_profile == "free":
            return self.free_api_key
        if self.model_profile == "deepseek":
            return self.deepseek_api_key
        return self.gpt_api_key or self.openai_api_key

    @property
    def selected_model(self) -> str:
        """Return the model for the selected model profile."""

        if self.model_profile == "free":
            return self.free_model
        if self.model_profile == "deepseek":
            return self.deepseek_model
        return self.gpt_model or self.openai_model

    @property
    def selected_base_url(self) -> str | None:
        """Return the OpenAI-compatible base URL for the selected model profile."""

        if self.model_profile == "free":
            return self.free_base_url
        if self.model_profile == "deepseek":
            return self.deepseek_base_url
        return self.gpt_base_url or self.openai_base_url

    @property
    def selected_api_style(self) -> OpenAIAPIStyle:
        """Return the API style for the selected model profile."""

        if self.model_profile == "free":
            return self.free_api_style
        if self.model_profile == "deepseek":
            return self.deepseek_api_style
        return self.gpt_api_style or self.openai_api_style

    @classmethod
    def from_env(cls) -> PhilosophyOSSettings:
        """Load settings from the process environment."""

        return cls(
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            openai_model=os.getenv("OPENAI_MODEL", "gpt-5.6"),
            openai_base_url=os.getenv("OPENAI_BASE_URL"),
            openai_api_style=os.getenv("OPENAI_API_STYLE", "responses"),
            model_profile=os.getenv("PHILOSOPHYOS_MODEL_PROFILE", "free"),
            free_api_key=os.getenv("FREE_API_KEY"),
            free_model=os.getenv("FREE_MODEL", "doubao-seed-2-0-lite-260428"),
            free_base_url=os.getenv("FREE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
            free_api_style=os.getenv("FREE_API_STYLE", "responses"),
            gpt_api_key=os.getenv("GPT_API_KEY"),
            gpt_model=os.getenv("GPT_MODEL"),
            gpt_base_url=os.getenv("GPT_BASE_URL"),
            gpt_api_style=os.getenv("GPT_API_STYLE"),
            deepseek_api_key=os.getenv("DEEPSEEK_API_KEY"),
            deepseek_model=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            deepseek_base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            deepseek_api_style=os.getenv("DEEPSEEK_API_STYLE", "chat_completions"),
            ai_provider=os.getenv("PHILOSOPHYOS_AI_PROVIDER", "auto"),
        )


settings = PhilosophyOSSettings.from_env()
