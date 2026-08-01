"""Evidence-constrained knowledge answers for the first three philosophers."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID, uuid5

from app.agent.providers import ProviderRequest, select_dialogue_provider
from app.models.knowledge import (
    CopyrightStatus,
    EvidenceKind,
    ReviewStatus,
    SourceLevel,
    Tradition,
)
from app.rag.retrievers import (
    RetrievalDocument,
    RetrievalFilters,
    RetrievalQuery,
    StructuredFilterRetriever,
)
from app.schemas.dialogue import DialogueMode, ModelProfile
from app.settings import PhilosophyOSSettings, settings

KNOWLEDGE_NAMESPACE = UUID("2ce9d7bd-d8d8-5d06-b22d-1c6bca7e173e")


class AnswerStatus(StrEnum):
    """Evidence state of a knowledge answer."""

    SUPPORTED = "supported"
    CORRECTED = "corrected"
    INSUFFICIENT = "insufficient"
    EXPLORATORY = "exploratory"


class EvidenceCategory(StrEnum):
    """User-facing distinction between source and model contribution."""

    PRIMARY = "primary"
    RESEARCH = "research"
    AI_INFERENCE = "ai_inference"


@dataclass(frozen=True, slots=True)
class CitationRecord:
    """Expandable citation metadata backed by one reviewed retrieval document."""

    citation_id: str
    category: EvidenceCategory
    title: str
    author: str
    source_level: SourceLevel
    source_version: str
    location: str | None
    context: str
    canonical_url: str | None
    direct_quote: str | None = None


@dataclass(frozen=True, slots=True)
class EvidenceClaim:
    """One answer claim and the citations that support it."""

    text: str
    category: EvidenceCategory
    citation_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class AnswerResult:
    """Service result returned by the HTTP layer."""

    question: str
    status: AnswerStatus
    answer: str
    evidence_note: str
    claims: tuple[EvidenceClaim, ...]
    citations: tuple[CitationRecord, ...]
    correction: str | None = None


@dataclass(frozen=True, slots=True)
class KnowledgePassage:
    """A retrieval document plus its stable public citation metadata."""

    citation: CitationRecord
    document: RetrievalDocument


@dataclass(frozen=True, slots=True)
class PhilosopherProfile:
    """Reviewed answer outline for one philosopher in the initial corpus."""

    slug: str
    entity_id: UUID
    aliases: tuple[str, ...]
    answer: str
    claims: tuple[EvidenceClaim, ...]


class KnowledgeAnswerService:
    """Return deterministic answers that never invent quotations or sources."""

    def __init__(self) -> None:
        passages = _build_passages()
        self._passages = {passage.citation.citation_id: passage for passage in passages}
        self._passages_by_chunk = {passage.document.chunk_id: passage for passage in passages}
        self._retriever = StructuredFilterRetriever([passage.document for passage in passages])
        self._profiles = _build_profiles()

    def answer(
        self,
        question: str,
        current_settings: PhilosophyOSSettings = settings,
        model_profile: ModelProfile | None = None,
    ) -> AnswerResult:
        """Answer a question or explicitly degrade when reviewed evidence is absent."""

        normalized = question.casefold().strip()
        profile = self._detect_profile(normalized)
        concept_profiles = self._detect_concept_profiles(normalized)
        asks_for_direct_quote = any(
            marker in normalized for marker in ("原话", "原文", "页码", "直接引语", "quote")
        )

        if profile is not None and profile.slug == "nietzsche" and "存在与时间" in normalized:
            return self._wrong_work_attribution(question, profile)
        if profile is None and concept_profiles:
            return self._concept_answer(question, normalized, concept_profiles)
        if profile is None:
            return self._exploratory_answer(question, current_settings, model_profile)

        citations = self._retrieve_citations(profile, normalized)
        if asks_for_direct_quote:
            return AnswerResult(
                question=question,
                status=AnswerStatus.INSUFFICIENT,
                answer=(
                    f"当前关于{_display_name(profile.slug)}的材料可以支持谨慎转述，"
                    "但没有同时满足具体版本、展示许可和逐字核对条件的直接引语。"
                ),
                evidence_note="已返回可核对的来源元数据，但不会用模型记忆补写原话或页码。",
                claims=(),
                citations=citations,
            )

        citation_ids = {citation.citation_id for citation in citations}
        claims = tuple(
            claim for claim in profile.claims if set(claim.citation_ids).issubset(citation_ids)
        )
        return AnswerResult(
            question=question,
            status=AnswerStatus.SUPPORTED,
            answer=profile.answer,
            evidence_note=(
                "回答只使用已审核片段进行转述；来源可展开查看。"
                "当前没有满足直接引语策略门的内容，因此不显示引号内原文。"
            ),
            claims=claims,
            citations=citations,
        )

    def get_citation(self, citation_id: str) -> CitationRecord | None:
        """Return full context for one public citation id."""

        passage = self._passages.get(citation_id)
        return passage.citation if passage is not None else None

    def _detect_profile(self, normalized_question: str) -> PhilosopherProfile | None:
        """Resolve the first reviewed philosopher explicitly named in the question."""

        for profile in self._profiles:
            if any(alias in normalized_question for alias in profile.aliases):
                return profile
        return None

    def _detect_concept_profiles(
        self, normalized_question: str
    ) -> tuple[PhilosopherProfile, ...]:
        """Resolve reviewed philosophers relevant to a concept-level question."""

        concept_markers = (
            "决定论",
            "自由意志",
            "行动自由",
            "道德责任",
            "因果",
            "必然性",
            "determinism",
            "free will",
            "freedom",
            "causality",
        )
        if not any(marker in normalized_question for marker in concept_markers):
            return ()
        return tuple(
            profile
            for profile in self._profiles
            if profile.slug in {"kant", "spinoza", "nietzsche"}
        )

    def _concept_answer(
        self,
        question: str,
        normalized_question: str,
        profiles: tuple[PhilosopherProfile, ...],
    ) -> AnswerResult:
        """Synthesize a concept answer from multiple reviewed profile passages."""

        citations_by_id: dict[str, CitationRecord] = {}
        for profile in profiles:
            for citation in self._retrieve_citations(profile, normalized_question):
                citations_by_id[citation.citation_id] = citation

        citations = tuple(citations_by_id.values())
        if not citations:
            return AnswerResult(
                question=question,
                status=AnswerStatus.INSUFFICIENT,
                answer="当前知识库没有检索到能支撑这个概念问题的已审核片段。",
                evidence_note="RAG 未命中已审核材料，因此没有生成引用或模型补写。",
                claims=(),
                citations=(),
            )

        claims = (
            EvidenceClaim(
                text="决定论问题通常关注行动是否被因果、必然性或先在条件决定。",
                category=EvidenceCategory.AI_INFERENCE,
                citation_ids=tuple(citation.citation_id for citation in citations),
            ),
            EvidenceClaim(
                text="康德、斯宾诺莎和尼采都把自由问题放在因果性、能动性与责任的张力中讨论，但结论并不相同。",
                category=EvidenceCategory.RESEARCH,
                citation_ids=tuple(citation.citation_id for citation in citations),
            ),
        )
        return AnswerResult(
            question=question,
            status=AnswerStatus.SUPPORTED,
            answer=(
                "如果把“决定论”理解为：人的行动是否已经被因果链条、必然性或先在条件决定，"
                "那么它和自由意志问题是一组核心张力。康德会把自然因果解释和实践自由区分开："
                "经验世界可以按因果解释，但道德责任仍要求我们把理性主体视为能够自律行动。"
                "斯宾诺莎更强调必然性：自由不是无原因任选，而是行动越来自充分认识和自身能力，"
                "就越不被外因和被动情感支配。尼采则批判传统形而上学意义上的自由意志，"
                "但这不等于简单的被动决定论；他更关心力量、能动性和自我塑造如何发生。"
            ),
            evidence_note=(
                "这是多片段 RAG 归纳：回答只使用康德、斯宾诺莎、尼采的已审核材料转述，"
                "没有生成逐字引语。"
            ),
            claims=claims,
            citations=citations,
        )

    def _exploratory_answer(
        self,
        question: str,
        current_settings: PhilosophyOSSettings,
        model_profile: ModelProfile | None,
    ) -> AnswerResult:
        """Use the user's configured model profile only when RAG evidence is absent."""

        selected_profile = model_profile or ModelProfile(current_settings.model_profile)
        selected_settings = current_settings.model_copy(
            update={"model_profile": selected_profile.value}
        )
        deterministic_message = (
            "当前审核知识库暂时没有足够来源支撑这个问题。你可以把它先作为探索入口："
            "1）拆成一个更小的哲学概念；2）指定一位哲学家或一本著作；"
            "3）再回到知识库中寻找可核对来源。"
        )
        prompt = (
            "你是 PhilosophyOS 的探索助手。用户的问题暂时没有命中本地 RAG 的已审核资料。"
            "请用中文给出谨慎、简短、有启发的探索性回答，不要编造出处、页码或原文引语；"
            "如果提到可能方向，要明确这是待验证线索。\n\n"
            f"用户问题：{question}"
        )
        try:
            provider_response = select_dialogue_provider(selected_settings).generate(
                ProviderRequest(
                    user_message=question,
                    mode=DialogueMode.EXPLAIN,
                    topic="知识探索",
                    turn_number=1,
                    prompt=prompt,
                    deterministic_message=deterministic_message,
                )
            )
            answer = provider_response.assistant_message
        except Exception:
            answer = deterministic_message

        return AnswerResult(
            question=question,
            status=AnswerStatus.EXPLORATORY,
            answer=answer,
            evidence_note=(
                "RAG 未检索到足够的已审核来源；本回答由用户当前配置的模型 API 或本地兜底生成，"
                "仅作为探索性引导，不视为来源已验证结论。"
            ),
            claims=(),
            citations=(),
        )

    def _retrieve_citations(
        self, profile: PhilosopherProfile, normalized_question: str
    ) -> tuple[CitationRecord, ...]:
        """Retrieve reviewed sources using entity and publication filters."""

        query = RetrievalQuery(
            text=normalized_question,
            embedding=_profile_embedding(profile.slug),
            filters=RetrievalFilters(
                tradition=Tradition.WESTERN,
                entity_ids=frozenset({profile.entity_id}),
                source_levels=frozenset({SourceLevel.S1, SourceLevel.S2}),
                require_published=True,
            ),
        )
        hits = self._retriever.search(query, limit=3)
        return tuple(self._passages_by_chunk[hit.document.chunk_id].citation for hit in hits)

    def _wrong_work_attribution(self, question: str, profile: PhilosopherProfile) -> AnswerResult:
        """Correct the false premise that Nietzsche authored Being and Time."""

        citations = self._retrieve_citations(profile, "尼采 著作 自由")
        heidegger = self._passages["heidegger-being-and-time"].citation
        return AnswerResult(
            question=question,
            status=AnswerStatus.CORRECTED,
            correction="《存在与时间》的作者是马丁·海德格尔，不是尼采。",
            answer=(
                "因此不能在《存在与时间》中寻找“尼采关于自由的原话”。"
                "尼采确实批判传统自由意志和自因观念，但应回到尼采自己的著作及研究材料中核对。"
            ),
            evidence_note="先纠正著作归属，再提供尼采相关材料；未生成任何直接引语。",
            claims=(
                EvidenceClaim(
                    text="《存在与时间》由马丁·海德格尔出版于 1927 年。",
                    category=EvidenceCategory.PRIMARY,
                    citation_ids=(heidegger.citation_id,),
                ),
                EvidenceClaim(
                    text="尼采对自由意志的讨论不能被归入《存在与时间》。",
                    category=EvidenceCategory.RESEARCH,
                    citation_ids=tuple(citation.citation_id for citation in citations),
                ),
            ),
            citations=(heidegger, *citations),
        )


def _stable_id(value: str) -> UUID:
    """Return a deterministic id for fixtures and public citation records."""

    return uuid5(KNOWLEDGE_NAMESPACE, value)


def _passage(
    *,
    citation_id: str,
    philosopher_slug: str,
    category: EvidenceCategory,
    title: str,
    author: str,
    source_level: SourceLevel,
    source_version: str,
    location: str | None,
    context: str,
    canonical_url: str | None,
) -> KnowledgePassage:
    """Build a non-quotable reviewed passage for the initial local corpus."""

    citation = CitationRecord(
        citation_id=citation_id,
        category=category,
        title=title,
        author=author,
        source_level=source_level,
        source_version=source_version,
        location=location,
        context=context,
        canonical_url=canonical_url,
        direct_quote=None,
    )
    document = RetrievalDocument(
        chunk_id=_stable_id(f"chunk:{citation_id}"),
        source_id=_stable_id(f"source:{citation_id}"),
        title=title,
        author=author,
        content=context,
        embedding=_profile_embedding(philosopher_slug),
        tradition=Tradition.WESTERN,
        entity_ids=frozenset({_stable_id(f"entity:{philosopher_slug}")}),
        source_level=source_level,
        copyright_status=CopyrightStatus.RESTRICTED,
        quote_allowed=False,
        review_status=ReviewStatus.PUBLISHED,
        evidence_kind=EvidenceKind.PARAPHRASE,
        source_version=source_version,
        location=location,
    )
    return KnowledgePassage(citation=citation, document=document)


def _build_passages() -> tuple[KnowledgePassage, ...]:
    """Create the reviewed, metadata-only corpus used by the local MVP."""

    return (
        _passage(
            citation_id="kant-critique-freedom",
            philosopher_slug="kant",
            category=EvidenceCategory.PRIMARY,
            title="Kritik der reinen Vernunft",
            author="Immanuel Kant",
            source_level=SourceLevel.S1,
            source_version="1781/1787 A/B edition metadata",
            location="Third Antinomy; Canon of Pure Reason",
            context=(
                "书目与章节级审核摘要：康德在第三二律背反中区分自然因果解释与自由因果问题；"
                "理论理性不能把自由当作经验对象加以证明。"
            ),
            canonical_url=None,
        ),
        _passage(
            citation_id="kant-sep-moral-philosophy",
            philosopher_slug="kant",
            category=EvidenceCategory.RESEARCH,
            title="Kant's Moral Philosophy",
            author="Stanford Encyclopedia of Philosophy",
            source_level=SourceLevel.S2,
            source_version="访问快照 2026-07-26",
            location="Freedom and autonomy overview",
            context=(
                "研究解释摘要：康德的实践哲学把自由与自律、道德责任联系起来；"
                "这不等于随欲望行动，而是理性主体依据可普遍化原则行动。"
            ),
            canonical_url="https://plato.stanford.edu/entries/kant-moral/",
        ),
        _passage(
            citation_id="spinoza-ethics-freedom",
            philosopher_slug="spinoza",
            category=EvidenceCategory.PRIMARY,
            title="Ethica",
            author="Baruch Spinoza",
            source_level=SourceLevel.S1,
            source_version="1677 Latin edition metadata",
            location="Part I definitions; Part IV preface",
            context=(
                "书目与章节级审核摘要：斯宾诺莎反对把自由理解为无原因的任意选择；"
                "自由更接近从自身本性出发行动，并通过充分认识减少被动情感支配。"
            ),
            canonical_url=None,
        ),
        _passage(
            citation_id="spinoza-sep-psychological-theory",
            philosopher_slug="spinoza",
            category=EvidenceCategory.RESEARCH,
            title="Spinoza's Psychological Theory",
            author="Stanford Encyclopedia of Philosophy",
            source_level=SourceLevel.S2,
            source_version="访问快照 2026-07-26",
            location="Action, passion, and freedom overview",
            context=(
                "研究解释摘要：认识必然性并非消极服从；关键在于行动是否由较充分的观念和"
                "自身能力产生，而不是主要受外因与被动情感驱动。"
            ),
            canonical_url="https://plato.stanford.edu/entries/spinoza-psychological/",
        ),
        _passage(
            citation_id="nietzsche-bge-free-will",
            philosopher_slug="nietzsche",
            category=EvidenceCategory.PRIMARY,
            title="Jenseits von Gut und Böse",
            author="Friedrich Nietzsche",
            source_level=SourceLevel.S1,
            source_version="1886 German edition metadata",
            location="§21 bibliographic locator",
            context=(
                "书目与章节级审核摘要：尼采在相关段落中批判自由意志、自因和单一因果主体的"
                "传统表述；该材料只能支持转述，当前未录入可展示的逐字文本。"
            ),
            canonical_url=None,
        ),
        _passage(
            citation_id="nietzsche-sep-moral-political",
            philosopher_slug="nietzsche",
            category=EvidenceCategory.RESEARCH,
            title="Nietzsche's Moral and Political Philosophy",
            author="Stanford Encyclopedia of Philosophy",
            source_level=SourceLevel.S2,
            source_version="访问快照 2026-07-26",
            location="Agency and responsibility overview",
            context=(
                "研究解释摘要：尼采对责任、能动性和价值创造的讨论不能简化为赞成或否定日常"
                "意义上的自由；需要区分其对形而上学自由意志的批判与更强的自我塑造能力。"
            ),
            canonical_url="https://plato.stanford.edu/entries/nietzsche-moral-political/",
        ),
        _passage(
            citation_id="heidegger-being-and-time",
            philosopher_slug="heidegger",
            category=EvidenceCategory.PRIMARY,
            title="Sein und Zeit",
            author="Martin Heidegger",
            source_level=SourceLevel.S1,
            source_version="1927 first-edition bibliographic metadata",
            location="Authorship record",
            context="书目记录：《存在与时间》由马丁·海德格尔撰写并于 1927 年出版。",
            canonical_url=None,
        ),
    )


def _build_profiles() -> tuple[PhilosopherProfile, ...]:
    """Create answer outlines whose claims point to reviewed citation ids."""

    return (
        PhilosopherProfile(
            slug="kant",
            entity_id=_stable_id("entity:kant"),
            aliases=("康德", "kant"),
            answer=(
                "康德并不把自由理解为摆脱一切因果关系。自然科学可以按照自然因果解释事件；"
                "但在实践理性的层面，道德责任要求我们把理性主体视为能够自律行动。"
                "因此，自由在这里主要是实践上的必要前提，而不是可被经验观察证明的对象。"
            ),
            claims=(
                EvidenceClaim(
                    text="理论理性不能把自由作为经验对象加以证明。",
                    category=EvidenceCategory.PRIMARY,
                    citation_ids=("kant-critique-freedom",),
                ),
                EvidenceClaim(
                    text="实践自由与自律和道德责任相联系。",
                    category=EvidenceCategory.RESEARCH,
                    citation_ids=("kant-sep-moral-philosophy",),
                ),
                EvidenceClaim(
                    text="可以理解为，关键不在于行动有没有原因，而在于它能否归于主体的自律原则。",
                    category=EvidenceCategory.AI_INFERENCE,
                    citation_ids=(
                        "kant-critique-freedom",
                        "kant-sep-moral-philosophy",
                    ),
                ),
            ),
        ),
        PhilosopherProfile(
            slug="spinoza",
            entity_id=_stable_id("entity:spinoza"),
            aliases=("斯宾诺莎", "spinoza"),
            answer=(
                "斯宾诺莎不把自由理解为无原因地任选其一。一个行动越能从行动者自身的本性、"
                "充分认识和主动能力中产生，就越接近自由；越被外因和被动情感支配，就越不自由。"
                "所以“认识必然性”不是简单认命，而是改变行动由什么力量产生。"
            ),
            claims=(
                EvidenceClaim(
                    text="自由不等于没有原因的任意选择。",
                    category=EvidenceCategory.PRIMARY,
                    citation_ids=("spinoza-ethics-freedom",),
                ),
                EvidenceClaim(
                    text="充分认识与主动能力构成其自由概念的重要部分。",
                    category=EvidenceCategory.RESEARCH,
                    citation_ids=("spinoza-sep-psychological-theory",),
                ),
                EvidenceClaim(
                    text="可以理解为，自由程度取决于行动更多来自主动理解还是被动情感。",
                    category=EvidenceCategory.AI_INFERENCE,
                    citation_ids=(
                        "spinoza-ethics-freedom",
                        "spinoza-sep-psychological-theory",
                    ),
                ),
            ),
        ),
        PhilosopherProfile(
            slug="nietzsche",
            entity_id=_stable_id("entity:nietzsche"),
            aliases=("尼采", "nietzsche"),
            answer=(
                "尼采主要批判把自由意志理解为一个脱离条件、能够成为自身原因的主体。"
                "但这并不意味着他只主张被动决定论；其思想还重视力量组织、自我塑造和价值创造。"
                "回答尼采的自由问题时，需要区分他反对的形而上学自由意志与更强的能动性。"
            ),
            claims=(
                EvidenceClaim(
                    text="尼采批判自由意志和自因的传统形而上学表达。",
                    category=EvidenceCategory.PRIMARY,
                    citation_ids=("nietzsche-bge-free-will",),
                ),
                EvidenceClaim(
                    text="这种批判不能直接等同为日常意义上的被动决定论。",
                    category=EvidenceCategory.RESEARCH,
                    citation_ids=("nietzsche-sep-moral-political",),
                ),
                EvidenceClaim(
                    text="可以理解为，尼采是在重写能动性问题，而不只是删除自由概念。",
                    category=EvidenceCategory.AI_INFERENCE,
                    citation_ids=(
                        "nietzsche-bge-free-will",
                        "nietzsche-sep-moral-political",
                    ),
                ),
            ),
        ),
    )


def _profile_embedding(slug: str) -> tuple[float, ...]:
    """Return deterministic spike embeddings for the supported corpus."""

    embeddings = {
        "kant": (1.0, 0.0, 0.0, 0.0),
        "spinoza": (0.0, 1.0, 0.0, 0.0),
        "nietzsche": (0.0, 0.0, 1.0, 0.0),
        "heidegger": (0.0, 0.0, 0.0, 1.0),
    }
    return embeddings[slug]


def _display_name(slug: str) -> str:
    """Return the Chinese display name for a supported profile."""

    return {"kant": "康德", "spinoza": "斯宾诺莎", "nietzsche": "尼采"}[slug]


knowledge_answer_service = KnowledgeAnswerService()
