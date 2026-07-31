"""Create durable AI reflection snapshots with safe pending fallback."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import ValidationError

from app.agent.providers import ProviderRequest, select_dialogue_provider
from app.schemas.dialogue import DialogueMode, ModelProfile
from app.schemas.reflection_snapshots import (
    ReflectionSnapshotContent,
    ReflectionSnapshotCorrectionRequest,
    ReflectionSnapshotCorrectionResponse,
    ReflectionSnapshotDecisionResponse,
    ReflectionSnapshotListItem,
    ReflectionSnapshotListResponse,
    ReflectionSnapshotRequest,
    ReflectionSnapshotResponse,
    ReflectionSnapshotReview,
    ReflectionSnapshotReviewResponse,
    ReflectionSnapshotRevision,
    SnapshotDecision,
    SnapshotReviewVerdict,
    SnapshotStatus,
)
from app.settings import PhilosophyOSSettings, settings
from app.storage.database import create_snapshot_engine
from app.storage.reflection_repository import ReflectionSnapshotRepository


def build_snapshot_prompt(request: ReflectionSnapshotRequest) -> str:
    """Build a strict JSON prompt for one thought snapshot."""

    selected_items = [
        {"label": item.label, "origin": item.origin.value, "text": item.text}
        for item in request.selected_items
    ]
    source_payload = {
        "question": request.question,
        "user_statements": request.user_statements,
        "selected_items": selected_items,
    }
    return (
        "你是 PhilosophyOS 的思想快照生成器。请只根据用户原话与用户确认保存的条目，"
        "生成一份可追踪思想变化的 JSON。不要把 AI 建议伪装成用户立场；不确定就写入 tensions。"
        "\n\n必须只输出 JSON，不要 Markdown，不要解释。JSON 结构如下："
        "\n{"
        '\n  "topic": "主题",'
        '\n  "title": "一句话标题",'
        '\n  "user_position": "用户当前立场",'
        '\n  "confidence": 0.0,'
        '\n  "emotional_tone": "情绪/思考状态",'
        '\n  "core_question": "核心问题",'
        '\n  "key_insights": ["洞见"],'
        '\n  "tensions": ["未解决张力"],'
        '\n  "related_philosophers": [{"name": "哲学家", "reason": "关联原因"}],'
        '\n  "change_signal": {'
        '\n    "changed": false,'
        '\n    "previous_position": null,'
        '\n    "current_position": "当前立场",'
        '\n    "change_type": null'
        "\n  },"
        '\n  "next_question": "下一步问题",'
        '\n  "tags": ["标签"]'
        "\n}"
        "\n\n输入资料："
        f"\n{json.dumps(source_payload, ensure_ascii=False)}"
    )


def parse_snapshot_content(raw_text: str) -> ReflectionSnapshotContent:
    """Parse model output into the public snapshot content schema."""

    text = raw_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end >= start:
        text = text[start : end + 1]

    payload = json.loads(text)
    return ReflectionSnapshotContent.model_validate(payload)


def snapshot_repository(
    current_settings: PhilosophyOSSettings,
) -> ReflectionSnapshotRepository:
    """Open the local store and idempotently import legacy JSONL records."""

    repository = ReflectionSnapshotRepository(
        create_snapshot_engine(current_settings.thought_snapshots_path)
    )
    repository.import_jsonl(current_settings.thought_snapshots_path)
    return repository


def persist_snapshot_record(
    response: ReflectionSnapshotResponse,
    request: ReflectionSnapshotRequest,
    current_settings: PhilosophyOSSettings,
) -> None:
    """Persist one snapshot event in the local SQLite store."""

    snapshot_repository(current_settings).add(
        created_at=datetime.now(UTC).isoformat(),
        request_payload=request.model_dump(mode="json"),
        response_payload=response.model_dump(mode="json"),
    )


def list_reflection_snapshots(
    current_settings: PhilosophyOSSettings = settings,
    *,
    limit: int = 30,
) -> ReflectionSnapshotListResponse:
    """Return the most recent snapshot events from the local SQLite store."""

    items: list[ReflectionSnapshotListItem] = []
    records = snapshot_repository(current_settings).list_recent(limit=limit)
    for record in records:
        try:
            response = ReflectionSnapshotResponse.model_validate(record.response_payload)
            items.append(
                ReflectionSnapshotListItem(
                    created_at=record.created_at,
                    question=record.question,
                    snapshot=response,
                )
            )
        except (TypeError, ValueError):
            continue

    return ReflectionSnapshotListResponse(items=items)


def update_reflection_snapshot_decision(
    snapshot_id: str,
    decision: SnapshotDecision,
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionSnapshotDecisionResponse | None:
    """Persist the user's decision about an AI-generated snapshot summary."""

    updated_at = datetime.now(UTC).isoformat()

    def apply_decision(response: dict[str, object]) -> dict[str, object]:
        response["user_decision"] = decision.value
        response["decision_updated_at"] = updated_at
        return response

    updated = snapshot_repository(current_settings).update_response(
        snapshot_id,
        apply_decision,
    )
    if updated is None:
        return None
    return ReflectionSnapshotDecisionResponse(
        snapshot_id=snapshot_id,
        user_decision=decision,
        decision_updated_at=updated_at,
    )


def update_reflection_snapshot_review(
    snapshot_id: str,
    verdict: SnapshotReviewVerdict,
    note: str | None,
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionSnapshotReviewResponse | None:
    """Persist the user's review of a stored thought snapshot."""

    updated_at = datetime.now(UTC).isoformat()
    review = ReflectionSnapshotReview(
        verdict=verdict,
        note=note.strip() if note and note.strip() else None,
        updated_at=updated_at,
    )

    def apply_review(response: dict[str, object]) -> dict[str, object]:
        response["snapshot_review"] = review.model_dump(mode="json")
        return response

    updated = snapshot_repository(current_settings).update_response(
        snapshot_id,
        apply_review,
    )
    if updated is None:
        return None
    return ReflectionSnapshotReviewResponse(
        snapshot_id=snapshot_id,
        snapshot_review=review,
    )


def create_reflection_snapshot(
    request: ReflectionSnapshotRequest,
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionSnapshotResponse:
    """Create and persist an AI thought snapshot, or persist a pending record."""

    snapshot_id = f"snap_{uuid4().hex}"
    model_profile = request.model_profile or ModelProfile(current_settings.model_profile)
    selected_settings = current_settings.model_copy(update={"model_profile": model_profile.value})

    response = generate_snapshot_response(
        snapshot_id,
        request,
        selected_settings,
        generation_attempts=1,
    )
    persist_snapshot_record(response, request, current_settings)
    return response


def generate_snapshot_response(
    snapshot_id: str,
    request: ReflectionSnapshotRequest,
    selected_settings: PhilosophyOSSettings,
    *,
    generation_attempts: int,
) -> ReflectionSnapshotResponse:
    """Run one model attempt without mutating the immutable source request."""

    attempted_at = datetime.now(UTC).isoformat()

    if (
        selected_settings.selected_api_key is None
        or selected_settings.ai_provider == "deterministic"
    ):
        return ReflectionSnapshotResponse(
            snapshot_id=snapshot_id,
            status=SnapshotStatus.PENDING,
            provider="none",
            pending_reason="当前模型没有可用 API key，已先保存原始记录，稍后可补生成思想快照。",
            generation_attempts=generation_attempts,
            last_generation_attempt_at=attempted_at,
        )

    provider = select_dialogue_provider(selected_settings)
    provider_request = ProviderRequest(
        user_message=request.question,
        mode=DialogueMode.ORGANIZE,
        topic=request.question,
        turn_number=1,
        prompt=build_snapshot_prompt(request),
        deterministic_message="",
    )

    try:
        provider_response = provider.generate(provider_request)
        content = parse_snapshot_content(provider_response.assistant_message)
    except (Exception, ValidationError, json.JSONDecodeError) as error:
        return ReflectionSnapshotResponse(
            snapshot_id=snapshot_id,
            status=SnapshotStatus.PENDING,
            provider="none",
            pending_reason=f"{type(error).__name__}: {error}",
            generation_attempts=generation_attempts,
            last_generation_attempt_at=attempted_at,
        )

    return ReflectionSnapshotResponse(
        snapshot_id=snapshot_id,
        status=SnapshotStatus.COMPLETED,
        content=content,
        provider=provider_response.provider,
        provider_model=provider_response.model,
        generation_attempts=generation_attempts,
        last_generation_attempt_at=attempted_at,
    )


def retry_reflection_snapshot(
    snapshot_id: str,
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionSnapshotResponse | None:
    """Retry generation for one pending snapshot using its original user evidence."""

    repository = snapshot_repository(current_settings)
    record = repository.get(snapshot_id)
    if record is None:
        return None

    request = ReflectionSnapshotRequest.model_validate(record.request_payload)
    existing = ReflectionSnapshotResponse.model_validate(record.response_payload)
    if existing.status is SnapshotStatus.COMPLETED:
        return existing

    model_profile = request.model_profile or ModelProfile(current_settings.model_profile)
    selected_settings = current_settings.model_copy(update={"model_profile": model_profile.value})
    retried = generate_snapshot_response(
        snapshot_id,
        request,
        selected_settings,
        generation_attempts=existing.generation_attempts + 1,
    ).model_copy(
        update={
            "user_decision": existing.user_decision,
            "decision_updated_at": existing.decision_updated_at,
            "snapshot_review": existing.snapshot_review,
            "revisions": existing.revisions,
        }
    )
    updated = repository.update_response(
        snapshot_id,
        lambda _: retried.model_dump(mode="json"),
    )
    return ReflectionSnapshotResponse.model_validate(updated) if updated else None


def correct_reflection_snapshot(
    snapshot_id: str,
    correction: ReflectionSnapshotCorrectionRequest,
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionSnapshotCorrectionResponse | None:
    """Apply a user correction while preserving the previous AI wording."""

    repository = snapshot_repository(current_settings)
    record = repository.get(snapshot_id)
    if record is None:
        return None

    existing = ReflectionSnapshotResponse.model_validate(record.response_payload)
    if existing.content is None:
        raise ValueError("Pending snapshots must be generated before correction")

    updated_at = datetime.now(UTC).isoformat()
    previous = existing.content
    revision = ReflectionSnapshotRevision(
        updated_at=updated_at,
        previous_user_position=previous.user_position,
        previous_tensions=previous.tensions,
        previous_next_question=previous.next_question,
    )
    corrected_content = previous.model_copy(
        update={
            "user_position": correction.user_position,
            "tensions": correction.tensions,
            "next_question": correction.next_question,
        }
    )
    corrected = existing.model_copy(
        update={
            "content": corrected_content,
            "user_decision": SnapshotDecision.EDIT,
            "decision_updated_at": updated_at,
            "revisions": [*existing.revisions, revision],
        }
    )
    repository.update_response(
        snapshot_id,
        lambda _: corrected.model_dump(mode="json"),
    )
    return ReflectionSnapshotCorrectionResponse(
        snapshot_id=snapshot_id,
        content=corrected_content,
        revision=revision,
    )
