"""Prompt contract for PhilosophyOS dialogue providers."""

from __future__ import annotations

from dataclasses import dataclass

from app.agent.policies import MODE_POLICIES
from app.schemas.dialogue import DialogueMode, DialogueRequest

SOURCE_POLICY = (
    "来源纪律：只在有可核验来源时提到原典、章节、页码、引文或学界共识；"
    "证据不足时明确说“目前证据不足”，不要编造引文、页码、章节或著作。"
)
OWNERSHIP_POLICY = (
    "观点归属：严格区分用户观点、作者观点、第三方观点和 AI 综合；"
    "不要把 AI 的解释写成用户已经相信的结论。"
)
SCOPE_POLICY = (
    "范围：当前阶段只讨论西方哲学；如果用户要求中国哲学，说明后续阶段再加入。"
)
OUTPUT_POLICY = (
    "输出：使用中文，语气克制、有学术感但不僵硬；每轮先回应用户当前文本，不做空泛长讲。"
)

MODE_INSTRUCTIONS: dict[DialogueMode, str] = {
    DialogueMode.SOCRATIC: (
        "苏格拉底式追问：一次只提出一个核心问题，优先检验前提、概念边界或最脆弱理由。"
    ),
    DialogueMode.EXPLAIN: (
        "直接解释：停止追问，给出清晰说明；先回答，再说明概念、语境和证据状态。"
    ),
    DialogueMode.COMPARE: (
        "比较：围绕共同问题、核心分歧、判断标准和适用边界比较，不把差异压平成口号。"
    ),
    DialogueMode.REFLECT: (
        "反思：回到用户自己的理由、经验和价值承诺，避免替用户做最终立场判决。"
    ),
    DialogueMode.ORGANIZE: (
        "整理：把已有内容组织为观点、理由、张力和开放项；不要提出新问题清单。"
    ),
}


@dataclass(frozen=True, slots=True)
class DialoguePrompt:
    """Structured prompt parts ready for a model provider."""

    instructions: str
    input: str

    def render(self) -> str:
        """Render a single prompt string for the current provider boundary."""

        return f"{self.instructions}\n\n---\n\n{self.input}"


def build_dialogue_prompt(request: DialogueRequest, mode: DialogueMode) -> DialoguePrompt:
    """Build one provider prompt from explicit request context and mode policy."""

    policy = MODE_POLICIES[mode]
    topic = request.topic or "未指定主题"
    instructions = "\n".join(
        (
            "你是 PhilosophyOS 的哲学学习导师和思考整理助手。",
            SCOPE_POLICY,
            SOURCE_POLICY,
            OWNERSHIP_POLICY,
            OUTPUT_POLICY,
            f"当前模式：{policy.label}。",
            f"模式目标：{policy.purpose}",
            MODE_INSTRUCTIONS[mode],
            f"问题预算：本轮最多输出 {policy.max_primary_questions} 个主要追问。",
        )
    )
    input_text = "\n".join(
        (
            f"主题：{topic}",
            f"轮次：第 {request.turn_number} 轮",
            f"当前模式：{request.current_mode.value}",
            f"请求模式：{request.requested_mode.value if request.requested_mode else '未显式请求'}",
            f"用户原文：{request.user_message}",
        )
    )
    return DialoguePrompt(instructions=instructions, input=input_text)
