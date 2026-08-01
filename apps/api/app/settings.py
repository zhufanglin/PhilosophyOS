"""Typed runtime settings for PhilosophyOS API.

环境变量只在后端读取；浏览器不应接触 OpenAI key。
"""

from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

AIProviderName = Literal["auto", "openai", "deterministic"]
OpenAIAPIStyle = Literal["responses", "chat_completions"]
ModelProfile = Literal["free", "gpt", "deepseek", "qwen", "kimi", "zhipu", "siliconflow"]


class PhilosophyOSSettings(BaseModel):
    """Small typed settings object backed by environment variables."""

    model_config = ConfigDict(validate_assignment=True)

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
    qwen_api_key: SecretStr | None = None
    qwen_model: str = Field(default="qwen-plus", min_length=1)
    qwen_base_url: str = Field(default="https://dashscope.aliyuncs.com/compatible-mode/v1", min_length=1)
    qwen_api_style: OpenAIAPIStyle = "chat_completions"
    kimi_api_key: SecretStr | None = None
    kimi_model: str = Field(default="moonshot-v1-8k", min_length=1)
    kimi_base_url: str = Field(default="https://api.moonshot.cn/v1", min_length=1)
    kimi_api_style: OpenAIAPIStyle = "chat_completions"
    zhipu_api_key: SecretStr | None = None
    zhipu_model: str = Field(default="glm-4-plus", min_length=1)
    zhipu_base_url: str = Field(default="https://open.bigmodel.cn/api/paas/v4", min_length=1)
    zhipu_api_style: OpenAIAPIStyle = "chat_completions"
    siliconflow_api_key: SecretStr | None = None
    siliconflow_model: str = Field(default="Qwen/Qwen2.5-72B-Instruct", min_length=1)
    siliconflow_base_url: str = Field(default="https://api.siliconflow.cn/v1", min_length=1)
    siliconflow_api_style: OpenAIAPIStyle = "chat_completions"
    ai_provider: AIProviderName = "auto"
    obsidian_drafts_dir: str = Field(
        default=r"D:\Obsidian\storage\Stu的哲学思考\PhilosophyOS\草稿",
        min_length=1,
    )
    thought_snapshots_path: str = Field(
        default=r"data\local\thought-snapshots.jsonl",
        min_length=1,
    )

    @field_validator(
        "openai_api_key",
        "openai_base_url",
        "gpt_api_key",
        "gpt_model",
        "gpt_base_url",
        "gpt_api_style",
        "free_api_key",
        "deepseek_api_key",
        "qwen_api_key",
        "kimi_api_key",
        "zhipu_api_key",
        "siliconflow_api_key",
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
        "qwen_model",
        "qwen_base_url",
        "kimi_model",
        "kimi_base_url",
        "zhipu_model",
        "zhipu_base_url",
        "siliconflow_model",
        "siliconflow_base_url",
        "obsidian_drafts_dir",
        "thought_snapshots_path",
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
        if self.model_profile == "qwen":
            return self.qwen_api_key
        if self.model_profile == "kimi":
            return self.kimi_api_key
        if self.model_profile == "zhipu":
            return self.zhipu_api_key
        if self.model_profile == "siliconflow":
            return self.siliconflow_api_key
        return self.gpt_api_key or self.openai_api_key

    @property
    def selected_model(self) -> str:
        """Return the model for the selected model profile."""

        if self.model_profile == "free":
            return self.free_model
        if self.model_profile == "deepseek":
            return self.deepseek_model
        if self.model_profile == "qwen":
            return self.qwen_model
        if self.model_profile == "kimi":
            return self.kimi_model
        if self.model_profile == "zhipu":
            return self.zhipu_model
        if self.model_profile == "siliconflow":
            return self.siliconflow_model
        return self.gpt_model or self.openai_model

    @property
    def selected_base_url(self) -> str | None:
        """Return the OpenAI-compatible base URL for the selected model profile."""

        if self.model_profile == "free":
            return self.free_base_url
        if self.model_profile == "deepseek":
            return self.deepseek_base_url
        if self.model_profile == "qwen":
            return self.qwen_base_url
        if self.model_profile == "kimi":
            return self.kimi_base_url
        if self.model_profile == "zhipu":
            return self.zhipu_base_url
        if self.model_profile == "siliconflow":
            return self.siliconflow_base_url
        return self.gpt_base_url or self.openai_base_url

    @property
    def selected_api_style(self) -> OpenAIAPIStyle:
        """Return the API style for the selected model profile."""

        if self.model_profile == "free":
            return self.free_api_style
        if self.model_profile == "deepseek":
            return self.deepseek_api_style
        if self.model_profile == "qwen":
            return self.qwen_api_style
        if self.model_profile == "kimi":
            return self.kimi_api_style
        if self.model_profile == "zhipu":
            return self.zhipu_api_style
        if self.model_profile == "siliconflow":
            return self.siliconflow_api_style
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
            qwen_api_key=os.getenv("QWEN_API_KEY"),
            qwen_model=os.getenv("QWEN_MODEL", "qwen-plus"),
            qwen_base_url=os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
            qwen_api_style=os.getenv("QWEN_API_STYLE", "chat_completions"),
            kimi_api_key=os.getenv("KIMI_API_KEY"),
            kimi_model=os.getenv("KIMI_MODEL", "moonshot-v1-8k"),
            kimi_base_url=os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1"),
            kimi_api_style=os.getenv("KIMI_API_STYLE", "chat_completions"),
            zhipu_api_key=os.getenv("ZHIPU_API_KEY"),
            zhipu_model=os.getenv("ZHIPU_MODEL", "glm-4-plus"),
            zhipu_base_url=os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
            zhipu_api_style=os.getenv("ZHIPU_API_STYLE", "chat_completions"),
            siliconflow_api_key=os.getenv("SILICONFLOW_API_KEY"),
            siliconflow_model=os.getenv("SILICONFLOW_MODEL", "Qwen/Qwen2.5-72B-Instruct"),
            siliconflow_base_url=os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"),
            siliconflow_api_style=os.getenv("SILICONFLOW_API_STYLE", "chat_completions"),
            ai_provider=os.getenv("PHILOSOPHYOS_AI_PROVIDER", "auto"),
            obsidian_drafts_dir=os.getenv(
                "OBSIDIAN_DRAFTS_DIR",
                r"D:\Obsidian\storage\Stu的哲学思考\PhilosophyOS\草稿",
            ),
            thought_snapshots_path=os.getenv(
                "THOUGHT_SNAPSHOTS_PATH",
                r"data\local\thought-snapshots.jsonl",
            ),
        )


settings = PhilosophyOSSettings.from_env()

# SQLite is the durable local store; environment variables remain the first-run defaults.
try:
    from app.storage.model_profile_repository import restore_settings

    restore_settings(settings)
except Exception:
    # Startup must remain usable even if a previous local store is unavailable.
    pass
