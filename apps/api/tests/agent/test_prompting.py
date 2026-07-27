"""Tests for the PhilosophyOS dialogue prompt contract."""

from __future__ import annotations

import pytest

from app.agent.orchestrator import DialogueOrchestrator
from app.agent.policies import MODE_POLICIES
from app.agent.prompting import build_dialogue_prompt
from app.schemas.dialogue import DialogueMode, DialogueRequest


@pytest.mark.parametrize("mode", list(DialogueMode))
def test_prompt_contract_covers_all_modes(mode: DialogueMode) -> None:
    """Every public mode receives explicit mode and question-budget instructions."""

    request = DialogueRequest(
        user_message="我认为诚实仍然值得坚持。",
        current_mode=DialogueMode.SOCRATIC,
        requested_mode=mode,
        topic="诚实与德性",
        turn_number=2,
    )

    prompt = build_dialogue_prompt(request=request, mode=mode)

    assert MODE_POLICIES[mode].label in prompt.instructions
    assert MODE_POLICIES[mode].purpose in prompt.instructions
    assert f"最多输出 {MODE_POLICIES[mode].max_primary_questions} 个主要追问" in prompt.instructions
    assert "诚实与德性" in prompt.input
    assert "第 2 轮" in prompt.input
    assert request.user_message in prompt.input


def test_prompt_contains_source_and_ownership_constraints() -> None:
    """The provider prompt preserves source discipline and viewpoint ownership."""

    prompt = build_dialogue_prompt(
        request=DialogueRequest(
            user_message="康德是不是说过诚实永远不能例外？",
            current_mode=DialogueMode.EXPLAIN,
            topic="康德与诚实",
        ),
        mode=DialogueMode.EXPLAIN,
    )
    rendered = prompt.render()

    assert "不要编造引文、页码、章节或著作" in rendered
    assert "证据不足" in rendered
    assert "严格区分用户观点、作者观点、第三方观点和 AI 综合" in rendered
    assert "不要把 AI 的解释写成用户已经相信的结论" in rendered


def test_explain_and_organize_prompts_keep_zero_question_budget() -> None:
    """Non-questioning modes stay aligned with existing mode policy tests."""

    for mode in (DialogueMode.EXPLAIN, DialogueMode.ORGANIZE):
        prompt = build_dialogue_prompt(
            request=DialogueRequest(user_message="请处理这一轮内容。", current_mode=mode),
            mode=mode,
        )

        assert "最多输出 0 个主要追问" in prompt.instructions


def test_orchestrator_build_prompt_resolves_requested_mode() -> None:
    """The orchestrator exposes the same prompt contract for the future provider route."""

    prompt = DialogueOrchestrator().build_prompt(
        DialogueRequest(
            user_message="请解释这个问题，但界面选择整理。",
            current_mode=DialogueMode.SOCRATIC,
            requested_mode=DialogueMode.ORGANIZE,
        )
    )

    assert "当前模式：整理" in prompt.instructions
    assert "请求模式：organize" in prompt.input
