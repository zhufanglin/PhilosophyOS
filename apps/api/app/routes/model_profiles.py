"""REST resources for safe model profile status."""

from __future__ import annotations

from urllib.parse import urlparse, urlunparse

from fastapi import APIRouter

from app.agent.providers import ProviderRequest, select_dialogue_provider
from app.schemas.dialogue import DialogueMode
from app.schemas.model_profiles import (
    ConnectionTestCode,
    ModelProfileConnectionTestResponse,
    ModelProfilesResponse,
    ModelProfileStatus,
    ModelProfileUpdateRequest,
)
from app.settings import ModelProfile, PhilosophyOSSettings, settings
from app.storage.model_profile_repository import save_profile

router = APIRouter(prefix="/api/v1", tags=["model-profiles"])

MODEL_PROFILE_ORDER: tuple[ModelProfile, ...] = (
    "free",
    "gpt",
    "deepseek",
    "qwen",
    "kimi",
    "zhipu",
    "siliconflow",
)
MODEL_PROFILE_LABELS: dict[ModelProfile, str] = {
    "free": "豆包",
    "gpt": "GPT",
    "deepseek": "DeepSeek",
    "qwen": "通义千问",
    "kimi": "Kimi",
    "zhipu": "智谱 GLM",
    "siliconflow": "硅基流动",
}


def base_url_host(base_url: str | None) -> str | None:
    """Return only the host part of a base URL so secrets or paths cannot leak."""

    if base_url is None:
        return None
    parsed = urlparse(base_url)
    if parsed.hostname is None:
        return parsed.path or None
    port = f":{parsed.port}" if parsed.port is not None else ""
    return f"{parsed.hostname}{port}"


def safe_base_url(base_url: str | None) -> str | None:
    """Keep a useful endpoint path while removing credentials, query, and fragment."""

    if base_url is None:
        return None
    parsed = urlparse(base_url)
    hostname = parsed.hostname
    if not hostname:
        return None
    port = f":{parsed.port}" if parsed.port is not None else ""
    return urlunparse((parsed.scheme, f"{hostname}{port}", parsed.path, "", "", ""))


def profile_status(profile: ModelProfile, current_settings: PhilosophyOSSettings) -> ModelProfileStatus:
    """Build one safe, key-free profile status."""

    if profile == "gpt":
        configured = (current_settings.gpt_api_key or current_settings.openai_api_key) is not None
        model = current_settings.gpt_model or current_settings.openai_model
        base_url = current_settings.gpt_base_url or current_settings.openai_base_url
        api_style = current_settings.gpt_api_style or current_settings.openai_api_style
    else:
        configured = getattr(current_settings, f"{profile}_api_key") is not None
        model = getattr(current_settings, f"{profile}_model")
        base_url = getattr(current_settings, f"{profile}_base_url")
        api_style = getattr(current_settings, f"{profile}_api_style")
    return ModelProfileStatus(
        profile=profile,
        label=MODEL_PROFILE_LABELS[profile],
        configured=configured,
        model=model,
        base_url_host=base_url_host(base_url),
        base_url=safe_base_url(base_url),
        api_style=api_style,
    )


def build_model_profiles_response(
    current_settings: PhilosophyOSSettings = settings,
) -> ModelProfilesResponse:
    """Build a safe model-profile status payload for browser clients."""

    return ModelProfilesResponse(
        selected_profile=current_settings.model_profile,
        profiles=[profile_status(profile, current_settings) for profile in MODEL_PROFILE_ORDER],
    )


@router.get(
    "/model-profiles",
    response_model=ModelProfilesResponse,
    summary="List safe model profile configuration status",
)
async def list_model_profiles() -> ModelProfilesResponse:
    """Return key-free backend model profile status for the frontend."""

    return build_model_profiles_response(settings)


@router.patch(
    "/model-profiles/{profile}",
    response_model=ModelProfilesResponse,
    summary="Save one local model profile without returning its key",
)
async def update_model_profile(
    profile: ModelProfile,
    request: ModelProfileUpdateRequest,
) -> ModelProfilesResponse:
    """Persist browser-provided settings in the local SQLite store."""

    selected = settings.model_copy(update={"model_profile": profile})
    current_key = (
        selected.selected_api_key.get_secret_value()
        if selected.selected_api_key
        else None
    )
    api_key = request.api_key if request.api_key is not None and request.api_key else current_key
    updates = {
        f"{profile}_api_key": api_key,
        f"{profile}_model": request.model,
        f"{profile}_base_url": request.base_url,
        f"{profile}_api_style": request.api_style,
    }
    for name, value in updates.items():
        setattr(settings, name, value)
    if request.selected:
        settings.model_profile = profile

    save_profile(
        settings,
        profile,
        api_key=api_key,
        model=request.model,
        base_url=request.base_url,
        api_style=request.api_style,
        selected=request.selected,
    )
    return build_model_profiles_response(settings)


def classify_connection_error(error: Exception) -> tuple[ConnectionTestCode, str]:
    """Map upstream/provider failures to safe user-facing diagnostics."""

    status_code = getattr(error, "status_code", None)
    if status_code in {401, 403}:
        return "authentication_failed", "认证失败：请检查 API Key 是否正确或是否已启用。"
    if status_code == 404:
        return "model_not_found", "模型不可用：请检查模型名或中转站是否支持该模型。"
    if status_code == 429:
        return "rate_limited", "请求被限流：额度可能不足，或服务商暂时限制访问。"
    if status_code in {408, 504} or isinstance(error, TimeoutError):
        return "timeout", "连接超时：请稍后重试，或检查网络与 Base URL。"
    return "upstream_error", "连接失败：请检查 Base URL、模型名、接口风格和服务商状态。"


def build_connection_test_response(
    profile: ModelProfile,
    current_settings: PhilosophyOSSettings = settings,
) -> ModelProfileConnectionTestResponse:
    """Test one configured model profile without exposing secrets."""

    profile_settings = current_settings.model_copy(update={"model_profile": profile})
    if profile_settings.selected_api_key is None:
        return ModelProfileConnectionTestResponse(
            profile=profile,
            ok=False,
            code="not_configured",
            message="尚未配置 API Key：请先在后端 .env 中填写这一组模型配置。",
            model=profile_settings.selected_model,
        )

    provider = select_dialogue_provider(profile_settings)
    request = ProviderRequest(
        user_message="测试连接",
        mode=DialogueMode.EXPLAIN,
        topic="模型连接测试",
        turn_number=1,
        prompt="请只回复：连接成功",
        deterministic_message="连接成功",
    )

    try:
        provider.generate(request)
    except Exception as error:
        code, message = classify_connection_error(error)
        return ModelProfileConnectionTestResponse(
            profile=profile,
            ok=False,
            code=code,
            message=message,
            model=profile_settings.selected_model,
        )

    return ModelProfileConnectionTestResponse(
        profile=profile,
        ok=True,
        code="ok",
        message="连接成功：后端已能通过当前配置调用该模型。",
        model=profile_settings.selected_model,
    )


@router.post(
    "/model-profiles/{profile}/test-connection",
    response_model=ModelProfileConnectionTestResponse,
    summary="Test one model profile connection",
)
async def test_model_profile_connection(
    profile: ModelProfile,
) -> ModelProfileConnectionTestResponse:
    """Run a short key-free model connection test for the selected profile."""

    return build_connection_test_response(profile, settings)
