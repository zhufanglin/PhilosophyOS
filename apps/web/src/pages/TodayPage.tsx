import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import kantPortrait from "../assets/philosophers/kant-becker.jpg";
import sartrePortrait from "../assets/philosophers/sartre-cutout.png";
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
};

type TodayPageProps = {
  onStart: (question: DailyQuestionView) => void;
};

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

export function TodayPage({ onStart }: TodayPageProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = questions[questionIndex];
  const todayLabel = formatToday(new Date());
  const portraitTags = question.tags ?? [question.domain, question.tension, question.era];

  function chooseAnotherQuestion() {
    setQuestionIndex((current) => (current + 1) % questions.length);
  }

  return (
    <main className="today-page" id="today">
      <header className="today-heading">
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

      <section className="daily-question" aria-labelledby="daily-question-title">
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
            <span>DAILY QUESTION</span>
            <span>{question.id.toUpperCase()}</span>
          </div>
          <div className="question-tags" aria-label="问题分类">
            <span>{question.domain}</span>
            <span>{question.difficulty}</span>
            <span>{question.era}</span>
          </div>
          <h1 id="daily-question-title">{question.prompt}</h1>
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
            <button className="primary-button start-button" type="button" onClick={() => onStart(question)}>
              开始思考 <ArrowRight size={18} />
            </button>
            <button className="secondary-button" type="button" onClick={chooseAnotherQuestion}>
              <RefreshCw size={17} /> 换一题
            </button>
          </div>
        </article>
      </section>

      <section className="today-product-narrative" aria-label="PhilosophyOS 工作流程">
        <div className="narrative-header">
          <span>PHILOSOPHYOS / METHOD</span>
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
          <span>CONTINUE / 01</span>
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
