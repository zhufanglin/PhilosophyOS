import { ArrowUpRight, CircleArrowDown, Compass } from "lucide-react";
import { useEffect } from "react";

import socratesPortrait from "../assets/philosophers/socrates-louvre.jpg";

type WorkOverviewRoute = "today" | "dialogue" | "explore" | "archive" | "philosophers";

type WorkOverviewPageProps = {
  onNavigate: (view: WorkOverviewRoute) => void;
};

const overviewWorks: Array<{
  index: string;
  title: string;
  copy: string;
  route: WorkOverviewRoute;
}> = [
  {
    index: "01 / 每日研习",
    title: "从一个问题开始",
    copy: "每天只留下一个值得停留的问题，让思考先拥有方向，再拥有答案。",
    route: "today",
  },
  {
    index: "02 / 苏格拉底式对话",
    title: "把判断说出来",
    copy: "让 AI 继续追问、澄清和反诘，把模糊的直觉变成可以回看的思考。",
    route: "dialogue",
  },
  {
    index: "03 / 探索",
    title: "把好奇心摊开",
    copy: "从一个概念走向相关人物、原典与问题，不把探索压缩成一张结果卡片。",
    route: "explore",
  },
  {
    index: "04 / 思想档案",
    title: "留下未完成",
    copy: "保存追问、张力和观点的变化，让一次对话成为下一次思考的入口。",
    route: "archive",
  },
  {
    index: "05 / 哲学家图鉴",
    title: "进入一个思想人格",
    copy: "不只查看人物资料，而是从他的提问方式和核心概念进入一间思想工作室。",
    route: "philosophers",
  },
];

const pathRows = [
  {
    label: "Step 01 · 命题",
    title: "先停下来",
    copy: "一个今天真正愿意面对的问题，比一整页漂亮的知识更值得开始。",
  },
  {
    label: "Step 02 · 对话",
    title: "让问题变深",
    copy: "在追问、引用和反例之间，看见自己判断里还没有说完的部分。",
  },
  {
    label: "Step 03 · 留存",
    title: "回到自己",
    copy: "把每一次对话留成可以继续生长的思想节点，而不是聊天记录的堆积。",
  },
];

export function WorkOverviewPage({ onNavigate }: WorkOverviewPageProps) {
  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>(".work-overview-page .framework-reveal"));
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

  const scrollToWorks = () => {
    document.getElementById("overview-works")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="framework-experiment-page work-overview-page" id="overview" data-od-id="work-overview">
      <div className="framework-demo-shell work-overview-shell">
        <div className="framework-demo-utility">
          <span>WORKS OVERVIEW / PHILOSOPHYOS</span>
          <span>05 个入口 · 01 条思考路径</span>
        </div>

        <header className="framework-demo-header work-overview-header framework-reveal">
          <div>
            <span className="framework-demo-eyebrow">A living portfolio</span>
            <h1 className="framework-demo-title">
              <span>把每一次提问</span>
              <span>变成一件<em>持续生长</em>的作品。</span>
              <span className="framework-demo-title-tension">从今日研习，到思想档案。</span>
            </h1>
            <p className="framework-demo-lead">
              这里不是功能列表，而是 PhilosophyOS 正在搭建的一条思考路径。
              你可以从一个命题出发，进入对话、探索人物，再把没有结束的问题带回自己。
            </p>
            <div className="framework-demo-actions">
              <button type="button" className="framework-demo-primary" onClick={() => onNavigate("today")}>
                进入每日研习 <ArrowUpRight size={15} />
              </button>
              <button type="button" className="framework-demo-secondary" onClick={scrollToWorks}>
                查看全部作品
              </button>
            </div>
            <div className="framework-demo-note">
              <span className="work-overview-note-mark" aria-hidden="true">05</span>
              <span>五个入口，共同指向一件事：让思考不止发生一次。</span>
            </div>
          </div>

          <div className="framework-demo-hero-space work-overview-hero-space" aria-label="PhilosophyOS 作品总览">
            <div className="framework-demo-portrait-wash work-overview-portrait-wash" aria-hidden="true">
              <img src={socratesPortrait} alt="" />
            </div>
            <div className="framework-demo-signal">作品<br />正在生长</div>
            <article className="framework-demo-thought-card work-overview-feature-card">
              <div className="framework-demo-card-meta">
                <span>当前入口 · 01</span>
                <span>content-first</span>
              </div>
              <h2>一张从问题开始的地图</h2>
              <p>
                每个模块都不是孤立页面。它们像一组工作台，让你在提问、对话和回看之间保持一条清晰的内在线索。
              </p>
              <button type="button" className="framework-demo-card-footer" onClick={() => onNavigate("today")}>
                <span>从今天的问题开始</span>
                <ArrowUpRight size={15} />
              </button>
            </article>
          </div>
        </header>

        <section className="framework-demo-section work-overview-works-section" id="overview-works">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">The works</span>
            <div>
              <h2>五个入口，一条思考路径。</h2>
              <p>
                作品总览把现在已经存在的工作入口放在同一张结构图里。
                你可以从任意一个位置进入，也可以沿着自己的问题继续往下走。
              </p>
            </div>
          </div>

          <div className="work-overview-index-grid">
            {overviewWorks.map((work) => (
              <article className="work-overview-index-card framework-reveal" key={work.index}>
                <span>{work.index}</span>
                <h3>{work.title}</h3>
                <p>{work.copy}</p>
                <button type="button" onClick={() => onNavigate(work.route)}>
                  打开入口 <ArrowUpRight size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="framework-demo-section framework-demo-path-section work-overview-path-section">
          <div className="framework-demo-section-head framework-reveal">
            <span className="framework-demo-eyebrow">A living archive</span>
            <div>
              <h2>作品不是页面，是你反复返回的地方。</h2>
              <p>
                这里的每一个入口，都在帮助你把一次性的灵感变成可以继续追问的思想轨迹。
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
            <h2>先从一个你真的在意的问题开始。</h2>
            <p>
              PhilosophyOS 还在生长。作品总览会记录它如何从一个对话入口，慢慢变成属于你的思想空间。
            </p>
          </div>
          <button type="button" className="framework-demo-primary" onClick={() => onNavigate("today")}>
            开始今天的思考 <ArrowUpRight size={15} />
          </button>
        </section>

        <footer className="framework-demo-footer">
          <span>PhilosophyOS · Digital philosophy sanctuary</span>
          <span><Compass size={13} /> Question → Dialogue → Trace</span>
        </footer>
      </div>

      <button type="button" className="framework-demo-scroll-cue" onClick={scrollToWorks} aria-label="滚动到作品列表">
        <CircleArrowDown size={17} />
      </button>
    </main>
  );
}
