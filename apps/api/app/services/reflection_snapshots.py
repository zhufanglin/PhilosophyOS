"""Create durable AI reflection snapshots with safe pending fallback."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from pydantic import ValidationError

from app.agent.providers import ProviderRequest, select_dialogue_provider
from app.models.reflection import ReflectionSnapshotRecord
from app.schemas.dialogue import DialogueMode, ModelProfile
from app.schemas.reflection_snapshots import (
    ReflectionArchiveDeleteResponse,
    ReflectionArchiveImportResponse,
    ReflectionArchivePackage,
    FollowUpQuestionStatus,
    ReflectionArchiveRecord,
    ReflectionNextQuestionItem,
    ReflectionPhilosopherInfluence,
    ReflectionPhilosopherInfluenceEvidence,
    ReflectionPhilosopherInfluenceResponse,
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



def _reviewed_followup_item(request: ReflectionSnapshotRequest):
    """Return the user-confirmed follow-up item, if the review selected one."""

    for item in request.selected_items:
        kind = (item.kind or "").strip().casefold()
        label = item.label.strip().casefold()
        if kind in {"question", "open_question"} or "question" in label or "??" in label:
            return item
    return None


def apply_reviewed_followup_decision(
    content: ReflectionSnapshotContent,
    request: ReflectionSnapshotRequest,
) -> ReflectionSnapshotContent:
    """Make the saved follow-up reflect the user's review choice, not model invention."""

    followup = _reviewed_followup_item(request)
    if followup is None:
        return content.model_copy(
            update={
                "next_question": None,
                "next_question_reason": "\u7528\u6237\u672a\u786e\u8ba4 AI \u5efa\u8bae\u7684\u7ee7\u7eed\u8ffd\u95ee\uff0c\u56e0\u6b64\u4e0d\u8fdb\u5165\u4eca\u65e5\u9875\u63a8\u8350\u3002",
                "next_question_status": FollowUpQuestionStatus.REJECTED,
            }
        )

    reason = content.next_question_reason or "\u7528\u6237\u5728\u4fdd\u5b58\u524d\u786e\u8ba4\u6216\u4fee\u8ba2\u4e86\u8fd9\u6761\u8ffd\u95ee\uff0c\u53ef\u4f5c\u4e3a\u4e0b\u6b21\u601d\u8003\u5165\u53e3\u3002"
    return content.model_copy(
        update={
            "next_question": followup.text.strip(),
            "next_question_reason": reason,
            "next_question_status": FollowUpQuestionStatus.APPROVED,
        }
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
    source_path = Path(current_settings.thought_snapshots_path).expanduser()
    migration_marker = source_path.with_suffix(".jsonl-imported")
    if not migration_marker.exists():
        repository.import_jsonl(source_path)
        migration_marker.parent.mkdir(parents=True, exist_ok=True)
        migration_marker.touch(exist_ok=True)
    return repository


def export_reflection_archive(
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionArchivePackage:
    """Build a lossless, versioned archive package from local snapshots."""

    records = snapshot_repository(current_settings).list_all()
    return ReflectionArchivePackage(
        exported_at=datetime.now(UTC).isoformat(),
        records=[
            ReflectionArchiveRecord(
                created_at=record.created_at,
                request=dict(record.request_payload),
                response=ReflectionSnapshotResponse.model_validate(record.response_payload),
            )
            for record in records
        ],
    )


def render_reflection_archive_markdown(package: ReflectionArchivePackage) -> str:
    """Render a readable Markdown copy without losing the JSON backup contract."""

    lines = [
        "# PhilosophyOS 思想档案",
        "",
        f"> 导出时间：{package.exported_at} · 共 {len(package.records)} 条记录",
        "",
    ]
    for record in reversed(package.records):
        content = record.response.content
        title = content.title if content else str(record.request.get("question", "待补生成思想"))
        lines.extend([f"## {title}", "", f"- 时间：{record.created_at}"])
        if content:
            philosophers = "、".join(item.name for item in content.related_philosophers)
            lines.extend(
                [
                    f"- 主题：{content.topic}",
                    f"- 当前立场：{content.user_position}",
                    f"- 核心问题：{content.core_question}",
                    f"- 相关哲学家：{philosophers or '暂无'}",
                    "",
                ]
            )
        else:
            pending_reason = record.response.pending_reason or "原因未知"
            lines.extend([f"- 状态：待补生成（{pending_reason}）", ""])
    return "\n".join(lines)


def import_reflection_archive(
    package: ReflectionArchivePackage,
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionArchiveImportResponse:
    """Validate the complete package before atomically merging its records."""

    validated_records: list[ReflectionSnapshotRecord] = []
    seen_ids: set[str] = set()
    for item in package.records:
        snapshot_id = item.response.snapshot_id
        question = str(item.request.get("question", "")).strip()
        datetime.fromisoformat(item.created_at.replace("Z", "+00:00"))
        if not question:
            raise ValueError("Archive record question must not be blank")
        if snapshot_id in seen_ids:
            raise ValueError(f"Duplicate snapshot id in archive: {snapshot_id}")
        seen_ids.add(snapshot_id)
        validated_records.append(
            ReflectionSnapshotRecord(
                snapshot_id=snapshot_id,
                created_at=item.created_at,
                question=question,
                request_payload=item.request,
                response_payload=item.response.model_dump(mode="json"),
            )
        )
    imported = snapshot_repository(current_settings).restore(validated_records)
    return ReflectionArchiveImportResponse(imported=imported, total=len(package.records))


def delete_reflection_snapshot(
    snapshot_id: str, current_settings: PhilosophyOSSettings = settings
) -> ReflectionArchiveDeleteResponse | None:
    """Delete one local snapshot."""

    if not snapshot_repository(current_settings).delete(snapshot_id):
        return None
    return ReflectionArchiveDeleteResponse(deleted=1)


def delete_all_reflection_snapshots(
    current_settings: PhilosophyOSSettings = settings,
) -> ReflectionArchiveDeleteResponse:
    """Delete all local snapshots after route-level confirmation."""

    return ReflectionArchiveDeleteResponse(
        deleted=snapshot_repository(current_settings).delete_all()
    )


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


def list_philosopher_influences(
    current_settings: PhilosophyOSSettings = settings,
    *,
    limit: int = 8,
) -> ReflectionPhilosopherInfluenceResponse:
    """Aggregate completed snapshots into a philosopher influence view."""

    influence_map: dict[str, dict[str, object]] = {}
    records = snapshot_repository(current_settings).list_all()
    for record in records:
        try:
            response = ReflectionSnapshotResponse.model_validate(record.response_payload)
        except (TypeError, ValueError):
            continue
        content = response.content
        if response.status != SnapshotStatus.COMPLETED or content is None:
            continue

        seen_in_snapshot: set[str] = set()
        for philosopher in content.related_philosophers:
            name = philosopher.name.strip()
            reason = philosopher.reason.strip()
            if not name or not reason:
                continue
            entry = influence_map.setdefault(
                name,
                {
                    "count": 0,
                    "topics": set(),
                    "evidence": [],
                    "latest_created_at": record.created_at,
                },
            )
            if name not in seen_in_snapshot:
                entry["count"] = int(entry["count"]) + 1
                seen_in_snapshot.add(name)
            topics = entry["topics"]
            if isinstance(topics, set):
                topics.add(content.topic)
            evidence = entry["evidence"]
            if isinstance(evidence, list):
                evidence.append(
                    ReflectionPhilosopherInfluenceEvidence(
                        snapshot_id=response.snapshot_id,
                        created_at=record.created_at,
                        title=content.title,
                        topic=content.topic,
                        question=record.question,
                        reason=reason,
                    )
                )
            if str(entry["latest_created_at"]) < record.created_at:
                entry["latest_created_at"] = record.created_at

    influences = [
        ReflectionPhilosopherInfluence(
            name=name,
            count=int(entry["count"]),
            topics=sorted(
                [topic for topic in entry["topics"] if isinstance(topic, str)],
                key=lambda topic: topic.casefold(),
            )[:6],
            evidence=sorted(
                [
                    item
                    for item in entry["evidence"]
                    if isinstance(item, ReflectionPhilosopherInfluenceEvidence)
                ],
                key=lambda item: item.created_at,
                reverse=True,
            )[:3],
        )
        for name, entry in influence_map.items()
    ]
    influences.sort(key=lambda item: item.name.casefold())
    influences.sort(
        key=lambda item: max(
            (evidence.created_at for evidence in item.evidence),
            default="",
        ),
        reverse=True,
    )
    influences.sort(key=lambda item: item.count, reverse=True)
    return ReflectionPhilosopherInfluenceResponse(items=influences[:limit])


def list_tension_insights(
    current_settings: PhilosophyOSSettings = settings,
    *,
    limit: int = 8,
) -> list[dict[str, object]]:
    """Aggregate recurring unresolved tensions across completed snapshots."""

    tension_map: dict[str, dict[str, object]] = {}
    records = snapshot_repository(current_settings).list_all()
    for record in records:
        try:
            response = ReflectionSnapshotResponse.model_validate(record.response_payload)
        except (TypeError, ValueError):
            continue
        content = response.content
        if response.status != SnapshotStatus.COMPLETED or content is None:
            continue

        seen_in_snapshot: set[str] = set()
        for tension in content.tensions:
            label = tension.strip()
            if not label:
                continue
            entry = tension_map.setdefault(
                label,
                {
                    "label": label,
                    "count": 0,
                    "topics": set(),
                    "evidence": [],
                    "latest_created_at": record.created_at,
                },
            )
            if label not in seen_in_snapshot:
                entry["count"] = int(entry["count"]) + 1
                seen_in_snapshot.add(label)
            topics = entry["topics"]
            if isinstance(topics, set):
                topics.add(content.topic)
            evidence = entry["evidence"]
            if isinstance(evidence, list):
                evidence.append(
                    {
                        "snapshot_id": response.snapshot_id,
                        "created_at": record.created_at,
                        "title": content.title,
                        "topic": content.topic,
                        "question": record.question,
                        "next_question": content.next_question,
                    }
                )
            if str(entry["latest_created_at"]) < record.created_at:
                entry["latest_created_at"] = record.created_at

    insights = []
    for entry in tension_map.values():
        evidence_items = sorted(
            [
                item
                for item in entry["evidence"]
                if isinstance(item, dict) and isinstance(item.get("created_at"), str)
            ],
            key=lambda item: str(item["created_at"]),
            reverse=True,
        )
        insights.append(
            {
                "label": entry["label"],
                "count": entry["count"],
                "topics": sorted(
                    [topic for topic in entry["topics"] if isinstance(topic, str)],
                    key=lambda topic: topic.casefold(),
                )[:6],
                "latest_created_at": entry["latest_created_at"],
                "evidence": evidence_items[:3],
            }
        )

    insights.sort(key=lambda item: str(item["label"]).casefold())
    insights.sort(key=lambda item: str(item["latest_created_at"]), reverse=True)
    insights.sort(key=lambda item: int(item["count"]), reverse=True)
    return insights[:limit]


def get_next_reflection_question(
    current_settings: PhilosophyOSSettings = settings,
    *,
    snapshot_id: str | None = None,
) -> ReflectionNextQuestionItem | None:
    """Return one recoverable next question from completed reflection snapshots."""

    records = sorted(
        snapshot_repository(current_settings).list_all(),
        key=lambda record: record.created_at,
        reverse=True,
    )
    for record in records:
        try:
            response = ReflectionSnapshotResponse.model_validate(record.response_payload)
        except (TypeError, ValueError):
            continue
        if snapshot_id and response.snapshot_id != snapshot_id:
            continue
        content = response.content
        next_question = content.next_question.strip() if content and content.next_question else ""
        if (
            response.status != SnapshotStatus.COMPLETED
            or content is None
            or not next_question
            or content.next_question_status is FollowUpQuestionStatus.REJECTED
        ):
            continue
        return ReflectionNextQuestionItem(
            snapshot_id=response.snapshot_id,
            created_at=record.created_at,
            topic=content.topic,
            title=content.title,
            question=record.question,
            next_question=next_question,
            next_question_reason=content.next_question_reason,
            tension=content.tensions[0] if content.tensions else None,
            philosopher_names=[item.name for item in content.related_philosophers],
        )

    return None


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
        content = apply_reviewed_followup_decision(
            parse_snapshot_content(provider_response.assistant_message),
            request,
        )
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
        previous_next_question_reason=previous.next_question_reason,
        previous_next_question_status=previous.next_question_status,
    )
    corrected_content = previous.model_copy(
        update={
            "user_position": correction.user_position,
            "tensions": correction.tensions,
            "next_question": correction.next_question,
            "next_question_reason": correction.next_question_reason,
            "next_question_status": correction.next_question_status,
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
