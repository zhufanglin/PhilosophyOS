import {
  ArrowRight,
  BookOpenCheck,
  MessageCircle,
  Network,
  RefreshCw,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import kantPortrait from "../assets/philosophers/kant-becker.jpg";
import sartreArchivePortrait from "../assets/philosophers/sartre-1967.jpg";
import socratesPortrait from "../assets/philosophers/socrates-louvre.jpg";

export type DailyQuestionView = {
  id: string;
  domain: string;
  difficulty: string;
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
  onQuestionChange?: (question: DailyQuestionView) => void;
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

export const dailyQuestions: DailyQuestionView[] = [
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
    portraitUrl: sartreArchivePortrait,
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

export function TodayPage({ apiBaseUrl, onStart, onQuestionChange }: TodayPageProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [activeConceptIndex, setActiveConceptIndex] = useState(0);
  const [activeUtility, setActiveUtility] = useState<"history" | "map" | null>(null);
  const [followupQuestion, setFollowupQuestion] = useState<DailyQuestionView | null>(null);
  const [followupLoading, setFollowupLoading] = useState(true);
  const [followupRequestKey, setFollowupRequestKey] = useState(() => window.location.hash);
  const question = dailyQuestions[questionIndex];
  const todayLabel = formatToday(new Date());
  const portraitVariant = question.englishName?.toLowerCase().includes("sartre") ? " is-sartre" : "";

  useEffect(() => {
    onQuestionChange?.(question);
  }, [onQuestionChange, question]);

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
    setQuestionIndex((current) => (current + 1) % dailyQuestions.length);
    setActiveConceptIndex(0);
  }

  function openCurrentPhilosopherAtlas() {
    window.location.hash = `philosophers?search=${encodeURIComponent(question.philosopher)}`;
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
    <main className="framework-experiment-page today-framework-page" id="today" data-od-id="today-workspace">
      <div className="framework-demo-shell today-framework-shell">
        <div className="framework-demo-utility">
          <span>TODAY / CONTENT-FIRST THINKING</span>
          <span>PhilosophyOS · 01</span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.header
            key={question.id}
            className="framework-demo-header today-framework-header"
            aria-label={`${question.philosopher}今日思想空间`}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.985 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <div>
              <span className="framework-demo-eyebrow">{todayLabel}</span>
              <h1 className="framework-demo-title">
                <span>今天，和<em>{question.philosopher}</em></span>
                <span>一起思考</span>
                <span className="framework-demo-title-tension">关于{question.tension}。</span>
              </h1>
              <p className="framework-demo-lead">
                从一个真实问题开始，再让对话、引用和思想档案慢慢长出自己的方向。
                这不是浏览资料，而是进入一个可以持续回来的思想空间。
              </p>
              <div className="framework-demo-actions">
                <button className="framework-demo-primary" type="button" onClick={() => onStart(question)} data-od-id="start-thinking">
                  开始思考 <ArrowRight size={15} />
                </button>
                <button className="framework-demo-secondary" type="button" onClick={chooseAnotherQuestion}>
                  换一题
                </button>
              </div>
              <div className="framework-demo-note">
                <span className="framework-demo-avatar-stack" aria-hidden="true">
                  <i>苏</i>
                  <i>康</i>
                  <i>萨</i>
                </span>
                <span>从 38 位思想家开始，逐步建立自己的思想地图。</span>
              </div>
            </div>

            <div className="framework-demo-hero-space" aria-label="今日命题预览">
              <div className={`framework-demo-portrait-wash${portraitVariant}`} aria-hidden="true">
                <img src={question.portraitUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
              </div>
              <div className="framework-demo-signal">问题<br />是入口</div>
              <article className="framework-demo-thought-card">
                <div className="framework-demo-card-meta">
                  <span>今日命题 · {question.id.toUpperCase()}</span>
                  <span>{question.domain}</span>
                </div>
                <h2>{question.prompt}</h2>
                <p>{question.quote ?? `${question.philosopher}不会先给你结论，而会先追问：你真正想确认的是什么？`}</p>
                <button className="framework-demo-card-footer" type="button" onClick={openCurrentPhilosopherAtlas}>
                  <span>了解{question.philosopher}</span>
                  <ArrowRight size={15} />
                </button>
              </article>
            </div>
          </motion.header>
        </AnimatePresence>

        <div className="today-framework-floating-dock" aria-label="今日思考工具">
          <AnimatePresence initial={false} mode="popLayout">
            {activeUtility !== "history" ? (
              <motion.button
                key="history-widget"
                layoutId="today-history-widget"
                className={`today-framework-floating-widget ${followupLoading || followupQuestion ? "is-pending" : ""}`}
                type="button"
                onClick={() => setActiveUtility("history")}
                aria-label="打开历史追问"
                initial={{ opacity: 0, scale: 0.88, y: 10 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.86, y: 8 }}
                transition={{ type: "spring", stiffness: 360, damping: 28 }}
                whileHover={{ y: -3, scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <MessageCircle size={17} />
                <span>历史追问</span>
                {followupQuestion ? <i aria-label="有待处理问题" /> : null}
              </motion.button>
            ) : null}
            {activeUtility !== "map" ? (
              <motion.button
                key="map-widget"
                layoutId="today-map-widget"
                className="today-framework-floating-widget"
                type="button"
                onClick={() => setActiveUtility("map")}
                aria-label="打开思想地图"
                initial={{ opacity: 0, scale: 0.88, y: 10 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.86, y: 8 }}
                transition={{ type: "spring", stiffness: 360, damping: 28 }}
                whileHover={{ y: -3, scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Network size={17} />
                <span>思想地图</span>
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {activeUtility === "history" ? (
            <motion.aside
              key="history-panel"
              layoutId="today-history-widget"
              className="today-framework-floating-panel today-framework-floating-panel-history"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: "spring", stiffness: 280, damping: 27 }}
              aria-label="历史追问面板"
            >
              <div className="today-framework-floating-panel-head">
                <div>
                  <span className="today-framework-floating-kicker">Continue the thread</span>
                  <h2>历史追问</h2>
                </div>
                <button type="button" onClick={() => setActiveUtility(null)} aria-label="关闭历史追问"><X size={16} /></button>
              </div>
              <div className="today-framework-floating-topic">
                <span>正在探索</span>
                <strong>{question.tension}</strong>
                <p>{question.prompt}</p>
              </div>
              <div className="today-framework-floating-task">
                <div className="today-framework-floating-task-icon">
                  {followupLoading ? <RefreshCw size={15} className="is-spinning" /> : <BookOpenCheck size={15} />}
                </div>
                <div>
                  <span>{followupLoading ? "正在寻找未完成问题" : followupQuestion ? "待继续的思考" : "暂无未完成追问"}</span>
                  <strong>
                    {followupLoading ? "思想档案检索中" : followupQuestion ? followupQuestion.prompt : "今天的回答会成为下一次追问的起点"}
                  </strong>
                </div>
              </div>
              {followupQuestion ? (
                <button className="today-framework-floating-action" type="button" onClick={() => onStart(followupQuestion)}>
                  继续这个问题 <ArrowRight size={15} />
                </button>
              ) : null}
            </motion.aside>
          ) : null}

          {activeUtility === "map" ? (
            <motion.aside
              key="map-panel"
              layoutId="today-map-widget"
              className="today-framework-floating-panel today-framework-floating-panel-map"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: "spring", stiffness: 280, damping: 27 }}
              aria-label="思想地图面板"
            >
              <div className="today-framework-floating-panel-head">
                <div>
                  <span className="today-framework-floating-kicker">Thought relations</span>
                  <h2>思想地图</h2>
                </div>
                <button type="button" onClick={() => setActiveUtility(null)} aria-label="关闭思想地图"><X size={16} /></button>
              </div>
              <div className="today-framework-floating-map">
                <div className="today-framework-map-canvas" aria-label="今日命题相关概念">
                  <span className="today-framework-map-line today-framework-map-line-one" aria-hidden="true" />
                  <span className="today-framework-map-line today-framework-map-line-two" aria-hidden="true" />
                  <span className="today-framework-map-line today-framework-map-line-three" aria-hidden="true" />
                  <div className="today-framework-map-origin">
                    <span>今日命题</span>
                    <strong>{question.tension}</strong>
                  </div>
                  {conceptDetails.map((concept, index) => (
                    <button
                      className={`today-framework-map-node today-framework-map-node-${index + 1}${activeConceptIndex === index ? " is-active" : ""}`}
                      type="button"
                      key={concept.label}
                      aria-pressed={activeConceptIndex === index}
                      onClick={() => setActiveConceptIndex(index)}
                    >
                      <span>{concept.label}</span>
                      <small>{concept.relation}</small>
                    </button>
                  ))}
                </div>
                <div className="today-framework-floating-map-detail">
                  <span>{activeConcept.relation}</span>
                  <strong>{activeConcept.label}</strong>
                  <p>{activeConcept.description}</p>
                </div>
              </div>
              <button className="today-framework-floating-action" type="button" onClick={() => onStart(question)}>
                从这个概念开始追问 <ArrowRight size={15} />
              </button>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <section className="framework-demo-section framework-demo-path-section today-framework-method" id="today-method" aria-labelledby="today-method-title">
          <div className="framework-demo-section-head">
            <span className="framework-demo-eyebrow">A living archive</span>
            <div>
              <h2 id="today-method-title">从一次回答，到一条可校对的思想节点。</h2>
              <p>PhilosophyOS 不把对话停留在“AI 给答案”。你回答，系统追问，然后把真正发生变化的观点沉淀进档案。</p>
            </div>
          </div>
          <div className="framework-demo-path">
            {thinkingWorkflow.map((step) => (
              <article className="framework-demo-path-step" key={step.index}>
                <strong>{step.index} / {step.title}</strong>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
          <p className="today-framework-method-note">这里记录的不是聊天记录本身，而是你在追问中逐渐形成、修正、确认过的思想证据。</p>
        </section>

        <section className="today-framework-progress" aria-label="最近进度">
          <div className="today-framework-progress-copy">
            <span>CONTINUE / 01</span>
            <strong>自由与因果</strong>
            <p>已完成 4 轮追问，观点等待确认</p>
          </div>
          <div className="today-framework-progress-value">
            <span>当前轨迹</span>
            <strong>4 / 5</strong>
          </div>
        </section>

        <footer className="framework-demo-footer">
          <span>PhilosophyOS · Digital philosophy sanctuary</span>
          <span>Question → Dialogue → Trace</span>
        </footer>
      </div>
    </main>
  );
}
