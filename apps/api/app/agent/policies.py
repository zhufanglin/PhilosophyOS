"""Explicit mode-switching and per-mode dialogue constraints."""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.dialogue import DialogueMode, DialogueRequest


@dataclass(frozen=True, slots=True)
class ModePolicy:
    """Behavioral boundary enforced before a dialogue response is returned."""

    mode: DialogueMode
    label: str
    purpose: str
    max_primary_questions: int


@dataclass(frozen=True, slots=True)
class ModeDecision:
    """Resolved mode and an auditable explanation of any transition."""

    mode: DialogueMode
    switched: bool
    reason: str


MODE_POLICIES: dict[DialogueMode, ModePolicy] = {
    DialogueMode.SOCRATIC: ModePolicy(
        mode=DialogueMode.SOCRATIC,
        label="苏格拉底式追问",
        purpose="一次只检验一个关键前提、理由或概念边界。",
        max_primary_questions=1,
    ),
    DialogueMode.EXPLAIN: ModePolicy(
        mode=DialogueMode.EXPLAIN,
        label="直接解释",
        purpose="停止追问，给出清晰、受证据约束的说明。",
        max_primary_questions=0,
    ),
    DialogueMode.COMPARE: ModePolicy(
        mode=DialogueMode.COMPARE,
        label="比较",
        purpose="按共同问题、核心分歧和判断标准比较立场。",
        max_primary_questions=1,
    ),
    DialogueMode.REFLECT: ModePolicy(
        mode=DialogueMode.REFLECT,
        label="反思",
        purpose="把注意力转回用户的理由、经验和价值承诺。",
        max_primary_questions=1,
    ),
    DialogueMode.ORGANIZE: ModePolicy(
        mode=DialogueMode.ORGANIZE,
        label="整理",
        purpose="把已有内容组织为观点、理由、张力和开放项。",
        max_primary_questions=0,
    ),
}

_CONTROL_PHRASES: tuple[tuple[DialogueMode, tuple[str, ...]], ...] = (
    (
        DialogueMode.EXPLAIN,
        (
            "直接解释",
            "直接告诉我",
            "不要追问",
            "停止追问",
            "给我解释",
            "请解释",
            "explain mode",
        ),
    ),
    (
        DialogueMode.SOCRATIC,
        ("切换到苏格拉底", "苏格拉底模式", "继续追问", "socratic mode"),
    ),
    (
        DialogueMode.COMPARE,
        ("切换到比较", "比较模式", "请比较", "帮我比较", "compare mode"),
    ),
    (
        DialogueMode.REFLECT,
        ("切换到反思", "反思模式", "带我反思", "reflect mode"),
    ),
    (
        DialogueMode.ORGANIZE,
        ("切换到整理", "整理模式", "帮我整理", "帮我梳理", "organize mode"),
    ),
)


def resolve_mode(request: DialogueRequest) -> ModeDecision:
    """Apply explicit controls without inferring a mode from ordinary content."""

    if request.requested_mode is not None:
        return _decision(
            current=request.current_mode,
            target=request.requested_mode,
            reason="用户通过 requested_mode 显式指定对话模式。",
        )

    normalized_message = request.user_message.casefold()
    for mode, phrases in _CONTROL_PHRASES:
        if any(phrase in normalized_message for phrase in phrases):
            return _decision(
                current=request.current_mode,
                target=mode,
                reason=f"识别到明确的{MODE_POLICIES[mode].label}指令。",
            )

    return ModeDecision(
        mode=request.current_mode,
        switched=False,
        reason="未收到显式切换指令，保持当前模式。",
    )


def enforce_question_policy(mode: DialogueMode, primary_questions: tuple[str, ...]) -> None:
    """Reject a response plan that exceeds the active mode's question budget."""

    limit = MODE_POLICIES[mode].max_primary_questions
    if len(primary_questions) > limit:
        raise ValueError(f"{mode.value} mode allows at most {limit} primary question(s)")
    if any(not question.strip() for question in primary_questions):
        raise ValueError("primary questions must not be blank")


def _decision(*, current: DialogueMode, target: DialogueMode, reason: str) -> ModeDecision:
    """Build a transition decision while preserving same-mode commands."""

    return ModeDecision(mode=target, switched=target is not current, reason=reason)
