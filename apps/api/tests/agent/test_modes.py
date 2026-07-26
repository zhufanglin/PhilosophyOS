"""Acceptance tests for explicit dialogue modes and question budgets."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.agent.orchestrator import DialogueOrchestrator
from app.agent.policies import MODE_POLICIES, enforce_question_policy, resolve_mode
from app.schemas.dialogue import DialogueMode, DialogueRequest


@pytest.fixture
def orchestrator() -> DialogueOrchestrator:
    """Return the deterministic production orchestrator."""

    return DialogueOrchestrator()


def question_mark_count(value: str) -> int:
    """Count Chinese and ASCII question marks in a response."""

    return value.count("？") + value.count("?")


@pytest.mark.parametrize("mode", list(DialogueMode))
def test_all_five_modes_are_explicitly_selectable(
    orchestrator: DialogueOrchestrator, mode: DialogueMode
) -> None:
    """Every public mode can be selected without intent guessing."""

    response = orchestrator.respond(
        DialogueRequest(
            user_message="处理这一轮内容",
            current_mode=DialogueMode.SOCRATIC,
            requested_mode=mode,
            topic="自由",
        )
    )

    assert response.mode is mode
    assert response.switched is (mode is not DialogueMode.SOCRATIC)
    assert MODE_POLICIES[mode].purpose


def test_direct_explanation_command_stops_socratic_questioning(
    orchestrator: DialogueOrchestrator,
) -> None:
    """A direct explanation request has priority over the current Socratic mode."""

    response = orchestrator.respond(
        DialogueRequest(
            user_message="不要追问，请直接解释康德如何理解自由。",
            current_mode=DialogueMode.SOCRATIC,
        )
    )

    assert response.mode is DialogueMode.EXPLAIN
    assert response.switched
    assert response.primary_question is None
    assert not response.should_ask_followup
    assert question_mark_count(response.assistant_message) == 0
    assert response.evidence_status == "supported"
    assert response.citation_ids


@pytest.mark.parametrize("turn_number", [1, 2, 3, 4, 8])
def test_socratic_mode_has_exactly_one_primary_question_per_turn(
    orchestrator: DialogueOrchestrator, turn_number: int
) -> None:
    """Multiple user questions never cause stacked assistant questions."""

    response = orchestrator.respond(
        DialogueRequest(
            user_message="自由是什么？责任又是什么？它们是否冲突？",
            current_mode=DialogueMode.SOCRATIC,
            turn_number=turn_number,
        )
    )

    assert response.mode is DialogueMode.SOCRATIC
    assert response.primary_question is not None
    assert response.assistant_message.endswith(response.primary_question)
    assert question_mark_count(response.assistant_message) == 1


def test_ordinary_content_does_not_silently_switch_modes() -> None:
    """Mentioning comparison as a topic is not itself a control command."""

    decision = resolve_mode(
        DialogueRequest(
            user_message="我认为这种比较忽略了历史背景。",
            current_mode=DialogueMode.REFLECT,
        )
    )

    assert decision.mode is DialogueMode.REFLECT
    assert not decision.switched
    assert "保持当前模式" in decision.reason


@pytest.mark.parametrize(
    ("message", "expected_mode"),
    [
        ("继续追问我的前提", DialogueMode.SOCRATIC),
        ("请比较康德与斯宾诺莎", DialogueMode.COMPARE),
        ("带我反思这个判断", DialogueMode.REFLECT),
        ("帮我整理刚才的内容", DialogueMode.ORGANIZE),
    ],
)
def test_clear_control_phrases_switch_modes(message: str, expected_mode: DialogueMode) -> None:
    """Only clear user controls trigger phrase-based transitions."""

    decision = resolve_mode(
        DialogueRequest(user_message=message, current_mode=DialogueMode.EXPLAIN)
    )

    assert decision.mode is expected_mode
    assert decision.switched is (expected_mode is not DialogueMode.EXPLAIN)


def test_explicit_requested_mode_takes_priority_over_message_phrase() -> None:
    """Structured UI controls are authoritative when both controls are present."""

    decision = resolve_mode(
        DialogueRequest(
            user_message="请解释，但我在界面上选择了整理模式。",
            current_mode=DialogueMode.SOCRATIC,
            requested_mode=DialogueMode.ORGANIZE,
        )
    )

    assert decision.mode is DialogueMode.ORGANIZE
    assert "requested_mode" in decision.reason


def test_explain_and_organize_modes_forbid_primary_questions() -> None:
    """Non-questioning modes reject invalid response plans at the policy boundary."""

    with pytest.raises(ValueError, match="allows at most 0"):
        enforce_question_policy(DialogueMode.EXPLAIN, ("为什么？",))
    with pytest.raises(ValueError, match="allows at most 0"):
        enforce_question_policy(DialogueMode.ORGANIZE, ("下一步是什么？",))


def test_blank_user_turn_is_rejected_before_orchestration() -> None:
    """The public schema rejects an empty turn."""

    with pytest.raises(ValidationError):
        DialogueRequest(user_message="   ")
