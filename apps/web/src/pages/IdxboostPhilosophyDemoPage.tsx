import { ArrowUpRight, CircleArrowDown, Compass } from "lucide-react";
import { useEffect, useState } from "react";

import type { DailyQuestionView } from "./TodayPage";

type IdxboostPhilosophyDemoPageProps = {
  question: DailyQuestionView;
  onStart: (question: DailyQuestionView) => void;
  onSwapQuestion: () => void;
};

const featureRows = [
  {
    index: "01 / 选择",
    title: "进入一种思考方式",
    copy: "不是看人物百科，而是了解他会怎样追问、如何判断，以及哪里会挑战你的直觉。",
  },
  {
    index: "02 / 对话",
    title: "把问题说出来",
    copy: "AI 以哲学家的语气和方法回应，引用原典，但不替你结束思考。",
  },
  {
    index: "03 / 留存",
    title: "让思考留下轨迹",
    copy: "保存追问、概念和观点变化，慢慢形成一张属于你的思想地图。",
  },
];

const pathRows = [
  {
    label: "Step 01 · 命题",
    title: "看见问题",
    copy: "每日命题、主题探索和哲学家的反问，帮助你找到真正想谈的事。",
  },
  {
    label: "Step 02 · 对话",
    title: "停留片刻",
    copy: "支持文字、语音和流式回复，像一个会持续追问的思考伙伴。",
  },
  {
    label: "Step 03 · 档案",
    title: "回到自己",
    copy: "回看你如何改变观点，并发现自由、责任、爱与死亡之间的关系。",
  },
];

export function IdxboostPhilosophyDemoPage({ question, onStart, onSwapQuestion }: IdxboostPhilosophyDemoPageProps) {
  const [toast, setToast] = useState("");

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>(".framework-reveal"));
    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12 },
    );
    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 45, 240)}ms`;
      observer.observe(item);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="framework-experiment-page" id="idxboost-demo">
      <div className="framework-demo-shell">
        <div className="framework-demo-utility">
          <span>FRAMEWORK EXPERIMENT / CONTENT-FIRST LANDING</span>
          <span>PhilosophyOS · 01</span>
        </div>

        <header className="framework-demo-header framework-reveal">
          <div>
            <span className="framework-demo-eyebrow">Today’s question</span>
            <h1 className="framework-demo-title">
              <span>今天，和<em>{question.philosopher}</em></span>
              <span>一起思考</span>
              <span className="framework-demo-title-tension">关于{question.tension}。</span>
            </h1>
            <p className="framework-demo-lead">
              先从一个真实问题开始，再让对话、引用和思考档案慢慢长出自己的方向。
              这不是浏览资料，而是进入一个可以持续回来的思想空间。
            </p>
            <div className="framework-demo-actions">
              <button type="button" className="framework-demo-primary" onClick={() => onStart(question)}>
                开始思考 <ArrowUpRight size={15} />
              </button>
              <button type="button" className="framework-demo-secondary" onClick={onSwapQuestion}>
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
            <div className="framework-demo-portrait-wash" aria-hidden="true">
              <img src={question.portraitUrl} alt="" />
            </div>
            <div className="framework-demo-signal">问题<br />是入口</div>
            <article className="framework-demo-thought-card">
              <div className="framework-demo-card-meta">
                <span>今日命题 · {question.id.toUpperCase()}</span>
                <span>{question.domain}</span>
              </div>
              <h2>{question.prompt}</h2>
              <p>
                {question.quote ?? `${question.philosopher}不会先给你结论，而会先追问：你真正想确认的是什么？`}
              </p>
              <button
                type="button"
                className="framework-demo-card-footer"
                onClick={() => onStart(question)}
              >
                <span>与{question.philosopher}开始对话</span>
                <ArrowUpRight size={15} />
              </button>
            </article>
          </div>
        </header>

        <section className="framework-demo-section" id="framework-method">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">The philosophy workflow</span>
            <div>
              <h2>不是知识库，是一条可以继续走的思考路径。</h2>
              <p>
                首页的功能不是把所有内容一次性塞给用户，而是让用户清楚下一步该做什么：
                选择一个思想人格，提出一个真实问题，然后留下自己的变化。
              </p>
            </div>
          </div>

          <div className="framework-demo-feature-list">
            {featureRows.map((feature) => (
              <article className="framework-demo-feature framework-reveal" key={feature.index}>
                <span>{feature.index}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="framework-demo-section framework-demo-path-section" id="framework-archive">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">A living archive</span>
            <div>
              <h2>每一次对话，都会改变下一次提问。</h2>
              <p>
                你的思考档案不是聊天记录的堆积，而是一条逐渐清晰的内在路线。
                这也是 PhilosophyOS 与普通问答工具的区别。
              </p>
            </div>
          </div>

          <div className="framework-demo-path">
            {pathRows.map((step) => (
              <article className="framework-demo-path-step framework-reveal" key={step.label}>
                <strong>{step.label}</strong>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="framework-demo-final framework-reveal">
          <div>
            <span className="framework-demo-eyebrow">Start with one honest question</span>
            <h2>今天，先问一个你真的在意的问题。</h2>
            <p>这是一个首页结构实验。接入真实 API、RAG 和对话模块后，这里就是用户进入长期思考的第一步。</p>
          </div>
          <button
            type="button"
            className="framework-demo-primary"
            onClick={() => setToast("演示完成。这里可以接入 /dialogue 或 /explore 路由。")}
          >
            开始一次对话 <ArrowUpRight size={15} />
          </button>
        </section>

        <footer className="framework-demo-footer">
          <span>PhilosophyOS · Digital philosophy sanctuary</span>
          <span><Compass size={13} /> Question → Dialogue → Trace</span>
        </footer>
      </div>

      {toast ? <div className="framework-demo-toast" role="status">{toast}</div> : null}
      <button type="button" className="framework-demo-scroll-cue" onClick={() => scrollTo("framework-method")} aria-label="滚动到方法介绍">
        <CircleArrowDown size={17} />
      </button>
    </main>
  );
}
