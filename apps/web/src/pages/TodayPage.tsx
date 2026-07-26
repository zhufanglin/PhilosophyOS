import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

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
    portraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/b/bc/Socrate_du_Louvre.jpg",
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
    portraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/f/f2/Kant_gemaelde_3.jpg",
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
    portraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/e/ef/Sartre_1967_crop.jpg",
  },
];

export function TodayPage({ onStart }: TodayPageProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = questions[questionIndex];

  function chooseAnotherQuestion() {
    setQuestionIndex((current) => (current + 1) % questions.length);
  }

  return (
    <main className="today-page" id="today">
      <header className="page-heading today-heading">
        <div>
          <p className="section-kicker">2026 年 7 月 26 日 · 星期日</p>
          <h1>今日思考</h1>
          <p>留一点时间，把一个判断想得更清楚。</p>
        </div>
        <div className="daily-meta" aria-label="今日练习状态">
          <span><Clock3 size={16} /> 约 12 分钟</span>
          <span><ShieldCheck size={16} /> 审核题目</span>
        </div>
      </header>

      <section className="daily-question" aria-labelledby="daily-question-title">
        <div className="question-portrait" aria-hidden="true">
          <img src={question.portraitUrl} alt="" />
          <span>{question.philosopher}</span>
        </div>

        <div className="daily-question-copy">
          <div className="question-tags" aria-label="问题分类">
            <span>{question.domain}</span>
            <span>{question.difficulty}</span>
            <span>{question.era}</span>
          </div>
          <p className="section-kicker">TODAY'S QUESTION</p>
          <h2 id="daily-question-title">{question.prompt}</h2>
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
        </div>
      </section>

      <section className="today-footnote" aria-label="最近进度">
        <BookOpenCheck size={19} />
        <div>
          <strong>上一次：自由与因果</strong>
          <span>已完成 4 轮追问，观点等待确认</span>
        </div>
        <span className="progress-value">4 / 5</span>
      </section>
    </main>
  );
}
