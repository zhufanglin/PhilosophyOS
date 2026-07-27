import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import kantPortrait from "../assets/philosophers/kant-becker.jpg";
import sartrePortrait from "../assets/philosophers/sartre-1967.jpg";
import socratesPortrait from "../assets/philosophers/socrates-louvre.jpg";

export type DailyQuestionView = {
  id: string;
  domain: string;
  difficulty: "入门" | "进阶";
  era: string;
  prompt: string;
  tension: string;
  philosopher: string;
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
    prompt: "当诚实地生活必然带来损失时，我们仍有理由坚持诚实吗？",
    tension: "德性与结果",
    philosopher: "苏格拉底",
    source: "审核问题库 · 30 天内未出现",
    portraitUrl: socratesPortrait,
  },
  {
    id: "q027",
    domain: "政治哲学",
    difficulty: "入门",
    era: "启蒙运动",
    prompt: "一项法律获得多数人支持，是否就足以证明它是正当的？",
    tension: "合法性与正当性",
    philosopher: "康德",
    source: "审核问题库 · 30 天内未出现",
    portraitUrl: kantPortrait,
  },
  {
    id: "q041",
    domain: "存在主义",
    difficulty: "进阶",
    era: "20 世纪",
    prompt: "如果人的选择总受处境限制，我们仍能为自己成为什么样的人负责吗？",
    tension: "处境与自由",
    philosopher: "萨特",
    source: "审核问题库 · 30 天内未出现",
    portraitUrl: sartrePortrait,
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
          <figcaption>
            <span>PORTRAIT / {question.id.toUpperCase()}</span>
            <strong>{question.philosopher}</strong>
            <small>{question.era}</small>
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
