"""Build local weekly reflection report drafts from completed thought snapshots."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime, timedelta

from app.schemas.reflection_snapshots import (
    FollowUpQuestionStatus,
    ReflectionSnapshotResponse,
    ReflectionWeeklyReportDraft,
    ReflectionWeeklyReportSource,
    SnapshotStatus,
)
from app.services.reflection_snapshots import snapshot_repository
from app.settings import PhilosophyOSSettings, settings


def build_weekly_report_draft(
    current_settings: PhilosophyOSSettings = settings,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    now: datetime | None = None,
    min_nodes: int = 2,
) -> ReflectionWeeklyReportDraft:
    """Return a deterministic Markdown draft without writing it into the archive."""

    generated_at = now or datetime.now(UTC)
    week_start, week_end = _report_window(generated_at.date(), from_date, to_date)
    records = snapshot_repository(current_settings).list_all()
    report_nodes: list[tuple[str, str, ReflectionSnapshotResponse]] = []

    for record in records:
        try:
            response = ReflectionSnapshotResponse.model_validate(record.response_payload)
            created_on = _parse_record_date(record.created_at)
        except (TypeError, ValueError):
            continue
        if not created_on or created_on < week_start or created_on > week_end:
            continue
        if response.status != SnapshotStatus.COMPLETED or response.content is None:
            continue
        report_nodes.append((record.created_at, record.question, response))

    sources = [
        ReflectionWeeklyReportSource(
            snapshot_id=response.snapshot_id,
            created_at=created_at,
            title=response.content.title if response.content else question,
            topic=response.content.topic if response.content else "\u5f85\u786e\u8ba4\u4e3b\u9898",
            question=question,
        )
        for created_at, question, response in report_nodes
    ]

    if len(report_nodes) < min_nodes:
        message = "\u672c\u5468\u5df2\u5b8c\u6210\u601d\u60f3\u8282\u70b9\u4e0d\u8db3\uff0c\u6682\u4e0d\u751f\u6210\u603b\u7ed3\u6027\u5468\u62a5\u3002"
        return ReflectionWeeklyReportDraft(
            week_start=week_start.isoformat(),
            week_end=week_end.isoformat(),
            generated_at=generated_at.isoformat(),
            enough_data=False,
            node_count=len(report_nodes),
            sources=sources,
            message=message,
            markdown=_render_insufficient_markdown(week_start, week_end, report_nodes, min_nodes),
        )

    return ReflectionWeeklyReportDraft(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        generated_at=generated_at.isoformat(),
        enough_data=True,
        node_count=len(report_nodes),
        sources=sources,
        markdown=_render_report_markdown(week_start, week_end, report_nodes),
        message="\u5468\u62a5\u8349\u7a3f\u5df2\u751f\u6210\u3002\u5b83\u53ea\u7528\u4e8e\u9884\u89c8\u548c\u590d\u5236\uff0c\u4e0d\u4f1a\u81ea\u52a8\u8fdb\u5165\u957f\u671f\u6863\u6848\u3002",
    )


def _report_window(
    today: date,
    from_date: date | None,
    to_date: date | None,
) -> tuple[date, date]:
    if from_date or to_date:
        start = from_date or to_date or today
        end = to_date or from_date or today
        return start, end
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6)


def _parse_record_date(value: str) -> date | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None


def _render_insufficient_markdown(
    week_start: date,
    week_end: date,
    nodes: list[tuple[str, str, ReflectionSnapshotResponse]],
    min_nodes: int,
) -> str:
    lines = [
        "# PhilosophyOS \u672c\u5468\u601d\u60f3\u62a5\u544a\u8349\u7a3f",
        "",
        f"> \u65f6\u95f4\u8303\u56f4\uff1a{week_start.isoformat()} \u2014 {week_end.isoformat()}",
        "",
        "## \u6570\u636e\u72b6\u6001",
        "",
        f"\u672c\u5468\u53ea\u6709 {len(nodes)} \u4e2a\u5df2\u5b8c\u6210\u601d\u60f3\u8282\u70b9\uff0c\u5c11\u4e8e\u751f\u6210\u5468\u62a5\u6240\u9700\u7684 {min_nodes} \u4e2a\u8282\u70b9\u3002",
        "\u4e3a\u4e86\u907f\u514d\u4f2a\u9020\u4e3b\u9898\u3001\u5f20\u529b\u6216\u89c2\u70b9\u53d8\u5316\uff0c\u672c\u5468\u6682\u4e0d\u751f\u6210\u603b\u7ed3\u6027\u62a5\u544a\u3002",
        "",
        "## \u6765\u6e90\u8282\u70b9",
        "",
    ]
    if nodes:
        for created_at, question, response in nodes:
            content = response.content
            title = content.title if content else question
            topic = content.topic if content else "\u5f85\u786e\u8ba4\u4e3b\u9898"
            lines.append(f"- {created_at[:10]} \u00b7 \u300a{title}\u300b \u00b7 {topic} \u00b7 `{response.snapshot_id}`")
    else:
        lines.append("- \u6682\u65e0\u53ef\u7528\u4e8e\u5468\u62a5\u7684\u5df2\u5b8c\u6210\u601d\u60f3\u8282\u70b9\u3002")
    return "\n".join(lines)


def _render_report_markdown(
    week_start: date,
    week_end: date,
    nodes: list[tuple[str, str, ReflectionSnapshotResponse]],
) -> str:
    topics = Counter[str]()
    tensions = Counter[str]()
    philosophers = Counter[str]()
    insights: list[str] = []
    changes: list[str] = []
    next_questions: list[str] = []

    for _, _, response in nodes:
        content = response.content
        if content is None:
            continue
        topics.update([content.topic])
        tensions.update(item for item in content.tensions if item.strip())
        philosophers.update(item.name for item in content.related_philosophers if item.name.strip())
        insights.extend(item for item in content.key_insights if item.strip())
        if content.change_signal.changed:
            previous = content.change_signal.previous_position or "\u6b64\u524d\u7acb\u573a\u672a\u660e\u786e"
            current = content.change_signal.current_position or content.user_position
            changes.append(f"\u4ece\u201c{previous}\u201d\u79fb\u52a8\u5230\u201c{current}\u201d\u3002")
        if content.next_question and content.next_question_status is not FollowUpQuestionStatus.REJECTED:
            next_questions.append(content.next_question)

    dominant_topics = _counter_labels(topics, fallback="\u672c\u5468\u4e3b\u9898\u4ecd\u5728\u5f62\u6210")
    dominant_tensions = _counter_labels(tensions, fallback="\u672c\u5468\u672a\u5f62\u6210\u7a33\u5b9a\u5f20\u529b")
    dominant_philosophers = _counter_labels(philosophers, fallback="\u672c\u5468\u6682\u672a\u5f62\u6210\u660e\u786e\u54f2\u5b66\u5bb6\u5f71\u54cd\u7ebf\u7d22")

    lines = [
        "# PhilosophyOS \u672c\u5468\u601d\u60f3\u62a5\u544a\u8349\u7a3f",
        "",
        f"> \u65f6\u95f4\u8303\u56f4\uff1a{week_start.isoformat()} \u2014 {week_end.isoformat()} \u00b7 \u57fa\u4e8e {len(nodes)} \u4e2a\u5df2\u5b8c\u6210\u601d\u60f3\u8282\u70b9\u751f\u6210",
        "> \u8fd9\u662f\u4e00\u4efd\u53ef\u6821\u5bf9\u8349\u7a3f\uff0c\u4e0d\u4f1a\u81ea\u52a8\u8fdb\u5165\u957f\u671f\u6863\u6848\u3002",
        "",
        "## \u672c\u5468\u4e3b\u9898",
        "",
        *[f"- {label}" for label in dominant_topics],
        "",
        "## \u53cd\u590d\u5f20\u529b",
        "",
        *[f"- {label}" for label in dominant_tensions],
        "",
        "## \u76f8\u5173\u54f2\u5b66\u5bb6",
        "",
        *[f"- {label}" for label in dominant_philosophers],
        "",
        "## \u89c2\u70b9\u53d8\u5316",
        "",
    ]
    if changes:
        lines.extend(f"- {item}" for item in changes[:4])
    else:
        lines.append("- \u672c\u5468\u6ca1\u6709\u8db3\u591f\u8bc1\u636e\u8868\u660e\u7acb\u573a\u53d1\u751f\u660e\u663e\u8f6c\u5411\uff0c\u66f4\u9002\u5408\u8bb0\u5f55\u4e3a\u6301\u7eed\u6f84\u6e05\u3002")

    lines.extend(["", "## \u672c\u5468\u6d1e\u89c1", ""])
    if insights:
        lines.extend(f"- {item}" for item in _unique(insights)[:5])
    else:
        lines.append("- \u672c\u5468\u6d1e\u89c1\u4ecd\u9700\u66f4\u591a\u5df2\u5b8c\u6210\u8282\u70b9\u652f\u6491\u3002")

    lines.extend(["", "## \u4e0b\u5468\u5efa\u8bae", ""])
    if next_questions:
        lines.extend(f"- \u7ee7\u7eed\u8ffd\u95ee\uff1a{item}" for item in _unique(next_questions)[:3])
    else:
        lines.append("- \u4e0b\u5468\u5148\u5b8c\u6210\u81f3\u5c11\u4e00\u6b21\u5e26\u6709\u660e\u786e\u8ffd\u95ee\u7684\u5bf9\u8bdd\uff0c\u8ba9\u62a5\u544a\u80fd\u5f62\u6210\u5ef6\u7eed\u7ebf\u7d22\u3002")

    lines.extend(["", "## \u6765\u6e90\u8282\u70b9", ""])
    for created_at, question, response in nodes:
        content = response.content
        if content is None:
            continue
        lines.append(
            f"- {created_at[:10]} \u00b7 \u300a{content.title}\u300b \u00b7 {content.topic} \u00b7 `{response.snapshot_id}` \u00b7 \u539f\u95ee\u9898\uff1a{question}"
        )

    return "\n".join(lines)


def _counter_labels(counter: Counter[str], *, fallback: str) -> list[str]:
    labels = [
        f"{label}\uff08{count} \u6b21\uff09"
        for label, count in sorted(counter.items(), key=lambda item: (-item[1], item[0].casefold()))[:5]
    ]
    return labels or [fallback]


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result
