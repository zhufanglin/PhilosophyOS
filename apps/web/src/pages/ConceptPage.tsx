import { ArrowRight, BookOpen, ChevronDown, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import kantPortrait from "../assets/philosophers/kant-becker.jpg";
import sartrePortrait from "../assets/philosophers/sartre-1967.jpg";
import socratesPortrait from "../assets/philosophers/socrates-louvre.jpg";
import "../concept.css";
import type { DailyQuestionView } from "./TodayPage";

export type ConceptTransitionRequest = {
  question: DailyQuestionView;
  philosopher: string;
  era: string;
  portraitUrl: string;
  portraitPosition: string;
  quote: string;
  quoteSource: string;
  originX: number;
  originY: number;
};

type ConceptPageProps = {
  onExit: () => void;
  onStart: (request: ConceptTransitionRequest) => void;
  transitionOrigin?: { x: number; y: number };
};

const propositions = [
  {
    code: "Q014",
    philosopher: "苏格拉底",
    era: "古希腊 · 公元前 5 世纪",
    field: "伦理学",
    question: "当诚实地生活必然带来损失时，我们仍有理由坚持诚实吗？",
    tension: "德性与结果",
    note: "不先寻找正确答案，而是辨认：你坚持诚实的理由，究竟来自它产生的结果，还是来自它本身。",
    portrait: socratesPortrait,
    position: "50% 24%",
    quote: "未经省察的人生是不值得过的。",
    quoteSource: "柏拉图《申辩篇》38a",
  },
  {
    code: "Q027",
    philosopher: "康德",
    era: "启蒙运动 · 18 世纪",
    field: "政治哲学",
    question: "一项法律获得多数人支持，是否就足以证明它是正当的？",
    tension: "合法性与正当性",
    note: "多数人的同意可以形成规则，但正当性还要求我们说明：这项规则是否能平等地适用于每一个人。",
    portrait: kantPortrait,
    position: "50% 18%",
    quote: "有两样东西，我们愈经常愈持久地加以思索，心中就愈充满常新而日增的惊奇和敬畏：我头上的星空和我心中的道德法则。",
    quoteSource: "《实践理性批判》结论",
  },
  {
    code: "Q041",
    philosopher: "萨特",
    era: "存在主义 · 20 世纪",
    field: "存在主义",
    question: "如果人的选择总受处境限制，我们仍能为自己成为什么样的人负责吗？",
    tension: "处境与自由",
    note: "自由并不意味着没有限制。今天的讨论从更困难的地方开始：人在限制之中仍然承担多少选择的责任。",
    portrait: sartrePortrait,
    position: "50% 42%",
    quote: "人被判定为自由。",
    quoteSource: "《存在主义是一种人道主义》",
  },
];

export function ConceptPage({ onExit, onStart, transitionOrigin }: ConceptPageProps) {
  const [propositionIndex, setPropositionIndex] = useState(0);
  const [isChanging, setIsChanging] = useState(false);
  const [isAnatomyVisible, setIsAnatomyVisible] = useState(false);
  const anatomyRef = useRef<HTMLElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const transitionTimer = useRef<number | null>(null);
  const proposition = propositions[propositionIndex];

  useEffect(() => {
    const anatomy = anatomyRef.current;
    if (!anatomy) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsAnatomyVisible(true);
        observer.disconnect();
      },
      { threshold: 0.18 },
    );
    observer.observe(anatomy);

    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
    }
  }, []);

  function showNextProposition() {
    if (isChanging) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPropositionIndex((current) => (current + 1) % propositions.length);
      return;
    }

    setIsChanging(true);
    transitionTimer.current = window.setTimeout(() => {
      setPropositionIndex((current) => (current + 1) % propositions.length);
      setIsChanging(false);
      transitionTimer.current = null;
    }, 180);
  }

  function beginThinking() {
    const buttonRect = startButtonRef.current?.getBoundingClientRect();
    const originX = (buttonRect?.left ?? window.innerWidth / 2) + (buttonRect?.width ?? 0) / 2;
    const originY = (buttonRect?.top ?? window.innerHeight / 2) + (buttonRect?.height ?? 0) / 2 + window.scrollY;

    onStart({
      question: {
        id: proposition.code.toLowerCase(),
        domain: proposition.field,
        difficulty: "进阶",
        era: proposition.era,
        prompt: proposition.question,
        tension: proposition.tension,
        philosopher: proposition.philosopher,
        source: "视觉参考页 · 审核问题库",
        portraitUrl: proposition.portrait,
      },
      philosopher: proposition.philosopher,
      era: proposition.era,
      portraitUrl: proposition.portrait,
      portraitPosition: proposition.position,
      quote: proposition.quote,
      quoteSource: proposition.quoteSource,
      originX,
      originY,
    });
  }

  const stageStyle = transitionOrigin
    ? ({
        "--concept-collapse-x": `${transitionOrigin.x}px`,
        "--concept-collapse-y": `${transitionOrigin.y}px`,
      } as CSSProperties)
    : undefined;

  return (
    <main
      className={`concept-page${transitionOrigin ? " is-departing" : ""}`}
      style={stageStyle}
      aria-busy={Boolean(transitionOrigin)}
    >
      <div className="concept-stage">
      <header className="concept-masthead">
        <a className="concept-brand" href="#today" aria-label="返回 PhilosophyOS 今日页">
          <span>Φ</span>
          <strong>PhilosophyOS</strong>
        </a>
        <p>VISUAL STUDY · EDITION 02</p>
        <button type="button" onClick={onExit} aria-label="关闭参考页面">
          <X size={18} />
          <span>返回当前版本</span>
        </button>
      </header>

      <section className={`concept-hero${isChanging ? " is-changing" : ""}`} aria-labelledby="concept-question">
        <aside className="concept-issue" aria-hidden="true">
          <span>01</span>
          <i />
          <small>DAILY PROPOSITION</small>
        </aside>

        <article className="concept-copy" key={`copy-${proposition.code}`}>
          <div className="concept-taxonomy">
            <span>{proposition.field}</span>
            <span>{proposition.era}</span>
            <span>{proposition.code}</span>
          </div>
          <p className="concept-kicker">今日命题 / PROPOSITION OF THE DAY</p>
          <h1 id="concept-question">{proposition.question}</h1>
          <p className="concept-deck">{proposition.note}</p>
          <dl className="concept-tension">
            <div>
              <dt>核心张力</dt>
              <dd>{proposition.tension}</dd>
            </div>
            <div>
              <dt>建议时间</dt>
              <dd>12 分钟 · 5 轮追问</dd>
            </div>
          </dl>
          <div className="concept-actions">
            <button
              ref={startButtonRef}
              className="concept-primary"
              type="button"
              onClick={beginThinking}
              disabled={Boolean(transitionOrigin)}
            >
              开始思考 <ArrowRight size={18} />
            </button>
            <button className="concept-secondary" type="button" onClick={showNextProposition} disabled={isChanging}>
              <RefreshCw size={16} /> 换一个命题
            </button>
          </div>
        </article>

        <figure className="concept-portrait" key={`portrait-${proposition.code}`}>
          <div className="concept-image-frame">
            <img
              src={proposition.portrait}
              alt={`${proposition.philosopher}肖像`}
              style={{ objectPosition: proposition.position }}
            />
            <span>PUBLIC DOMAIN</span>
          </div>
          <figcaption>
            <span>FIG. {proposition.code.slice(1)}</span>
            <strong>{proposition.philosopher}</strong>
            <small>{proposition.era}</small>
          </figcaption>
        </figure>
      </section>

      <div className="concept-scroll-cue" aria-hidden="true">
        <span>进入论证结构</span>
        <ChevronDown size={17} />
      </div>

      <section
        ref={anatomyRef}
        className={`concept-anatomy${isAnatomyVisible ? " is-visible" : ""}`}
        aria-labelledby="concept-anatomy-title"
      >
        <header>
          <p>RESEARCH NOTES / 01—03</p>
          <h2 id="concept-anatomy-title">不是聊天，而是一场逐步形成的论证。</h2>
        </header>
        <div className="concept-note-grid">
          <article>
            <span>01</span>
            <BookOpen size={19} />
            <h3>先写下直觉</h3>
            <p>保留未经修饰的第一判断，作为之后检验理由的起点。</p>
          </article>
          <article>
            <span>02</span>
            <BookOpen size={19} />
            <h3>寻找反例</h3>
            <p>用思想实验暴露判断的边界，而不是立刻接受系统给出的结论。</p>
          </article>
          <article>
            <span>03</span>
            <BookOpen size={19} />
            <h3>形成自己的命题</h3>
            <p>区分你的观点、哲学家的论证与 AI 的整理建议。</p>
          </article>
        </div>
      </section>
      </div>
    </main>
  );
}
