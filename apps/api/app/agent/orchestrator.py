"""Single orchestrator for the five controlled philosophical dialogue modes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from app.agent.policies import enforce_question_policy, resolve_mode
from app.agent.prompting import DialoguePrompt, build_dialogue_prompt
from app.agent.providers import (
    DeterministicDialogueProvider,
    DialogueProvider,
    ProviderRequest,
    select_dialogue_provider,
)
from app.schemas.dialogue import DialogueMode, DialogueRequest, DialogueResponse, ModelProfile
from app.services.answer import AnswerResult, knowledge_answer_service
from app.settings import settings


class ExplanationProvider(Protocol):
    """Small boundary for evidence-constrained explanation providers."""

    def answer(self, question: str) -> AnswerResult:
        """Return an evidence-aware explanation for a user message."""


@dataclass(frozen=True, slots=True)
class ResponsePlan:
    """Internal response before policy validation and schema serialization."""

    message: str
    primary_questions: tuple[str, ...] = ()
    evidence_status: Literal["supported", "corrected", "insufficient", "exploratory"] | None = None
    citation_ids: tuple[str, ...] = ()


class DialogueOrchestrator:
    """Resolve a mode, call the appropriate capability, and enforce its policy."""

    def __init__(
        self,
        explanation_provider: ExplanationProvider | None = None,
        dialogue_provider: DialogueProvider | None = None,
    ) -> None:
        self._explanation_provider = explanation_provider or knowledge_answer_service
        self._dialogue_provider = dialogue_provider
        self._deterministic_provider = DeterministicDialogueProvider()

    def respond(self, request: DialogueRequest) -> DialogueResponse:
        """Return one policy-compliant dialogue turn through the configured provider."""

        decision = resolve_mode(request)
        plan = self._build_plan(decision.mode, request)
        enforce_question_policy(decision.mode, plan.primary_questions)
        primary_question = plan.primary_questions[0] if plan.primary_questions else None
        provider_request = ProviderRequest(
            user_message=request.user_message,
            mode=decision.mode,
            topic=request.topic,
            turn_number=request.turn_number,
            prompt=build_dialogue_prompt(request=request, mode=decision.mode).render(),
            deterministic_message=plan.message,
        )
        model_profile = request.model_profile or ModelProfile(settings.model_profile)
        dialogue_provider = self._dialogue_provider or select_dialogue_provider(
            settings.model_copy(update={"model_profile": model_profile.value})
        )
        fallback_reason: str | None = None
        try:
            provider_response = dialogue_provider.generate(provider_request)
        except Exception as error:
            fallback_reason = f"{type(error).__name__}: {error}"
            provider_response = self._deterministic_provider.generate(provider_request)

        return DialogueResponse(
            mode=decision.mode,
            previous_mode=request.current_mode,
            switched=decision.switched,
            switch_reason=decision.reason,
            assistant_message=provider_response.assistant_message,
            primary_question=primary_question,
            should_ask_followup=primary_question is not None,
            evidence_status=plan.evidence_status,
            citation_ids=plan.citation_ids,
            provider=provider_response.provider,
            provider_model=provider_response.model,
            model_profile=model_profile,
            provider_fallback_reason=fallback_reason,
        )

    def build_prompt(self, request: DialogueRequest) -> DialoguePrompt:
        """Build the provider prompt for the resolved dialogue mode."""

        decision = resolve_mode(request)
        return build_dialogue_prompt(request=request, mode=decision.mode)

    def _build_plan(self, mode: DialogueMode, request: DialogueRequest) -> ResponsePlan:
        """Dispatch one turn to the selected mode implementation."""

        builders = {
            DialogueMode.SOCRATIC: self._socratic_plan,
            DialogueMode.EXPLAIN: self._explain_plan,
            DialogueMode.COMPARE: self._compare_plan,
            DialogueMode.REFLECT: self._reflect_plan,
            DialogueMode.ORGANIZE: self._organize_plan,
        }
        return builders[mode](request)

    def _socratic_plan(self, request: DialogueRequest) -> ResponsePlan:
        """Probe exactly one central claim instead of stacking questions."""

        questions = (
            "你当前判断成立，最关键且最可能被反驳的理由是什么？",
            "如果有人拒绝你的核心前提，你会先为哪一点辩护？",
            "什么具体反例最可能迫使你修改目前的判断？",
        )
        question = questions[(request.turn_number - 1) % len(questions)]
        return ResponsePlan(
            message=f"我们先不急着扩展话题，只检验一个关键环节。{question}",
            primary_questions=(question,),
        )

    def _explain_plan(self, request: DialogueRequest) -> ResponsePlan:
        """Stop asking questions and use the reviewed knowledge-answer boundary."""

        result = self._explanation_provider.answer(request.user_message)
        prefix = f"先纠正前提：{result.correction}" if result.correction else ""
        message = f"{prefix}{result.answer}"
        return ResponsePlan(
            message=message,
            evidence_status=result.status.value,
            citation_ids=tuple(citation.citation_id for citation in result.citations),
        )

    def _compare_plan(self, request: DialogueRequest) -> ResponsePlan:
        """Offer a stable comparison frame and one decision-driving question."""

        question = "这两个立场在什么判断标准上发生了真正分歧？"
        return ResponsePlan(
            message=(
                "比较时先对齐它们回答的共同问题，再分别列出核心主张、理由、代价与适用边界。"
                f"{question}"
            ),
            primary_questions=(question,),
        )

    def _reflect_plan(self, request: DialogueRequest) -> ResponsePlan:
        """Bring the turn back to the user's own reasons and commitments."""

        question = "如果暂时放下结论，哪条经验或价值最推动你形成现在的判断？"
        return ResponsePlan(
            message=f"这一轮先区分你的结论、理由与情感反应。{question}",
            primary_questions=(question,),
        )

    def _organize_plan(self, request: DialogueRequest) -> ResponsePlan:
        """Produce a question-free structure that can be refined later."""

        topic = request.topic or "当前讨论"
        return ResponsePlan(
            message=(
                f"已按“{topic}”整理为四个部分：一、暂定观点；二、主要理由；"
                "三、尚未解决的张力；四、需要核对的概念与来源。"
            )
        )


dialogue_orchestrator = DialogueOrchestrator()
