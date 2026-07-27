import {
  ArrowLeft,
  BookOpen,
  Columns3,
  GitCompareArrows,
  Lightbulb,
  ListTree,
  RotateCcw,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { DialogueOutline, OutlineStep } from "../components/DialogueOutline";
import { ReflectionReview } from "../components/ReflectionReview";
import { DialogueSource, SourceDrawer } from "../components/SourceDrawer";
import { DailyQuestionView } from "./TodayPage";

type DialogueMode = "socratic" | "explain" | "compare" | "reflect" | "organize";
export type ModelProfile = "free" | "gpt" | "deepseek";

type DialoguePageProps = {
  apiBaseUrl: string;
  question: DailyQuestionView;
  modelProfile: ModelProfile;
  onBack: () => void;
};

type Message = {
  id: number;
  role: "assistant" | "user";
  body: string;
  mode?: DialogueMode;
};

type ProgressFlight = {
  id: number;
  fromX: number;
  fromY: number;
  deltaX: number;
  deltaY: number;
};

type DialogueTurnResponse = {
  mode: DialogueMode;
  assistant_message: string;
  model_profile: ModelProfile;
  provider_model: string | null;
};

type PendingDialogueTurn = {
  answer: string;
  mode: DialogueMode;
  turnNumber: number;
};

const modes = [
  { id: "socratic" as const, label: "追问", icon: Sparkles },
  { id: "explain" as const, label: "解释", icon: Lightbulb },
  { id: "compare" as const, label: "比较", icon: GitCompareArrows },
  { id: "reflect" as const, label: "反思", icon: Columns3 },
  { id: "organize" as const, label: "整理", icon: ListTree },
];

const sources: DialogueSource[] = [
  {
    id: "plato-apology",
    kind: "原典",
    title: "Apology",
    author: "Plato",
    locator: "28b–38a",
    summary: "苏格拉底为未经省察的生活、德性与城邦义务之间的关系进行辩护。",
  },
  {
    id: "sep-socrates",
    kind: "研究解释",
    title: "Socrates",
    author: "Stanford Encyclopedia of Philosophy",
    locator: "Ethics section",
    summary: "梳理苏格拉底式省察、德性知识与坚持正当行动之间的联系。",
    url: "https://plato.stanford.edu/entries/socrates/",
  },
];

function isDialogueTurnResponse(value: unknown): value is DialogueTurnResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DialogueTurnResponse>;
  return (
    typeof candidate.assistant_message === "string" &&
    modes.some((item) => item.id === candidate.mode)
  );
}

export function DialoguePage({ apiBaseUrl, question, modelProfile, onBack }: DialoguePageProps) {
  const [mode, setMode] = useState<DialogueMode>("socratic");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      mode: "socratic",
      body: `先给出你的直觉判断。面对“${question.tension}”，你目前更倾向哪一方？为什么？`,
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [failedTurn, setFailedTurn] = useState<PendingDialogueTurn | null>(null);
  const [progressFlight, setProgressFlight] = useState<ProgressFlight | null>(null);
  const [pulseStepId, setPulseStepId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const progressTimer = useRef<number | null>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => () => {
    if (progressTimer.current !== null) window.clearTimeout(progressTimer.current);
  }, []);

  const outline = useMemo<OutlineStep[]>(() => {
    const userTurns = messages.filter((message) => message.role === "user").length;
    return [
      { id: "intuition", label: "直觉判断", detail: "先说你倾向的答案", state: userTurns > 0 ? "complete" : "current" },
      { id: "reason", label: "检验理由", detail: "寻找最关键的依据", state: userTurns > 0 ? (userTurns > 1 ? "complete" : "current") : "upcoming" },
      { id: "boundary", label: "概念边界", detail: "用反例测试判断", state: userTurns > 1 ? "current" : "upcoming" },
      { id: "summary", label: "整理观点", detail: "结束后由你确认", state: finished ? "complete" : "upcoming" },
    ];
  }, [finished, messages]);

  function animateProgressTo(nextStepId: string) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const start = sendButtonRef.current?.getBoundingClientRect();
      const target = document.querySelector(`[data-step-id="${nextStepId}"] .outline-marker`)?.getBoundingClientRect();
      if (start && target) {
        const fromX = start.left + start.width / 2;
        const fromY = start.top + start.height / 2;
        setProgressFlight({
          id: Date.now(),
          fromX,
          fromY,
          deltaX: target.left + target.width / 2 - fromX,
          deltaY: target.top + target.height / 2 - fromY,
        });
        setPulseStepId(nextStepId);
        if (progressTimer.current !== null) window.clearTimeout(progressTimer.current);
        progressTimer.current = window.setTimeout(() => {
          setProgressFlight(null);
          setPulseStepId(null);
          progressTimer.current = null;
        }, 820);
      }
  }

  async function requestAssistantTurn(turn: PendingDialogueTurn) {
    const response = await fetch(`${apiBaseUrl}/api/v1/dialogue-turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_message: turn.answer,
        current_mode: turn.mode,
        requested_mode: turn.mode,
        model_profile: modelProfile,
        topic: question.prompt,
        turn_number: turn.turnNumber,
      }),
    });
    if (!response.ok) {
      throw new Error(`Dialogue API returned ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isDialogueTurnResponse(payload)) {
      throw new Error("Dialogue API returned an invalid response");
    }

    setMessages((current) => {
      const nextId = Math.max(...current.map((message) => message.id)) + 1;
      return [
        ...current,
        { id: nextId, role: "assistant", body: payload.assistant_message, mode: payload.mode },
      ];
    });
    setMode(payload.mode);
    setFailedTurn(null);
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = draft.trim();
    if (!answer || thinking || finished) return;

    const nextId = Math.max(...messages.map((message) => message.id)) + 1;
    const userTurns = messages.filter((message) => message.role === "user").length;
    const nextStepId = userTurns === 0 ? "reason" : userTurns === 1 ? "boundary" : "summary";
    const pendingTurn = { answer, mode, turnNumber: userTurns + 1 };
    setMessages((current) => [...current, { id: nextId, role: "user", body: answer }]);
    setDraft("");
    setFailedTurn(null);
    setThinking(true);

    animateProgressTo(nextStepId);
    try {
      await requestAssistantTurn(pendingTurn);
    } catch {
      setFailedTurn(pendingTurn);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }

  async function retryFailedTurn() {
    if (!failedTurn || thinking || finished) return;
    setThinking(true);
    try {
      await requestAssistantTurn(failedTurn);
    } catch {
      setFailedTurn(failedTurn);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }

  function finishDialogue() {
    setFinished(true);
    setReviewing(true);
  }

  if (reviewing) {
    return (
      <ReflectionReview
        question={question.prompt}
        userStatements={messages.filter((message) => message.role === "user").map((message) => message.body)}
        onBack={() => {
          setFinished(false);
          setReviewing(false);
        }}
        onReturnToday={onBack}
      />
    );
  }

  return (
    <main className="dialogue-page" id="dialogue">
      <header className="dialogue-header">
        <div className="dialogue-header-toolbar">
          <button className="icon-button" type="button" onClick={onBack} aria-label="返回今日" title="返回今日">
            <ArrowLeft size={20} />
          </button>
          <span>思考工作台</span>
          <div className="dialogue-header-actions">
            <button className="secondary-button source-trigger" type="button" onClick={() => setSourcesOpen(true)}>
              <BookOpen size={17} /> 来源 <span>{sources.length}</span>
            </button>
            <button className="secondary-button finish-button" type="button" onClick={finishDialogue} disabled={finished}>
              <Square size={15} /> {finished ? "已结束" : "结束"}
            </button>
          </div>
        </div>

        <div className="dialogue-question-title">
          <span>{question.domain} · {question.difficulty}</span>
          <h1>{question.prompt}</h1>
        </div>

        <div className="mode-bar" aria-label="对话模式">
          <span>研究方法</span>
          <div className="mode-control" role="group" aria-label="选择对话方式">
            {modes.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={mode === item.id ? "active" : ""}
                  type="button"
                  key={item.id}
                  aria-pressed={mode === item.id}
                  onClick={() => setMode(item.id)}
                >
                  <Icon size={15} /> {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="dialogue-workspace">
        <DialogueOutline steps={outline} pulseStepId={pulseStepId} />
        <section className="conversation" aria-label="哲学对话">
          <div className="message-list" aria-live="polite">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-label">
                  <span aria-hidden="true">{message.role === "assistant" ? "Φ" : "你"}</span>
                  <div>
                    <strong>{message.role === "assistant" ? "哲学引导" : "研究者"}</strong>
                    <small>
                      {message.role === "assistant"
                        ? `PhilosophyOS · ${modes.find((item) => item.id === message.mode)?.label ?? "回应"}`
                        : "个人论证 · 本轮记录"}
                    </small>
                  </div>
                </div>
                <div className="message-argument">
                  <p>{message.body}</p>
                </div>
              </article>
            ))}
            {thinking ? <div className="thinking-state"><span /><span /><span /> 正在整理这一点</div> : null}
            {failedTurn ? (
              <div className="dialogue-retry-notice" role="status">
                <div>
                  <strong>这一轮暂时没有连上后端</strong>
                  <p>你的回答已经保留。可以稍后重试，系统只会重新请求哲学引导，不会重复记录你的发言。</p>
                </div>
                <button type="button" onClick={retryFailedTurn} disabled={thinking || finished}>
                  <RotateCcw size={15} /> 重试
                </button>
              </div>
            ) : null}
            {finished ? <div className="dialogue-complete">本轮对话已整理，下一步将确认哪些内容属于你的观点。</div> : null}
          </div>

          <form className="dialogue-composer" onSubmit={submitAnswer}>
            <label htmlFor="dialogue-answer">你的回答</label>
            <textarea
              id="dialogue-answer"
              ref={inputRef}
              rows={3}
              value={draft}
              disabled={finished}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={finished ? "本轮对话已结束" : "写下你的判断或理由…"}
            />
            <div>
              <span>{draft.length}/2000</span>
              <button ref={sendButtonRef} className="send-button" type="submit" disabled={!draft.trim() || thinking || finished} aria-label="发送回答" title="发送回答">
                <Send size={18} />
              </button>
            </div>
          </form>
        </section>
      </div>

      {progressFlight ? (
        <span
          className="dialogue-progress-flight"
          key={progressFlight.id}
          style={{
            "--flight-from-x": `${progressFlight.fromX}px`,
            "--flight-from-y": `${progressFlight.fromY}px`,
            "--flight-delta-x": `${progressFlight.deltaX}px`,
            "--flight-delta-y": `${progressFlight.deltaY}px`,
          } as CSSProperties}
          aria-hidden="true"
        />
      ) : null}

      <SourceDrawer open={sourcesOpen} sources={sources} onClose={() => setSourcesOpen(false)} />
    </main>
  );
}
