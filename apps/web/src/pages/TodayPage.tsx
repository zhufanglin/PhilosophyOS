import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

import kantPortrait from "../assets/philosophers/kant-becker.jpg";
import sartrePortrait from "../assets/philosophers/sartre-cutout-v2.png";
import socratesPortrait from "../assets/philosophers/socrates-cutout.png";

export type DailyQuestionView = {
  id: string;
  domain: string;
  difficulty: "入门" | "进阶";
  era: string;
  period?: string;
  prompt: string;
  tension: string;
  philosopher: string;
  englishName?: string;
  lifeSpan?: string;
  quote?: string;
  tags?: string[];
  source: string;
  portraitUrl: string;
  sourceSnapshotId?: string;
  sourceSnapshotTitle?: string;
  originalQuestion?: string;
  isHistoricalFollowup?: boolean;
};

type TodayPageProps = {
  apiBaseUrl: string;
  onStart: (question: DailyQuestionView) => void;
};

type ReflectionNextQuestionItem = {
  snapshot_id: string;
  created_at: string;
  topic: string;
  title: string;
  question: string;
  next_question: string;
  tension: string | null;
  philosopher_names: string[];
} | null;

const questions: DailyQuestionView[] = [
  {
    id: "q014",
    domain: "伦理学",
    difficulty: "进阶",
    era: "古希腊",
    period: "古希腊哲学家",
    prompt: "当诚实地生活必然带来损失时，我们仍有理由坚持诚实吗？",
    tension: "德性与结果",
    philosopher: "苏格拉底",
    englishName: "Socrates",
    lifeSpan: "约公元前 470 — 公元前 399",
    quote: "未经审视的人生不值得过。",
    tags: ["伦理学", "德性", "灵魂照料"],
    source: "审核问题库 · 30 天内未出现",
    portraitUrl: socratesPortrait,
  },
  {
    id: "q027",
    domain: "政治哲学",
    difficulty: "入门",
    era: "启蒙运动",
    period: "启蒙时代哲学家",
    prompt: "一项法律获得多数人支持，是否就足以证明它是正当的？",
    tension: "合法性与正当性",
    philosopher: "康德",
    englishName: "Immanuel Kant",
    lifeSpan: "1724 — 1804",
    quote: "有两种东西，我越思考越感到敬畏：头上的星空与心中的道德法则。",
    tags: ["义务论", "理性", "自由"],
    source: "审核问题库 · 30 天内未出现",
    portraitUrl: kantPortrait,
  },
  {
    id: "q041",
    domain: "存在主义",
    difficulty: "进阶",
    era: "20 世纪",
    period: "近现代哲学家",
    prompt: "如果人的选择总受处境限制，我们仍能为自己成为什么样的人负责吗？",
    tension: "处境与自由",
    philosopher: "萨特",
    englishName: "Jean-Paul Sartre",
    lifeSpan: "1905 — 1980",
    quote: "存在先于本质。",
    tags: ["存在主义", "自由", "责任"],
    source: "审核问题库 · 30 天内未出现",
    portraitUrl: sartrePortrait,
  },
];

const thinkingWorkflow = [
  {
    index: "01",
    title: "回答今日问题",
    description: "先留下你的原始判断，不急着追求标准答案。",
  },
  {
    index: "02",
    title: "进入哲学追问",
    description: "AI 负责追问、澄清和指出张力，不替你下结论。",
  },
  {
    index: "03",
    title: "生成思想节点",
    description: "把阶段性立场、犹豫和下一步问题整理成快照。",
  },
  {
    index: "04",
    title: "校对思想档案",
    description: "你可以认可、反对、重写，或只保留原始发言。",
  },
];

function formatToday(date: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")} 年 ${value("month")} 月 ${value("day")} 日 · ${value("weekday")}`;
}

function followupToQuestion(item: NonNullable<ReflectionNextQuestionItem>): DailyQuestionView {
  const philosopher = item.philosopher_names[0] ?? "PhilosophyOS";
  return {
    id: `archive-${item.snapshot_id}`,
    domain: item.topic,
    difficulty: "进阶",
    era: "思想档案",
    period: "历史追问",
    prompt: item.next_question,
    tension: item.tension ?? "未完成追问",
    philosopher,
    englishName: philosopher,
    quote: "未完成的问题，会在下一次诚实思考中继续生长。",
    tags: [item.topic, item.tension ?? "继续追问"].filter((tag): tag is string => Boolean(tag)),
    source: "思想档案 · 历史追问",
    portraitUrl: socratesPortrait,
    sourceSnapshotId: item.snapshot_id,
    sourceSnapshotTitle: item.title,
    originalQuestion: item.question,
    isHistoricalFollowup: true,
  };
}

export function TodayPage({ apiBaseUrl, onStart }: TodayPageProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [activeConceptIndex, setActiveConceptIndex] = useState(0);
  const [followupQuestion, setFollowupQuestion] = useState<DailyQuestionView | null>(null);
  const [followupLoading, setFollowupLoading] = useState(true);
  const [followupRequestKey, setFollowupRequestKey] = useState(() => window.location.hash);
  const question = questions[questionIndex];
  const todayLabel = formatToday(new Date());
  const portraitTags = question.tags ?? [question.domain, question.tension, question.era];
  const conceptDetails = [
    {
      label: question.tags?.[0] ?? question.domain,
      description: `从“${question.prompt}”进入，先确认你对这个概念的直觉定义。`,
      relation: "核心概念",
    },
    {
      label: question.tension,
      description: `当前命题的关键张力是“${question.tension}”，适合用反例检验判断边界。`,
      relation: "对立张力",
    },
    {
      label: question.philosopher,
      description: `以${question.philosopher}作为追问入口，把观点放回具体哲学语境中。`,
      relation: "继续追问",
    },
  ];
  const activeConcept = conceptDetails[activeConceptIndex] ?? conceptDetails[0];

  function chooseAnotherQuestion() {
    setQuestionIndex((current) => (current + 1) % questions.length);
    setActiveConceptIndex(0);
  }

  useEffect(() => {
    function updateFollowupRequestKey() {
      const hashView = window.location.hash.slice(1).split("?")[0];
      if (hashView === "today") setFollowupRequestKey(window.location.hash);
    }
    window.addEventListener("hashchange", updateFollowupRequestKey);
    return () => window.removeEventListener("hashchange", updateFollowupRequestKey);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(followupRequestKey.split("?")[1] ?? "");
    const snapshotId = params.get("continue");
    const query = snapshotId ? `?snapshot_id=${encodeURIComponent(snapshotId)}` : "";

    async function loadFollowupQuestion() {
      setFollowupLoading(true);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/reflection-archive/next-question${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as ReflectionNextQuestionItem;
        setFollowupQuestion(payload ? followupToQuestion(payload) : null);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setFollowupQuestion(null);
      } finally {
        if (!controller.signal.aborted) setFollowupLoading(false);
      }
    }

    void loadFollowupQuestion();
    return () => controller.abort();
  }, [apiBaseUrl, followupRequestKey]);

  return (
    <main className="today-page" id="today" data-od-id="today-workspace">
      <header className="today-heading" data-od-id="today-heading">
        <div>
          <p className="section-kicker">{todayLabel}</p>
          <p className="today-heading-title">今日思考</p>
        </div>
        <div className="today-heading-aside">
          <p>留一点时间，把一个判断想得更清楚。</p>
          <div className="daily-meta" aria-label="今日练习状态">
            <span><Clock3 size={15} /> 约 12 分钟</span>
            <span><ShieldCheck size={15} /> 审核题目</span>
          </div>
        </div>
      </header>

      {followupQuestion || followupLoading ? (
        <section className="historical-followup-card" aria-label="继续上次未完成追问">
          <div className="continue-index">
            <BookOpenCheck size={18} />
            <span>继续 / 历史追问</span>
          </div>
          {followupLoading ? (
            <div>
              <span>正在翻找未完成的问题</span>
              <strong>思想档案检索中</strong>
              <p>如果最近节点保存了下一步问题，它会出现在这里。</p>
            </div>
          ) : followupQuestion ? (
            <>
              <div>
                <span>{followupQuestion.domain} · {followupQuestion.sourceSnapshotTitle}</span>
                <strong>{followupQuestion.prompt}</strong>
                <p>来源：{followupQuestion.originalQuestion}</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => onStart(followupQuestion)}>
                继续这个问题 <ArrowRight size={16} />
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="daily-question" aria-labelledby="daily-question-title" data-od-id="focus-proposition">
        <figure className="question-portrait">
          <div className="museum-portrait-stage" data-era={question.era}>
            <div className="museum-arch-lines" aria-hidden="true" />
            <div className="museum-manuscript" aria-hidden="true">
              <span>λόγος</span>
              <span>virtus · ratio · freedom</span>
            </div>
            <div className="portrait-aura" aria-hidden="true" />
            <div className="portrait-frame">
              <span className="portrait-fallback" aria-hidden="true">Φ</span>
              <img
                key={question.id}
                src={question.portraitUrl}
                alt={`${question.philosopher}肖像`}
                data-philosopher={question.philosopher}
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            </div>
          </div>
          <figcaption>
            <span>{question.englishName ?? question.philosopher}</span>
            <strong>{question.philosopher}</strong>
            <small>{question.period ?? question.era}</small>
            {question.lifeSpan ? <small>{question.lifeSpan}</small> : null}
            <div className="portrait-tags" aria-label="核心思想标签">
              {portraitTags.map((tag) => (
                <em key={tag}>{tag}</em>
              ))}
            </div>
          </figcaption>
        </figure>

        <article className="daily-question-copy">
          <div className="question-series">
            <span>今日命题</span>
            <span>{question.id.toUpperCase()}</span>
          </div>
          <div className="question-tags" aria-label="问题分类">
            <span>{question.domain}</span>
            <span>{question.difficulty}</span>
            <span>{question.era}</span>
          </div>
          <h1 id="daily-question-title" data-od-id="focus-proposition-title">{question.prompt}</h1>
          <blockquote className="philosopher-quote">
            <p>{question.quote ?? "把一个判断想清楚，也是在重新整理自己与世界的关系。"}</p>
            <cite>— {question.philosopher}</cite>
          </blockquote>
          <dl className="question-context">
            <div>
              <dt>核心张力</dt>
              <dd>{question.tension}</dd>
            </div>
            <div>
              <dt>题目来源</dt>
              <dd>{question.source}</dd>
            </div>
          </dl>
          <div className="daily-actions">
            <button className="primary-button start-button" type="button" onClick={() => onStart(question)} data-od-id="start-thinking">
              开始思考 <ArrowRight size={18} />
            </button>
            <button className="secondary-button" type="button" onClick={chooseAnotherQuestion}>
              <RefreshCw size={17} /> 换一题
            </button>
          </div>
        </article>

        <aside className="thinking-context-panel" aria-label="思想上下文" data-od-id="concept-track">
          <div className="context-panel-heading">
            <div>
              <span className="context-panel-kicker">关联现场</span>
              <h2>命题周围</h2>
            </div>
            <span className="context-live"><i />活跃</span>
          </div>

          <div className="concept-network" aria-label="相关概念">
            <span className="network-line network-line-one" aria-hidden="true" />
            <span className="network-line network-line-two" aria-hidden="true" />
            <span className="network-line network-line-three" aria-hidden="true" />
            {conceptDetails.map((concept, index) => (
              <button
                className={`concept-node concept-node-${index + 1}${activeConceptIndex === index ? " selected" : ""}`}
                type="button"
                key={concept.label}
                aria-pressed={activeConceptIndex === index}
                onClick={() => setActiveConceptIndex(index)}
              >
                <span>{concept.label}</span>
                <small>{index === 0 ? "起点" : index === 1 ? "张力" : "追问"}</small>
              </button>
            ))}
          </div>

          <div className="context-detail">
            <span>{activeConcept.relation}</span>
            <strong>{activeConcept.label}</strong>
            <p>{activeConcept.description}</p>
            <button type="button" onClick={() => onStart(question)}>
              从这个概念开始追问 <ArrowRight size={15} />
            </button>
          </div>

          <div className="context-ledger">
            <div>
              <span>推理路径</span>
              <strong>3 条</strong>
            </div>
            <div>
              <span>可用来源</span>
              <strong>2 项</strong>
            </div>
            <div>
              <span>状态</span>
              <strong>待展开</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="today-product-narrative" aria-label="PhilosophyOS 工作流程">
        <div className="narrative-header">
          <span>思想沉淀方法</span>
          <h2>从一次回答，到一条可校对的思想节点</h2>
          <p>
            PhilosophyOS 不把对话停留在“AI 给答案”。它更像一张思想工作台：你回答，系统追问，
            然后把真正发生变化的观点沉淀进档案。
          </p>
        </div>
        <ol className="narrative-flow">
          {thinkingWorkflow.map((step) => (
            <li className="narrative-step" key={step.index}>
              <span className="narrative-step-index">{step.index}</span>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <p className="narrative-note">
          这里记录的不是聊天记录本身，而是你在追问中逐渐形成、修正、确认过的思想证据。
        </p>
      </section>

      <section className="today-footnote" aria-label="最近进度">
        <div className="continue-index">
          <BookOpenCheck size={18} />
          <span>继续 / 01</span>
        </div>
        <div>
          <span>上一次思考</span>
          <strong>自由与因果</strong>
          <span>已完成 4 轮追问，观点等待确认</span>
        </div>
        <div className="progress-value">
          <span>完成进度</span>
          <strong>4 / 5</strong>
        </div>
      </section>
    </main>
  );
}
