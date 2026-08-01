import { FormEvent, useState } from "react";

import {
  CitationPanel,
  CitationSummary,
  EvidenceCategory,
  evidenceLabel,
} from "../components/CitationPanel";

type AnswerStatus = "supported" | "corrected" | "insufficient" | "exploratory";

type AnswerClaim = {
  text: string;
  category: EvidenceCategory;
  citation_ids: string[];
};

type KnowledgeAnswer = {
  question: string;
  status: AnswerStatus;
  answer: string;
  correction: string | null;
  evidence_note: string;
  claims: AnswerClaim[];
  citations: CitationSummary[];
};

type ExplorePageProps = {
  apiBaseUrl: string;
};

const examples = [
  "康德如何区分自然因果与实践自由？",
  "斯宾诺莎的自由是否只是认识必然？",
  "尼采在《存在与时间》哪里谈自由？",
];

const statusCopy: Record<AnswerStatus, { title: string; label: string }> = {
  supported: { title: "已有审核来源支持", label: "证据充分" },
  corrected: { title: "已先纠正问题前提", label: "归属纠正" },
  insufficient: { title: "当前资料不足", label: "明确降级" },
  exploratory: { title: "AI 探索性引导", label: "未完全验证" },
};

export function ExplorePage({ apiBaseUrl }: ExplorePageProps) {
  const [question, setQuestion] = useState(examples[1]);
  const [answer, setAnswer] = useState<KnowledgeAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (normalizedQuestion.length < 2) {
      setError("请先输入一个具体哲学问题。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/knowledge-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: normalizedQuestion }),
      });
      if (!response.ok) {
        throw new Error(`知识接口返回 ${response.status}`);
      }
      setAnswer((await response.json()) as KnowledgeAnswer);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法查询知识库");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="explore-page">
      <section className="explore-hero" aria-labelledby="explore-title">
        <div>
          <p className="eyebrow">可信知识探索 · WESTERN PHILOSOPHY</p>
          <h1 id="explore-title">先核对来源，再形成理解。</h1>
          <p className="intro">
            首批支持康德、斯宾诺莎和尼采。每条回答都会区分原典、研究解释与 AI
            整理；证据不足时会调用你配置的模型 API 给出探索性引导，并明确标注未验证。
          </p>
        </div>

        <form className="question-card" onSubmit={submitQuestion}>
          <label htmlFor="knowledge-question">你想澄清什么问题？</label>
          <textarea
            id="knowledge-question"
            value={question}
            rows={3}
            maxLength={1000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：斯宾诺莎如何理解自由？"
          />
          <div className="question-actions">
            <span>{question.length}/1000</span>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "正在核对来源…" : "查询审核知识库"}
            </button>
          </div>
        </form>

        <div className="example-row" aria-label="示例问题">
          <span>试试：</span>
          {examples.map((example) => (
            <button type="button" key={example} onClick={() => setQuestion(example)}>
              {example}
            </button>
          ))}
        </div>
        {error ? <p className="request-error" role="alert">{error}</p> : null}
      </section>

      {answer ? (
        <section className="answer-grid" aria-live="polite">
          <article className="answer-card">
            <div className={`evidence-status ${answer.status}`}>
              <span>{statusCopy[answer.status].label}</span>
              <strong>{statusCopy[answer.status].title}</strong>
            </div>

            <div className="section-heading">
              <div>
                <p className="section-kicker">QUESTION</p>
                <h2>{answer.question}</h2>
              </div>
            </div>

            {answer.correction ? (
              <aside className="correction-note">
                <span>前提纠正</span>
                <strong>{answer.correction}</strong>
              </aside>
            ) : null}

            <div className="answer-copy">
              <p>{answer.answer}</p>
            </div>

            {answer.claims.length > 0 ? (
              <section className="claim-section" aria-labelledby="claim-title">
                <p className="section-kicker">CLAIMS</p>
                <h3 id="claim-title">逐条证据</h3>
                <ol className="claim-list">
                  {answer.claims.map((claim) => (
                    <li key={`${claim.text}-${claim.category}`}>
                      <span className={`claim-kind ${claim.category}`}>
                        {evidenceLabel(claim.category)}
                      </span>
                      <p>{claim.text}</p>
                      <small>证据：{claim.citation_ids.join(" · ")}</small>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <div className="evidence-note">
              <span aria-hidden="true">i</span>
              <p>{answer.evidence_note}</p>
            </div>
          </article>

          <CitationPanel apiBaseUrl={apiBaseUrl} citations={answer.citations} />
        </section>
      ) : (
        <section className="empty-answer" aria-label="知识库说明">
          <div className="empty-mark">Φ</div>
          <div>
            <h2>回答不会先于证据出现。</h2>
            <p>选择一个示例或输入问题，系统会先检查人物、著作和可用来源。</p>
          </div>
        </section>
      )}
    </main>
  );
}
