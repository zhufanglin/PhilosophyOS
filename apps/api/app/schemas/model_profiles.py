"""Public contracts for model profile configuration status.

这些响应只能暴露“是否已配置”和模型元信息，不能返回任何 API Key。
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.settings import ModelProfile, OpenAIAPIStyle


class ModelProfileStatus(BaseModel):
    """Safe, key-free status for one backend model profile."""

    profile: ModelProfile
    label: str = Field(min_length=1)
    configured: bool
    model: str = Field(min_length=1)
    base_url_host: str | None = None
    api_style: OpenAIAPIStyle


class ModelProfilesResponse(BaseModel):
    """Safe model profile status list for frontend selection UI."""

    selected_profile: ModelProfile
    profiles: list[ModelProfileStatus]
