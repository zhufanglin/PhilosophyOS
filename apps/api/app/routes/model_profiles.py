"""REST resources for safe model profile status."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter

from app.schemas.model_profiles import ModelProfilesResponse, ModelProfileStatus
from app.settings import PhilosophyOSSettings, settings

router = APIRouter(prefix="/api/v1", tags=["model-profiles"])


def base_url_host(base_url: str | None) -> str | None:
    """Return only the host part of a base URL so secrets or paths cannot leak."""

    if base_url is None:
        return None
    parsed = urlparse(base_url)
    return parsed.netloc or parsed.path or None


def build_model_profiles_response(
    current_settings: PhilosophyOSSettings = settings,
) -> ModelProfilesResponse:
    """Build a safe model-profile status payload for browser clients."""

    return ModelProfilesResponse(
        selected_profile=current_settings.model_profile,
        profiles=[
            ModelProfileStatus(
                profile="free",
                label="免费",
                configured=current_settings.free_api_key is not None,
                model=current_settings.free_model,
                base_url_host=base_url_host(current_settings.free_base_url),
                api_style=current_settings.free_api_style,
            ),
            ModelProfileStatus(
                profile="gpt",
                label="GPT",
                configured=(current_settings.gpt_api_key or current_settings.openai_api_key)
                is not None,
                model=current_settings.gpt_model or current_settings.openai_model,
                base_url_host=base_url_host(
                    current_settings.gpt_base_url or current_settings.openai_base_url
                ),
                api_style=current_settings.gpt_api_style or current_settings.openai_api_style,
            ),
            ModelProfileStatus(
                profile="deepseek",
                label="DeepSeek",
                configured=current_settings.deepseek_api_key is not None,
                model=current_settings.deepseek_model,
                base_url_host=base_url_host(current_settings.deepseek_base_url),
                api_style=current_settings.deepseek_api_style,
            ),
        ],
    )


@router.get(
    "/model-profiles",
    response_model=ModelProfilesResponse,
    summary="List safe model profile configuration status",
)
async def list_model_profiles() -> ModelProfilesResponse:
    """Return key-free backend model profile status for the frontend."""

    return build_model_profiles_response(settings)
