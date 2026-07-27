"""后端运行时配置测试。"""

from __future__ import annotations

import pytest

from app.settings import PhilosophyOSSettings


def test_openai_base_url_loads_from_backend_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """OPENAI_BASE_URL 只作为后端环境变量读取，用于兼容中转站。"""

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_BASE_URL", " https://relay.example.com/v1 ")

    settings = PhilosophyOSSettings.from_env()

    assert settings.openai_api_key is not None
    assert settings.openai_base_url == "https://relay.example.com/v1"


def test_blank_openai_base_url_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    """空的 OPENAI_BASE_URL 会被视为未配置，保持官方默认地址。"""

    monkeypatch.setenv("OPENAI_BASE_URL", "   ")

    settings = PhilosophyOSSettings.from_env()

    assert settings.openai_base_url is None


def test_openai_api_style_loads_from_backend_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """OPENAI_API_STYLE 可切换 Responses 与 Chat Completions 调用风格。"""

    monkeypatch.setenv("OPENAI_API_STYLE", "chat_completions")

    settings = PhilosophyOSSettings.from_env()

    assert settings.openai_api_style == "chat_completions"


def test_gpt_profile_uses_gpt_specific_settings_first() -> None:
    """GPT profile can use its own key/model/base URL without losing legacy fallback."""

    settings = PhilosophyOSSettings(
        model_profile="gpt",
        openai_api_key="legacy-key",
        openai_model="legacy-model",
        openai_base_url="https://legacy.example.com/v1",
        openai_api_style="responses",
        gpt_api_key="gpt-key",
        gpt_model="gpt-5.6",
        gpt_base_url="https://gpt.example.com/v1",
        gpt_api_style="chat_completions",
    )

    assert settings.selected_api_key is not None
    assert settings.selected_api_key.get_secret_value() == "gpt-key"
    assert settings.selected_model == "gpt-5.6"
    assert settings.selected_base_url == "https://gpt.example.com/v1"
    assert settings.selected_api_style == "chat_completions"


def test_gpt_profile_falls_back_to_legacy_openai_settings() -> None:
    """Existing OPENAI_* configuration remains valid for the GPT profile."""

    settings = PhilosophyOSSettings(
        model_profile="gpt",
        openai_api_key="legacy-key",
        openai_model="gpt-5.6",
        openai_base_url="https://relay.example.com/v1",
        openai_api_style="responses",
    )

    assert settings.selected_api_key is not None
    assert settings.selected_api_key.get_secret_value() == "legacy-key"
    assert settings.selected_model == "gpt-5.6"
    assert settings.selected_base_url == "https://relay.example.com/v1"
    assert settings.selected_api_style == "responses"


def test_deepseek_profile_uses_deepseek_specific_settings() -> None:
    """DeepSeek profile uses its own key/model/base URL and Chat Completions style."""

    settings = PhilosophyOSSettings(
        model_profile="deepseek",
        openai_api_key="legacy-key",
        gpt_api_key="gpt-key",
        deepseek_api_key="deepseek-key",
        deepseek_model="deepseek-v4-pro",
        deepseek_base_url="https://api.deepseek.com",
        deepseek_api_style="chat_completions",
    )

    assert settings.selected_api_key is not None
    assert settings.selected_api_key.get_secret_value() == "deepseek-key"
    assert settings.selected_model == "deepseek-v4-pro"
    assert settings.selected_base_url == "https://api.deepseek.com"
    assert settings.selected_api_style == "chat_completions"


def test_free_profile_uses_free_model_settings() -> None:
    """Free profile can point to a platform-provided low-cost default model."""

    settings = PhilosophyOSSettings(
        model_profile="free",
        free_api_key="free-key",
        free_model="doubao-seed-2-0-lite-260428",
        free_base_url="https://ark.cn-beijing.volces.com/api/v3",
        free_api_style="chat_completions",
    )

    assert settings.selected_api_key is not None
    assert settings.selected_api_key.get_secret_value() == "free-key"
    assert settings.selected_model == "doubao-seed-2-0-lite-260428"
    assert settings.selected_base_url == "https://ark.cn-beijing.volces.com/api/v3"
    assert settings.selected_api_style == "chat_completions"
