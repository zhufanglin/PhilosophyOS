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
