import { ArrowUpRight, CircleArrowDown, Compass } from "lucide-react";
import { useEffect, useState } from "react";

import socratesPortrait from "../assets/philosophers/socrates-louvre.jpg";

type WorkOverviewRoute = "today" | "dialogue" | "explore" | "archive" | "philosophers";
type DefenseSection = "hero" | "problem" | "method" | "tech" | "experience" | "value";

type WorkOverviewPageProps = {
  onNavigate: (view: WorkOverviewRoute) => void;
};

const defenseSections: Array<{ id: DefenseSection; label: string; shortLabel: string }> = [
  { id: "hero", label: "开始", shortLabel: "01" },
  { id: "problem", label: "背景", shortLabel: "02" },
  { id: "method", label: "方案", shortLabel: "03" },
  { id: "tech", label: "技术", shortLabel: "04" },
  { id: "experience", label: "页面", shortLabel: "05" },
  { id: "value", label: "价值", shortLabel: "06" },
];

const problemRows = [
  {
    label: "普通 AI 对话",
    title: "回答太快，问题太早结束",
    copy: "它擅长给出结论，却很少追问你为什么这样判断，也不会主动保留没有解决的张力。",
  },
  {
    label: "知识问答工具",
    title: "资料很多，关系很少",
    copy: "概念、人物和引用被拆成结果卡片，用户得到信息，却很难形成自己的思考路径。",
  },
  {
    label: "短期聊天记录",
    title: "对话结束，思想也被带走",
    copy: "没有可回看的问题演化，没有长期的思想档案，下一次只能从零开始。",
  },
];

const methodRows = [
  {
    index: "01 / 命题",
    title: "先留下一个问题",
    copy: "每日研习把注意力从“找答案”拉回“我真正想问什么”。",
    route: "today" as const,
  },
  {
    index: "02 / 追问",
    title: "让 AI 像哲学伙伴一样回应",
    copy: "通过苏格拉底式追问、反例和引用，让判断变得更清楚，而不是更热闹。",
    route: "dialogue" as const,
  },
  {
    index: "03 / 连接",
    title: "把人物与概念放回关系中",
    copy: "探索入口把问题连接到哲学家、原典和相关议题，形成可以继续走的路径。",
    route: "explore" as const,
  },
  {
    index: "04 / 留存",
    title: "把未完成变成下一步",
    copy: "思想档案保留追问和张力，让下一次对话从上一次真正停下来的地方开始。",
    route: "archive" as const,
  },
];

const techRows = [
  {
    label: "Frontend",
    title: "React + TypeScript + Vite",
    copy: "用组件化页面承载每日研习、对话、探索和档案，让交互可以持续演进。",
  },
  {
    label: "AI Layer",
    title: "模型 API + 哲学 RAG",
    copy: "按需检索人物、原典和观点，回答保留来源边界，不把资料堆在每一次对话前。",
  },
  {
    label: "Memory",
    title: "本地优先的思想档案",
    copy: "对话快照、模型配置和思想节点保存在本地服务与 SQLite 中，默认不把私人内容上传。",
  },
];

const experienceRows = [
  {
    index: "01 / 今日研习",
    title: "打开就看到一个值得停留的问题",
    copy: "内容先于功能，哲学家的存在是进入思想人格的入口，而不是百科装饰。",
    route: "today" as const,
  },
  {
    index: "02 / 对话空间",
    title: "用户消息进入视野，AI 从左侧继续追问",
    copy: "对话保留上下文，消息、流式回答和语音输入共同组成一段有节奏的思考。",
    route: "dialogue" as const,
  },
  {
    index: "03 / 探索空间",
    title: "知识关系从聊天旁边自然生长",
    copy: "探索不是跳去另一个数据库，而是在当前问题旁边打开更多概念和人物。",
    route: "explore" as const,
  },
  {
    index: "04 / 思想档案",
    title: "AI 发现你一直没有结束的问题",
    copy: "历史追问、思想张力和可拉动的关系图，让“记忆”变成继续思考的邀请。",
    route: "archive" as const,
  },
];

const valueRows = [
  {
    label: "对用户",
    title: "从一次回答，走向长期关系",
    copy: "用户不是读完一篇知识卡片就离开，而是拥有一条可以反复回来的个人思考路径。",
  },
  {
    label: "对哲学学习",
    title: "从人物资料，走向思想人格",
    copy: "哲学家不再只是静态介绍，而是以提问方式、核心概念和原典进入对话。",
  },
  {
    label: "对产品",
    title: "从聊天工具，走向思想工作台",
    copy: "对话、RAG、档案和未来的 Avatar、商业化能力，都围绕同一条思想轨迹扩展。",
  },
];

export function WorkOverviewPage({ onNavigate }: WorkOverviewPageProps) {
  const [activeSection, setActiveSection] = useState<DefenseSection>("hero");

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>(".work-overview-page .framework-reveal"));
    const sectionItems = Array.from(document.querySelectorAll<HTMLElement>("[data-defense-section]"));

    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12 },
    );

    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 45, 240)}ms`;
      revealObserver.observe(item);
    });

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const nextSection = visibleEntry?.target.getAttribute("data-defense-section") as DefenseSection | null;
        if (nextSection) setActiveSection(nextSection);
      },
      { rootMargin: "-18% 0px -58% 0px", threshold: [0.12, 0.35, 0.6] },
    );

    sectionItems.forEach((section) => sectionObserver.observe(section));
    return () => {
      revealObserver.disconnect();
      sectionObserver.disconnect();
    };
  }, []);

  const scrollToSection = (id: DefenseSection) => {
    document.getElementById(`defense-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="framework-experiment-page work-overview-page defense-page" id="overview" data-od-id="defense-overview">
      <div className="framework-demo-shell work-overview-shell">
        <div className="framework-demo-utility defense-utility">
          <span>DEFENSE WALKTHROUGH / 05 MINUTES</span>
          <span>PhilosophyOS · PRODUCT + TECHNICAL STORY</span>
        </div>

        <nav className="defense-progress" aria-label="答辩章节">
          {defenseSections.map((section) => (
            <button
              className={activeSection === section.id ? "active" : ""}
              type="button"
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              aria-current={activeSection === section.id ? "step" : undefined}
            >
              <span>{section.shortLabel}</span>
              <strong>{section.label}</strong>
            </button>
          ))}
        </nav>

        <header className="framework-demo-header work-overview-header defense-section defense-hero framework-reveal" id="defense-hero" data-defense-section="hero">
          <div>
            <span className="framework-demo-eyebrow">A five-minute defense</span>
            <h1 className="framework-demo-title">
              <span>让哲学对话</span>
              <span>留下<em>下一步</em>。</span>
              <span className="framework-demo-title-tension">一个 AI 思想伙伴的产品与技术说明。</span>
            </h1>
            <p className="framework-demo-lead">
              PhilosophyOS 不是把哲学知识搬进聊天框，而是把“提问、追问、连接和回看”设计成一条可以持续走下去的思考路径。
            </p>
            <div className="framework-demo-actions">
              <button type="button" className="framework-demo-primary" onClick={() => scrollToSection("problem")}>
                从问题开始 <ArrowUpRight size={15} />
              </button>
              <button type="button" className="framework-demo-secondary" onClick={() => onNavigate("today")}>
                直接看产品
              </button>
            </div>
            <div className="framework-demo-note">
              <span className="work-overview-note-mark" aria-hidden="true">5′</span>
              <span>背景 30 秒 · 方案 90 秒 · 技术 60 秒 · 页面与价值 2 分钟</span>
            </div>
          </div>

          <div className="framework-demo-hero-space work-overview-hero-space defense-hero-space" aria-label="答辩主题视觉">
            <div className="framework-demo-portrait-wash work-overview-portrait-wash" aria-hidden="true">
              <img src={socratesPortrait} alt="" />
            </div>
            <div className="framework-demo-signal">问题<br />是入口</div>
            <article className="framework-demo-thought-card work-overview-feature-card defense-hero-card">
              <div className="framework-demo-card-meta">
                <span>Defense / 01</span>
                <span>content-first</span>
              </div>
              <h2>不是让 AI 替你思考。</h2>
              <p>而是让它在你准备放弃一个问题之前，再追问一次。</p>
              <button type="button" className="framework-demo-card-footer" onClick={() => scrollToSection("problem")}>
                <span>为什么需要它</span>
                <ArrowUpRight size={15} />
              </button>
            </article>
          </div>
        </header>

        <section className="framework-demo-section defense-section defense-problem-section" id="defense-problem" data-defense-section="problem">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">02 / The problem</span>
            <div>
              <h2>普通 AI 能回答，但不一定能陪你把问题想完。</h2>
              <p>哲学对话的难点不是生成一段听起来正确的话，而是让用户愿意继续面对自己的判断。</p>
            </div>
          </div>

          <div className="defense-problem-grid">
            {problemRows.map((row) => (
              <article className="defense-problem-row framework-reveal" key={row.label}>
                <span>{row.label}</span>
                <h3>{row.title}</h3>
                <p>{row.copy}</p>
              </article>
            ))}
          </div>

          <div className="defense-claim framework-reveal">
            <span>核心判断</span>
            <strong>如果一次对话没有留下下一步，它就只是一次回答。</strong>
          </div>
        </section>

        <section className="framework-demo-section defense-section defense-method-section" id="defense-method" data-defense-section="method">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">03 / The method</span>
            <div>
              <h2>我们的答案：把聊天改造成一条思考路径。</h2>
              <p>不是增加更多功能，而是让每个功能都回答一个明确的动作：开始、追问、连接、留存。</p>
            </div>
          </div>

          <div className="defense-method-grid">
            {methodRows.map((row) => (
              <article className="defense-method-row framework-reveal" key={row.index}>
                <span>{row.index}</span>
                <h3>{row.title}</h3>
                <p>{row.copy}</p>
                <button type="button" onClick={() => onNavigate(row.route)}>
                  进入这一层 <ArrowUpRight size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="framework-demo-section defense-section defense-tech-section" id="defense-tech" data-defense-section="tech">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">04 / The technical spine</span>
            <div>
              <h2>技术不是后台，而是让思考可以被引用、被保存、被继续的骨架。</h2>
              <p>前端负责节奏与空间，后端负责边界与证据，档案负责把一次对话变成长期关系。</p>
            </div>
          </div>

          <div className="defense-tech-layout">
            <div className="defense-tech-stack">
              {techRows.map((row) => (
                <article className="defense-tech-row framework-reveal" key={row.label}>
                  <span>{row.label}</span>
                  <h3>{row.title}</h3>
                  <p>{row.copy}</p>
                </article>
              ))}
            </div>

            <div className="defense-tech-flow framework-reveal" aria-label="PhilosophyOS 技术数据流">
              <div className="defense-flow-node">
                <span>01</span>
                <strong>用户问题</strong>
                <small>保留原始判断</small>
              </div>
              <div className="defense-flow-line" aria-hidden="true">↓</div>
              <div className="defense-flow-node">
                <span>02</span>
                <strong>对话编排</strong>
                <small>追问 · 反例 · 流式输出</small>
              </div>
              <div className="defense-flow-line" aria-hidden="true">↓</div>
              <div className="defense-flow-node">
                <span>03</span>
                <strong>模型 / RAG</strong>
                <small>按需检索，保留来源边界</small>
              </div>
              <div className="defense-flow-line" aria-hidden="true">↓</div>
              <div className="defense-flow-node">
                <span>04</span>
                <strong>思想档案</strong>
                <small>下一次从未完成处开始</small>
              </div>
            </div>
          </div>

          <div className="defense-tech-note framework-reveal">
            <span>LOCAL-FIRST BOUNDARY</span>
            <strong>API Key、私人对话和思想快照默认留在本地服务与 SQLite 边界内。</strong>
          </div>
        </section>

        <section className="framework-demo-section defense-section defense-experience-section" id="defense-experience" data-defense-section="experience">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">05 / The interface</span>
            <div>
              <h2>打开页面，用户看到的不是后台，而是下一步。</h2>
              <p>页面设计把核心注意力留给问题本身，再把上下文、知识和档案放到需要时才出现的位置。</p>
            </div>
          </div>

          <div className="defense-experience-list">
            {experienceRows.map((row) => (
              <article className="defense-experience-row framework-reveal" key={row.index}>
                <span>{row.index}</span>
                <div>
                  <h3>{row.title}</h3>
                  <p>{row.copy}</p>
                </div>
                <button type="button" onClick={() => onNavigate(row.route)}>
                  查看页面 <ArrowUpRight size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="framework-demo-section framework-demo-path-section defense-section defense-value-section" id="defense-value" data-defense-section="value">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">06 / The value</span>
            <div>
              <h2>从一次回答，走向长期的思想关系。</h2>
              <p>这不是把哲学做成更复杂的问答，而是让 AI 帮助用户看见自己一直在追问什么。</p>
            </div>
          </div>

          <div className="defense-value-grid">
            {valueRows.map((row) => (
              <article className="defense-value-row framework-reveal" key={row.label}>
                <span>{row.label}</span>
                <h3>{row.title}</h3>
                <p>{row.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="framework-demo-final defense-close-section framework-reveal">
          <div>
            <span className="framework-demo-eyebrow">One sentence to remember</span>
            <h2>PhilosophyOS：让每一次对话，都成为下一次思考的起点。</h2>
            <p>答辩结束后，可以直接进入今日研习，用一个真实问题完成产品演示。</p>
          </div>
          <button type="button" className="framework-demo-primary" onClick={() => onNavigate("today")}>
            开始产品演示 <ArrowUpRight size={15} />
          </button>
        </section>

        <footer className="framework-demo-footer">
          <span>PhilosophyOS · 5-minute defense walkthrough</span>
          <span><Compass size={13} /> Problem → Method → Product → Trace</span>
        </footer>
      </div>

      <button type="button" className="framework-demo-scroll-cue defense-scroll-cue" onClick={() => scrollToSection("problem")} aria-label="进入答辩背景">
        <CircleArrowDown size={17} />
      </button>
    </main>
  );
}
