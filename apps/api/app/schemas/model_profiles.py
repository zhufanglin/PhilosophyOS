"""Public contracts for model profile configuration status.

这些响应只能暴露“是否已配置”和模型元信息，不能返回任何 API Key。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.settings import ModelProfile, OpenAIAPIStyle

ConnectionTestCode = Literal[
    "ok",
    "not_configured",
    "authentication_failed",
    "model_not_found",
    "rate_limited",
    "timeout",
    "upstream_error",
]


class ModelProfileStatus(BaseModel):
    """Safe, key-free status for one backend model profile."""

    profile: ModelProfile
    label: str = Field(min_length=1)
    configured: bool
    model: str = Field(min_length=1)
    base_url_host: str | None = None
    base_url: str | None = None
    api_style: OpenAIAPIStyle


class ModelProfilesResponse(BaseModel):
    """Safe model profile status list for frontend selection UI."""

    selected_profile: ModelProfile
    profiles: list[ModelProfileStatus]


class ModelProfileUpdateRequest(BaseModel):
    """Browser-submitted configuration; the key is never echoed back."""

    api_key: str | None = Field(default=None, max_length=5000)
    model: str = Field(min_length=1, max_length=200)
    base_url: str = Field(min_length=1, max_length=500)
    api_style: OpenAIAPIStyle
    selected: bool = False

    @field_validator("api_key", "model", "base_url", mode="before")
    @classmethod
    def normalize_strings(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        from urllib.parse import urlparse

        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Base URL must be an http(s) URL")
        return value.rstrip("/")


class ModelProfileConnectionTestResponse(BaseModel):
    """Safe result of one backend-to-provider connection test."""

    profile: ModelProfile
    ok: bool
    code: ConnectionTestCode
    message: str = Field(min_length=1)
    model: str = Field(min_length=1)
